// Grid loading indicator for the Gallery_Page (Req 1.8).
//
// Server Component (default export): the App Router renders this automatically
// as the Suspense fallback while the Gallery_Page's server-side data fetch is
// in flight. No 'use client' is needed — it is purely presentational.
//
// It mirrors the Image_Grid's responsive 1/2/3/4-column layout and the
// ImageCard shape (aspect-video thumbnail + a two-line metadata footer) with
// pulsing skeleton placeholders, so the loading state occupies the same space
// the real grid will and the transition to loaded content is visually stable.
import { PAGE_SIZE } from '@/lib/gallery/query-state';

/**
 * A single skeleton standing in for one ImageCard while the grid loads.
 * Shape-matches `ImageCard`: an aspect-video thumbnail block above a short
 * metadata footer, all rendered as muted, animated placeholders.
 */
function SkeletonCard(): React.JSX.Element {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-video w-full animate-pulse bg-muted" />
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-5 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  );
}

/**
 * Gallery_Page loading indicator (Req 1.8).
 *
 * Rendered by the App Router while Images are being retrieved for the
 * Image_Grid. Fills a full page of `PAGE_SIZE` skeleton cards in the same
 * responsive grid (1 col below `sm`, 2 at `sm`, 3 at `md`, 4 at `lg`) and
 * Tailwind gap classes as `ImageGrid`, so the layout does not shift when the
 * real images arrive.
 */
export default function GalleryLoading(): React.JSX.Element {
  return (
    <div className="container mx-auto flex flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">BearCam Companion</h1>
        <p className="text-sm text-muted-foreground">
          Browse webcam snapshots and crowd-sourced bear identifications.
        </p>
      </header>

      <div
        role="status"
        aria-busy="true"
        aria-label="Loading images"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
      >
        {Array.from({ length: PAGE_SIZE }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
        <span className="sr-only">Loading images…</span>
      </div>
    </div>
  );
}
