// Gallery_Page — Server Component (default export). No 'use client' directive:
// the initial data fetch runs server-side for a fast mobile first paint
// (Req 7.5, 8.3, 8.6); interactivity is confined to the client control
// wrappers (GalleryControls, GalleryPagination, ScrollRestorer).
import type { Metadata } from 'next';
import { GalleryControls } from '@/components/images/gallery-controls';
import { GalleryEmptyState, type GalleryEmptyStateVariant } from '@/components/images/gallery-empty-state';
import { GalleryPagination } from '@/components/images/gallery-pagination';
import { ImageGrid } from '@/components/images/image-grid';
import { ScrollRestorer } from '@/components/images/scroll-restorer';
import {
  getImagesForState,
  type ResolvedGalleryView,
} from '@/app/(public)/gallery-data';
import { listAvailableYears } from '@/lib/amplify/gallery';
import { parseQueryState, toSearchParams, type QueryState } from '@/lib/gallery/query-state';

export const metadata: Metadata = {
  title: 'Gallery — BearCam Companion',
};

/**
 * Next.js 14 passes already-decoded search params to a page as a plain record
 * of string | string[] | undefined, which is exactly the shape
 * `parseQueryState` consumes.
 */
type GalleryPageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * Choose the empty-state variant for a resolved view that has zero displayable
 * images (design Error Handling table):
 * - `page-beyond` — the requested page index was past the available data
 *   (Req 1.9); takes precedence because a visitor can simply step back.
 * - `no-match`    — filters/search are active and excluded everything
 *   (Req 1.10, 2.11, 3.5).
 * - `no-images`   — the archive itself is empty, with no filters/search active
 *   (Req 7.7).
 */
function emptyStateVariant(
  view: ResolvedGalleryView,
  state: QueryState,
): GalleryEmptyStateVariant {
  if (view.requestedPageEmpty && view.clampedPage > 1) return 'page-beyond';
  const filtersActive =
    state.year !== null || state.feed !== null || state.bears !== 'any' || state.q !== '';
  return filtersActive ? 'no-match' : 'no-images';
}

/**
 * Gallery_Page — the public, read-only landing gallery at `/`.
 *
 * Flow (Req 1.1, 1.2, 1.9, 1.10, 6.3, 6.4, 6.6, 7.5, 8.3):
 * 1. Parse `searchParams` into a normalized Query_State (`parseQueryState`),
 *    so a malformed URL degrades to the default view rather than erroring.
 * 2. Resolve the page: build the AppSync `GalleryFilter`, walk the cursor chain
 *    to the requested page, clamp the page to what actually exists, and fetch
 *    that page — all encapsulated in `getImagesForState`.
 * 3. Fetch the distinct available years for the year filter (`listAvailableYears`).
 * 4. Render the controls, then either the Image_Grid (when there are images) or
 *    a distinct empty-state (`GalleryEmptyState`), then pagination, then the
 *    scroll restorer keyed by the serialized Query_State so returning from a
 *    detail page lands back in place (Req 6.7).
 *
 * The clamped page is reflected back into the controls/pagination/scroll key so
 * an out-of-range `?page=` renders consistently at its clamped position
 * (Req 6.6) without a redirect.
 */
export default async function GalleryPage({
  searchParams,
}: GalleryPageProps): Promise<React.JSX.Element> {
  const requestedState = parseQueryState(searchParams);

  const [view, years] = await Promise.all([
    getImagesForState(requestedState),
    listAvailableYears(),
  ]);

  // The effective state reflects the clamped page so every control and the
  // scroll key agree on which page is actually rendered (Req 6.6).
  const effectiveState: QueryState = { ...requestedState, page: view.clampedPage };
  const scrollKey = toSearchParams(effectiveState).toString();

  const hasImages = view.images.length > 0;

  return (
    <div className="container mx-auto flex flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">BearCam Companion</h1>
        <p className="text-sm text-muted-foreground">
          Browse webcam snapshots and crowd-sourced bear identifications.
        </p>
      </header>

      <GalleryControls state={effectiveState} years={years} />

      {hasImages ? (
        <ImageGrid images={view.images} />
      ) : (
        <GalleryEmptyState variant={emptyStateVariant(view, effectiveState)} />
      )}

      <GalleryPagination
        page={effectiveState.page}
        hasNextPage={view.hasNextPage}
        hasPrevPage={effectiveState.page > 1}
      />

      <ScrollRestorer stateKey={scrollKey} />
    </div>
  );
}
