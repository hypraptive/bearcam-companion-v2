/**
 * Gallery_Page server-side data orchestration.
 *
 * Bridges the normalized Query_State (URL layer) to the AppSync gallery helpers
 * (`src/lib/amplify/gallery.ts`), encapsulating the three steps the page needs:
 * build the AppSync-shaped filter, resolve + clamp the requested page to a
 * cursor, and fetch that page. Kept out of `page.tsx` so the shaping logic is
 * independently unit-testable and the page stays declarative.
 *
 * Read-only: every call delegates to the apiKey, read-only helpers (Req 7.2,
 * 7.3, 7.4). This module performs no writes and defines no backend resources.
 */

import {
  clampPage,
  type QueryState,
} from '@/lib/gallery/query-state';
import {
  listImagesPage,
  resolvePageCursor,
  type GalleryFilter,
  type ImageModel,
} from '@/lib/amplify/gallery';

/**
 * Convert a normalized `QueryState` into the AppSync-shaped `GalleryFilter`
 * consumed by the gallery helpers.
 *
 * The only non-trivial conversion is `year` → `yearRange`: a calendar year is
 * expanded to its inclusive UTC bounds — Jan 1 `00:00:00.000` through Dec 31
 * `23:59:59.999` — matching the `isInUtcYear` semantics used everywhere else
 * (Req 2.5). `Date.UTC(...).toISOString()` yields the canonical `...Z` ISO
 * strings the DynamoDB `date between [from, to]` predicate expects. All other
 * fields map through unchanged; `page` is pagination state and is not part of
 * the filter.
 */
export function buildGalleryFilter(state: QueryState): GalleryFilter {
  const yearRange =
    state.year === null
      ? null
      : {
          fromIso: new Date(Date.UTC(state.year, 0, 1, 0, 0, 0, 0)).toISOString(),
          toIso: new Date(Date.UTC(state.year, 11, 31, 23, 59, 59, 999)).toISOString(),
        };

  return {
    camFeed: state.feed,
    yearRange,
    bears: state.bears,
    q: state.q,
  };
}

/**
 * The fully resolved gallery view for a given Query_State: the page of images
 * to render plus the flags the page needs to drive pagination and empty-state
 * selection.
 */
export type ResolvedGalleryView = {
  /** The images for the clamped page, in `date desc / id desc` order (≤ PAGE_SIZE). */
  images: ImageModel[];
  /** The page actually rendered after clamping the requested page (Req 6.6). */
  clampedPage: number;
  /** The highest page index reachable under the active filter. */
  lastPage: number;
  /** True iff a further page exists after the clamped page (Req 1.5, 1.6). */
  hasNextPage: boolean;
  /** True iff the resolved page yielded zero images because it was beyond the data (Req 1.9). */
  requestedPageEmpty: boolean;
};

/**
 * Resolve and fetch the gallery page for a Query_State (Req 1.1, 1.2, 6.6, 1.9).
 *
 * Steps:
 * 1. Build the AppSync filter from the Query_State.
 * 2. Walk the cursor chain to the requested `state.page` via `resolvePageCursor`,
 *    which also reports the highest reachable page (`lastPage`).
 * 3. Clamp the requested page into `[1, lastPage]` with `clampPage`. If clamping
 *    moved the page (the URL asked for a page beyond the data), re-resolve the
 *    cursor for the clamped page so the fetched page matches what is rendered —
 *    rather than showing an empty page for an out-of-range request (Req 6.6).
 * 4. Fetch that page with `listImagesPage`.
 *
 * The returned `clampedPage` is reflected back into the page's controls and
 * scroll key so an out-of-range `?page=` renders consistently at its clamped
 * position without a redirect.
 */
export async function getImagesForState(state: QueryState): Promise<ResolvedGalleryView> {
  const filter = buildGalleryFilter(state);

  const resolved = await resolvePageCursor(filter, state.page);
  const clampedPage = clampPage(state.page, resolved.lastPage);

  // If clamping changed the page, the originally resolved cursor points at a
  // page beyond the data; re-resolve for the clamped page so we fetch the real
  // last page instead of an empty one.
  const token =
    clampedPage === state.page
      ? resolved.token
      : (await resolvePageCursor(filter, clampedPage)).token;

  const page = await listImagesPage(filter, token);

  return {
    images: page.images,
    clampedPage,
    lastPage: resolved.lastPage,
    hasNextPage: page.hasNextPage,
    requestedPageEmpty: page.requestedPageEmpty,
  };
}
