/**
 * Gallery search/filter logic — the pure predicates behind the gallery's
 * year, bear-presence, and bearList-search filters.
 *
 * Pure functions only: no Next.js, React, or browser imports, so this module is
 * independently unit- and property-testable (Req 6.1). These predicates are the
 * single source of truth for matching semantics and are reused by both the
 * client-side filter and any residual matching in the AppSync helpers.
 */

import type { CamFeed } from '@/lib/constants';
import type { BearPresence } from './query-state';

/**
 * Returns true iff at least one comma-delimited token of `bearList` contains
 * `term` as a case-insensitive substring. Matching never spans the comma
 * separator — each token is tested independently — so a term that would only
 * match by bridging two tokens across a comma never produces a match (Req 3.2).
 *
 * An empty/whitespace/undefined/null `bearList` never matches a non-empty term,
 * since it yields no non-empty tokens to search.
 *
 * This function focuses purely on the matching logic. The caller is responsible
 * for treating an empty/whitespace search as a *cleared* search (normalizing it
 * to `''` upstream via `normalizeSearchTerm`); the gallery's search flow only
 * ever calls this with a non-empty, trimmed `term`. If an empty `term` is passed
 * anyway, note that an empty string is trivially a substring of any token, so a
 * non-empty `bearList` would match — hence the normalize-upstream contract.
 */
export function bearListMatches(bearList: string | null | undefined, term: string): boolean {
  if (bearList === null || bearList === undefined) return false;
  const needle = term.toLowerCase();
  const tokens = bearList.split(',');
  return tokens.some((token) => token.toLowerCase().includes(needle));
}

/**
 * True iff the instant represented by `isoDate` falls within the inclusive UTC
 * range `[year-01-01T00:00:00.000Z, year-12-31T23:59:59.999Z]` (Req 2.5).
 * Null/undefined or unparseable dates return false.
 */
export function isInUtcYear(isoDate: string | null | undefined, year: number): boolean {
  if (isoDate === null || isoDate === undefined) return false;
  const ms = Date.parse(isoDate);
  if (Number.isNaN(ms)) return false;
  const start = Date.UTC(year, 0, 1, 0, 0, 0, 0);
  const end = Date.UTC(year, 11, 31, 23, 59, 59, 999);
  return ms >= start && ms <= end;
}

/**
 * Bear-presence predicate over a (possibly null) bearCount (Req 2.7–2.9):
 * - `'any'` always matches;
 * - `'with'` matches iff `bearCount >= 1`;
 * - `'without'` matches iff `bearCount === 0`.
 *
 * A null/undefined `bearCount` is treated as `0` (absence of bears): it matches
 * `'without'` and never matches `'with'`. This keeps `'with'`/`'without'`
 * mutually exclusive and jointly exhaustive over every input.
 */
export function matchesBearPresence(
  bearCount: number | null | undefined,
  bears: BearPresence,
): boolean {
  if (bears === 'any') return true;
  const count = bearCount ?? 0;
  if (bears === 'with') return count >= 1;
  // bears === 'without'
  return count === 0;
}

/**
 * QueryState-aligned filter shape for the in-memory `matchesFilter` predicate
 * (Req 2.10, 3.3).
 *
 * NOTE: There are intentionally two distinct `GalleryFilter` concerns in this
 * feature, kept separate on purpose:
 *   1. THIS shape (year: number | null, feed: CamFeed | null) mirrors the
 *      normalized `QueryState` and is used to filter already-materialized image
 *      records in memory.
 *   2. The AppSync-helper layer (task 8, `src/lib/amplify/gallery.ts`) defines a
 *      different `GalleryFilter` with a `yearRange`/`camFeed` shape tailored to
 *      the DynamoDB `between`/`eq` query predicates.
 * The two layers have different concerns — a UTC year number vs. precomputed ISO
 * bounds — so they deliberately do not share a type. This pure predicate stays
 * decoupled from the AppSync query shape.
 */
export type GalleryFilter = {
  year: number | null; // null = all years (inactive)
  feed: CamFeed | null; // null = all feeds (inactive)
  bears: BearPresence; // 'any' = inactive
  q: string; // '' (trimmed) = no search (inactive)
};

/**
 * Minimal structural view of an `Image` read by `matchesFilter`. Typed by the
 * fields it actually reads so the predicate works against the generated
 * `Schema['Image']['type']` (which is structurally compatible) without a hard
 * dependency on the Amplify data layer — keeping this module pure and
 * independently testable (Req 6.1).
 */
export type FilterableImage = {
  date: string | null | undefined;
  camFeed: CamFeed | null | undefined;
  bearCount: number | null | undefined;
  bearList: string | null | undefined;
};

/**
 * Combined gallery predicate: an image is included iff it passes the year AND
 * feed AND bear-presence AND search filters (Req 2.10, 3.3). Each inactive
 * filter is treated as always-true, so an all-default filter matches every
 * image:
 * - year: `null` → always true; otherwise reuse `isInUtcYear(date, year)`.
 * - feed: `null` → always true; otherwise exact `camFeed === feed` equality.
 * - bear-presence: reuse `matchesBearPresence(bearCount, bears)` ('any' is
 *   always true).
 * - search: trimmed `q === ''` → always true; otherwise reuse
 *   `bearListMatches(bearList, q)`.
 *
 * Pure composition of the existing predicates — no new matching semantics are
 * introduced here.
 */
export function matchesFilter(image: FilterableImage, filter: GalleryFilter): boolean {
  const yearOk = filter.year === null || isInUtcYear(image.date, filter.year);
  const feedOk = filter.feed === null || image.camFeed === filter.feed;
  const bearsOk = matchesBearPresence(image.bearCount, filter.bears);
  const searchOk = filter.q.trim() === '' || bearListMatches(image.bearList, filter.q);
  return yearOk && feedOk && bearsOk && searchOk;
}
