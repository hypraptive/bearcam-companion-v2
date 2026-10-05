// Server Component — no 'use client' directive. App Router Suspense fallback
// shown while the Image_Detail_Page's server-side fetch is in flight.
import { ImageIcon } from 'lucide-react';

/**
 * Loading indicator for the Image_Detail_Page (`/images/[id]`).
 *
 * Default export consumed by Next.js as the route's Suspense boundary fallback.
 * Mirrors the detail page's layout — a large skeleton image box with a centered
 * icon, followed by metadata placeholders and a navigation placeholder — so the
 * transition to the loaded page does not shift layout. Renders no bounding box
 * overlays (there is no image to measure yet).
 */
export default function ImageDetailLoading(): React.JSX.Element {
  return (
    <div
      className="container mx-auto max-w-3xl px-4 py-6"
      role="status"
      aria-busy="true"
      aria-label="Loading image"
    >
      {/* Skeleton image box, same rounded/muted framing as the loaded image. */}
      <div className="relative flex aspect-video w-full animate-pulse items-center justify-center overflow-hidden rounded-lg bg-muted">
        <ImageIcon className="size-10 text-muted-foreground/40" aria-hidden="true" />
      </div>

      {/* Metadata placeholders (Feed / Date). */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>

      {/* Navigation placeholder. */}
      <div className="flex items-center justify-center gap-3 py-4">
        <div className="h-7 w-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-7 w-24 animate-pulse rounded-lg bg-muted" />
      </div>

      <span className="sr-only">Loading image…</span>
    </div>
  );
}
