/**
 * AppSync gallery read helpers for the public, read-only image gallery.
 *
 * All gallery data access flows through this module (Req 7.1), always with
 * `authMode: 'apiKey'` (Req 7.2) and read-only operations only (Req 7.3, 7.4).
 *
 * This file (task 8.1) establishes the shared helper types and the
 * `GalleryFilter` → AppSync `buildFilter` translation. The list/cursor/detail/
 * adjacency helpers that consume these types are added in tasks 8.2–8.4.
 */

import type { CamFeed } from '@/lib/constants';
import { bearListMatches } from '@/lib/gallery/filter';
import { PAGE_SIZE, type BearPresence } from '@/lib/gallery/query-state';
import type { Schema } from '../../../amplify/data/resource';
import { client } from './client';

/**
 * The generated `Image` model type. Consumed from the Amplify schema — never
 * duplicated (conventions; Req 7 intent).
 */
export type ImageModel = Schema['Image']['type'];

/**
 * The generated `Object` model type (an AI-detected bounding box within an
 * Image). Consumed from the Amplify schema — never duplicated.
 */
export type ObjectModel = Schema['Object']['type'];

/**
 * One Image paired with its related Objects, as rendered on the
 * Image_Detail_Page (Req 4.1, 4.3). The `objects` array holds every detected
 * Object for the image; Bear-only overlay selection happens downstream in the
 * component layer.
 */
export type ImageWithObjects = ImageModel & {
  objects: ObjectModel[];
};

/**
 * A single resolved page of gallery images (Req 1.1, 1.5, 1.6, 1.9).
 */
export type ImagePage = {
  /** Up to `PAGE_SIZE` images, in `date desc / id desc` order. */
  images: ImageModel[];
  /** True iff a further non-empty page exists after this one (Req 1.5, 1.6). */
  hasNextPage: boolean;
  /** Cursor to the page after this one, or null when there is none. */
  nextToken: string | null;
  /** True iff the requested page index was beyond the available data (Req 1.9). */
  requestedPageEmpty: boolean;
};

/**
 * The AppSync-shaped filter produced from a normalized `QueryState`.
 *
 * Distinct from the in-memory `GalleryFilter` in `src/lib/gallery/filter.ts`:
 * that one mirrors the raw `QueryState` (a `year: number`) for client-side
 * predicate matching, while this one carries precomputed UTC ISO `yearRange`
 * bounds tailored to the DynamoDB `between` predicate. The two layers have
 * genuinely different shapes and deliberately do not share a type.
 */
export type GalleryFilter = {
  /** Active feed filter, or null for all feeds (Req 2.6). */
  camFeed: CamFeed | null;
  /** Precomputed inclusive UTC year bounds, or null for all years (Req 2.5). */
  yearRange: { fromIso: string; toIso: string } | null;
  /** Bear-presence filter: `'any' | 'with' | 'without'` (Req 2.7–2.9). */
  bears: BearPresence;
  /** Trimmed search term; `''` means no search (Req 3.2). */
  q: string;
};

/**
 * A single AppSync filter predicate leaf — a field name mapped to a comparison
 * operator and its operand. Kept loose on the operand type because operators
 * differ (`eq`/`ge`/`contains` take a scalar; `between` takes a 2-tuple).
 */
type FilterLeaf = Record<
  string,
  { eq: string } | { eq: number } | { ge: number } | { contains: string } | { between: [string, string] }
>;

/**
 * The AppSync `filter` argument shape: either a single leaf predicate or an
 * `and` of several leaves. An empty filter (no active dimensions) is `{}`,
 * which AppSync treats as "match all".
 */
export type AppSyncFilter = Record<string, never> | FilterLeaf | { and: FilterLeaf[] };

/**
 * Build the AppSync `filter` predicate from a `GalleryFilter`, combining every
 * active dimension with logical AND (Req 2.10, 3.3):
 *
 * - `camFeed` (non-null) → `camFeed eq <code>` (Req 2.6)
 * - `yearRange` (non-null) → `date between [fromIso, toIso]` (Req 2.5)
 * - `bears === 'with'` → `bearCount ge 1` (Req 2.7)
 * - `bears === 'without'` → `bearCount eq 0` (Req 2.8)
 * - `bears === 'any'` → omitted (Req 2.9)
 * - `q` (non-empty) → `bearList contains <term>` (Req 3.2 coarse pre-filter)
 *
 * The `bearList contains` leaf is only a coarse server-side pre-filter — it is
 * case-sensitive and can match across comma boundaries. The exact, comma-aware,
 * case-insensitive match is applied downstream via `bearListMatches` as a
 * residual filter on the returned page (see the `bearList` search caveat in the
 * design). This builder never relies on `contains` for correctness.
 *
 * When no dimension is active the result is `{}` ("match all"). A single active
 * dimension is returned as a bare leaf; two or more are wrapped in `{ and: [...] }`.
 */
export function buildFilter(f: GalleryFilter): AppSyncFilter {
  const leaves: FilterLeaf[] = [];

  if (f.camFeed !== null) {
    leaves.push({ camFeed: { eq: f.camFeed } });
  }

  if (f.yearRange !== null) {
    leaves.push({ date: { between: [f.yearRange.fromIso, f.yearRange.toIso] } });
  }

  if (f.bears === 'with') {
    leaves.push({ bearCount: { ge: 1 } });
  } else if (f.bears === 'without') {
    leaves.push({ bearCount: { eq: 0 } });
  }

  const term = f.q.trim();
  if (term !== '') {
    leaves.push({ bearList: { contains: term } });
  }

  if (leaves.length === 0) return {};
  if (leaves.length === 1) return leaves[0];
  return { and: leaves };
}

/**
 * Stable comparator implementing the gallery's canonical ordering: `date`
 * descending, with ties broken by `id` descending (Req 1.1).
 *
 * DynamoDB sorts only by its single sort key (`date`), so the `id desc`
 * tiebreak is reapplied here as a deterministic secondary sort within the
 * returned page. Null/undefined/unparseable `date`s sort to the end (treated as
 * the oldest), keeping the comparison total so `Array.prototype.sort` stays
 * stable and deterministic.
 */
function compareByDateDescIdDesc(a: ImageModel, b: ImageModel): number {
  const aMs = a.date != null ? Date.parse(a.date) : Number.NaN;
  const bMs = b.date != null ? Date.parse(b.date) : Number.NaN;
  const aValid = !Number.isNaN(aMs);
  const bValid = !Number.isNaN(bMs);

  if (aValid && bValid) {
    if (aMs !== bMs) return bMs - aMs; // date descending
  } else if (aValid !== bValid) {
    // Valid dates sort before invalid/missing ones (newest-first ordering).
    return aValid ? -1 : 1;
  }

  // date tie (or both invalid) → id descending.
  if (a.id < b.id) return 1;
  if (a.id > b.id) return -1;
  return 0;
}

/**
 * Fetch exactly one page of images under the active filter and ordering
 * (Req 1.1, 1.2, 1.5, 1.6, 1.9, 3.2).
 *
 * Reads through the Amplify data client with `authMode: 'apiKey'` (anonymous,
 * public read — Req 7.2) using a single read-only `list` (Req 7.3, 7.4) of at
 * most `PAGE_SIZE` records, advancing via the opaque `nextToken` cursor.
 *
 * This takes the design's documented scan + per-page stable-sort fallback: the
 * base `Image.list({ limit, nextToken, filter })` scan does not itself accept a
 * `sortDirection` argument (that belongs to the index query fields
 * `imagesByFeedAndDate` / `imagesByDate`), so newest-first ordering is enforced
 * entirely by the in-helper `(date desc, id desc)` stable sort below rather than
 * by the backend. This guarantees correct ordering within the fetched page; the
 * index-backed query fields remain the design's preferred primary path for
 * cross-page ordering (see the Secondary index dependency note in the design).
 *
 * Over the returned page the helper then:
 * 1. Applies the in-helper stable `(date desc, id desc)` sort (Req 1.1), the
 *    sole source of ordering for the fetched page under this fallback.
 * 2. Applies the exact `bearListMatches` residual search (Req 3.2) when a search
 *    term is active. The AppSync `bearList contains` leaf in `buildFilter` is a
 *    coarse, case-sensitive, comma-blind pre-filter only; `bearListMatches` is
 *    the authority for correctness, so it is reapplied here, comma-aware and
 *    case-insensitive, before the page is rendered (see the `bearList` search
 *    caveat in the design).
 *
 * Result fields:
 * - `images`: the sorted, residually filtered page (≤ `PAGE_SIZE`).
 * - `nextToken`: the backend cursor to the page after this one, or `null` when
 *   none remains.
 * - `hasNextPage`: true iff a further page exists, i.e. the backend returned a
 *   non-null cursor (Req 1.5, 1.6).
 * - `requestedPageEmpty`: true iff the requested page index was beyond the
 *   available data — the backend returned zero records for this cursor
 *   (Req 1.9).
 *
 * Note on the residual search and `hasNextPage`: the exact search is applied
 * over the already-fetched page and does not drive cursor advancement, so
 * `hasNextPage`/`nextToken` reflect the backend's own pagination over the
 * coarse filter. This matches the design, which applies `bearListMatches` as a
 * residual filter on the returned page rather than as a pagination driver.
 */
export async function listImagesPage(
  filter: GalleryFilter,
  token: string | null,
): Promise<ImagePage> {
  const { data, nextToken } = await client.models.Image.list({
    authMode: 'apiKey',
    limit: PAGE_SIZE,
    nextToken: token ?? undefined,
    filter: buildFilter(filter),
  });

  const raw = data ?? [];

  // Stable (date desc, id desc) sort over the returned page.
  const sorted = [...raw].sort(compareByDateDescIdDesc);

  // Exact, comma-aware, case-insensitive residual search (Req 3.2).
  const term = filter.q.trim();
  const images =
    term === '' ? sorted : sorted.filter((image) => bearListMatches(image.bearList, term));

  const resolvedNextToken = nextToken ?? null;

  return {
    images,
    hasNextPage: resolvedNextToken !== null,
    nextToken: resolvedNextToken,
    requestedPageEmpty: raw.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Detail + adjacency read helpers (task 8.4)
//
// Both helpers read through the shared Amplify data `client` (imported at the
// top of this file) with `authMode: 'apiKey'` (Req 7.2) and perform read-only
// operations only (Req 7.3, 7.4). They return typed results (`null` / plain
// objects) rather than letting raw GraphQL errors escape, so callers can map a
// known shape to a known UI state (see the design's Error Handling table).
// ---------------------------------------------------------------------------

/**
 * The selection set used to read one Image together with every related Object
 * for the Image_Detail_Page (Req 4.1, 4.3). Only the fields the detail view and
 * its bounding-box overlays consume are requested.
 */
const IMAGE_WITH_OBJECTS_SELECTION = [
  'id',
  'url',
  'date',
  's3Key',
  'bearCount',
  'bearList',
  'camFeed',
  'objects.id',
  'objects.label',
  'objects.confidence',
  'objects.width',
  'objects.height',
  'objects.left',
  'objects.top',
  'objects.consensusName',
  'objects.consensusConfidence',
  'objects.totalVotes',
] as const;

/**
 * Fetch exactly one Image and its related Objects by `id` (Req 4.1), using the
 * public API key (Req 7.2) and a read-only `get` (Req 7.3). Returns `null` when
 * no Image with that id exists (Req 4.6) so the caller can render a 404; also
 * returns `null` if the read errors, keeping raw GraphQL errors from escaping.
 *
 * The returned shape is `ImageWithObjects`: the Image fields plus a (possibly
 * empty) `objects` array. Bear-only overlay selection and label resolution
 * happen downstream in the component layer.
 */
export async function getImageWithObjects(id: string): Promise<ImageWithObjects | null> {
  const { data, errors } = await client.models.Image.get(
    { id },
    { authMode: 'apiKey', selectionSet: IMAGE_WITH_OBJECTS_SELECTION },
  );

  if (errors !== undefined && errors.length > 0) return null;
  if (data === null || data === undefined) return null;

  return data as unknown as ImageWithObjects;
}

/**
 * Resolve the ids of the images immediately newer and older than `currentId`
 * under the active ordering (`date desc, id desc`) and the active `filter`
 * (Req 5.2, 5.3), using the public API key (Req 7.2) and read-only `list`s
 * (Req 7.3).
 *
 * "Newer" is the neighbor that sorts immediately before `currentId` (more
 * recent); "older" sorts immediately after (less recent). A `null` on either
 * side means `currentId` is the newest/oldest edge under the active filter
 * (Req 5.4, 5.5).
 *
 * This follows the documented scan + per-page stable-sort fallback (see the
 * secondary-index note in `amplify/data/resource.ts`): it pages through every
 * Image matching the AppSync `filter`, applies the deterministic
 * `(date desc, id desc)` sort in-helper, then locates `currentId` and reads off
 * its neighbors. If the current id is not present under the filter (e.g. it was
 * excluded by the filter, or does not exist), both sides resolve to `null`.
 *
 * On a read error, both sides resolve to `null` so the detail page stays usable
 * and `ImageNav` can show its inline "adjacent image could not be loaded" state
 * (Req 5.7) without raw GraphQL errors escaping.
 */
export async function getAdjacentImageIds(
  filter: GalleryFilter,
  currentId: string,
): Promise<{ newerId: string | null; olderId: string | null }> {
  const none = { newerId: null, olderId: null };
  const appSyncFilter = buildFilter(filter);
  const images: ImageModel[] = [];

  try {
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof client.models.Image.list>> =
        await client.models.Image.list({
          authMode: 'apiKey',
          filter: appSyncFilter,
          nextToken: cursor ?? undefined,
        });
      if (page.errors !== undefined && page.errors.length > 0) return none;
      if (page.data !== null && page.data !== undefined) images.push(...page.data);
      cursor = page.nextToken ?? null;
    } while (cursor !== null);
  } catch {
    return none;
  }

  images.sort(compareByDateDescIdDesc);

  const index = images.findIndex((img) => img.id === currentId);
  if (index === -1) return none;

  const newerId = index > 0 ? images[index - 1].id : null;
  const olderId = index < images.length - 1 ? images[index + 1].id : null;
  return { newerId, olderId };
}

// ---------------------------------------------------------------------------
// Page-number → cursor resolution (task 8.3)
// ---------------------------------------------------------------------------

/**
 * Translate a 1-based `page` number into the AppSync `nextToken` cursor for
 * that page by walking the cursor chain forward from the first page under the
 * active `filter`/order (Req 6.6, 1.9).
 *
 * AppSync exposes no total count and no page-number addressing, so a page is
 * reached only by following `nextToken` from page 1:
 *
 * ```
 * page 1 → token null
 * page 2 → nextToken returned by page 1
 * page N → walk nextToken forward (N-1) times
 * ```
 *
 * The walk reuses {@link listImagesPage} so it goes through the same
 * `authMode: 'apiKey'`, read-only `list` path and the same filter/order and
 * residual-search semantics as the page the caller ultimately renders.
 *
 * Return shape:
 * - `token`: the cursor to pass to `listImagesPage` to fetch the requested
 *   page. `null` for page 1 (and for any `page <= 1`), or when the chain is
 *   exhausted before the requested page is reached (in which case it is the
 *   cursor of the last reachable page — i.e. `null` if even page 1 is the end).
 * - `lastPage`: the highest page index actually reachable before the chain
 *   returns no further cursor — used to clamp an out-of-range request (Req 6.6).
 *   Always at least 1, since page 1 is always addressable.
 * - `reachedRequested`: `true` iff a cursor for the requested page was
 *   materialized (the chain did not exhaust before it); `false` when the
 *   request was beyond the available data (Req 1.9).
 *
 * The walk short-circuits as soon as the chain exhausts, so the work is bounded
 * by `min(page, lastPage)` fetches rather than the full dataset (Req 1.9).
 */
export async function resolvePageCursor(
  filter: GalleryFilter,
  page: number,
): Promise<{ token: string | null; lastPage: number; reachedRequested: boolean }> {
  // Page 1 (and any non-positive request) is always addressable with a null
  // cursor; no walk is needed to reach it.
  if (page <= 1) {
    return { token: null, lastPage: 1, reachedRequested: true };
  }

  // `token` is the cursor for the page currently identified by `currentPage`.
  // We advance one page at a time until we either reach the requested page or
  // the chain exhausts.
  let token: string | null = null;
  let currentPage = 1;

  while (currentPage < page) {
    const { nextToken } = await listImagesPage(filter, token);

    // No further cursor: the chain is exhausted at `currentPage`, which is thus
    // the last reachable page. The requested page is beyond the data.
    if (nextToken === null) {
      return { token, lastPage: currentPage, reachedRequested: false };
    }

    // Advance to the next page: its cursor is the token we just received.
    token = nextToken;
    currentPage += 1;
  }

  // Loop exited with currentPage === page: the requested page's cursor is held
  // in `token`, and every page up to and including it is reachable.
  return { token, lastPage: page, reachedRequested: true };
}
