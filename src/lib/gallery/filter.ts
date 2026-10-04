/**
 * Gallery search/filter logic — the pure predicates behind the gallery's
 * year, bear-presence, and bearList-search filters.
 *
 * Pure functions only: no Next.js, React, or browser imports, so this module is
 * independently unit- and property-testable (Req 6.1). These predicates are the
 * single source of truth for matching semantics and are reused by both the
 * client-side filter and any residual matching in the AppSync helpers.
 */

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
