// Server Component — no 'use client' directive (Req 7.5, 8.3).
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import {
  getAdjacentImageIds,
  getImageWithObjects,
  type GalleryFilter,
} from '@/lib/amplify/gallery';
import { parseQueryState, toSearchParams, type QueryState } from '@/lib/gallery/query-state';
import { BoundingBoxLayer } from '@/components/bears/bounding-box-layer';
import { ImageNav } from '@/components/images/image-nav';

export const metadata: Metadata = {
  title: 'Image — BearCam Companion',
};

/**
 * `sizes` attribute for the full detail image (Req 8.4). The image is laid out
 * in a centered content column capped at the `3xl` container width (≈48rem of
 * image at desktop) and spans the full viewport on small screens, so Next.js is
 * told to request a source sized to the viewport below that cap and to the
 * capped column width above it.
 */
const DETAIL_IMAGE_SIZES = '(min-width: 768px) 768px, 100vw';

/**
 * Build the AppSync-shaped `GalleryFilter` from the normalized Query_State so
 * adjacency is resolved under the exact same filter/order that produced the
 * originating Image_Grid (Req 5.2, 5.3). The `year` number is expanded into the
 * inclusive UTC bounds `[year-01-01T00:00:00.000Z, year-12-31T23:59:59.999Z]`,
 * matching `isInUtcYear` and the gallery page's conversion (Req 2.5).
 */
function toGalleryFilter(state: QueryState): GalleryFilter {
  const yearRange =
    state.year !== null
      ? {
          fromIso: new Date(Date.UTC(state.year, 0, 1, 0, 0, 0, 0)).toISOString(),
          toIso: new Date(Date.UTC(state.year, 11, 31, 23, 59, 59, 999)).toISOString(),
        }
      : null;

  return {
    camFeed: state.feed,
    yearRange,
    bears: state.bears,
    q: state.q,
  };
}

/**
 * Format an Image `date` (an ISO datetime string, possibly null) for display in
 * the detail metadata. Falls back to an em dash when missing or unparseable so
 * the page never renders a broken value.
 */
function formatDetailDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ImageDetailProps = {
  /** Dynamic route segment: the requested Image id. */
  params: { id: string };
  /** The Query_State carried forward from the Gallery_Page (Req 6.2). */
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * Image_Detail_Page at `/images/[id]` (ImageDetail).
 *
 * Server Component (default export): the full fetch runs server-side (Req 7.5,
 * 8.3). It reads one Image and its Objects via the public, read-only
 * `getImageWithObjects` helper (Req 4.1, 7.1–7.3) and renders a Next.js 404 via
 * `notFound()` when no record exists (Req 4.6). The full snapshot is rendered
 * with the Next.js `<Image>` component (Req 4.1, 8.4), with the client-side
 * `BoundingBoxLayer` overlaid absolutely to draw one box per Bear_Object over
 * the rendered image (Req 4.3). The Image `date` and `camFeed` are shown as
 * metadata (Req 4.7).
 *
 * Previous/next navigation is fed by `getAdjacentImageIds`, resolved under the
 * Query_State carried forward in `searchParams` (Req 5.1, 5.2, 5.3), and that
 * same Query_State is carried onto both navigation targets unchanged so a
 * return to the gallery restores identical filters, search, and pagination
 * (Req 5.6, 6.2).
 */
export default async function ImageDetail({
  params,
  searchParams,
}: ImageDetailProps): Promise<React.JSX.Element> {
  const image = await getImageWithObjects(params.id);
  if (image === null) {
    notFound();
  }

  // Normalize the carried-forward Query_State and serialize it back unchanged
  // so navigation targets preserve it exactly (Req 5.6, 6.2).
  const state = parseQueryState(searchParams);
  const query = toSearchParams(state).toString();

  // Resolve adjacency under the same filter/order as the originating grid
  // (Req 5.2, 5.3). The helper returns null on either edge (Req 5.4, 5.5) and
  // null on both sides on a read failure, which surfaces as the ImageNav error
  // indication (Req 5.7).
  const { newerId, olderId } = await getAdjacentImageIds(toGalleryFilter(state), image.id);

  const { url, date, camFeed, objects } = image;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <div className="relative w-full overflow-hidden rounded-lg bg-muted">
        {url ? (
          <Image
            src={url}
            alt={`${camFeed ?? 'Webcam'} snapshot from ${formatDetailDate(date)}`}
            width={1280}
            height={720}
            sizes={DETAIL_IMAGE_SIZES}
            unoptimized
            priority
            className="h-auto w-full object-contain"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}

        {/* Bear-only bounding box overlays, positioned over the rendered image
            (Req 4.2, 4.3). Renders zero overlays when there are no Bear objects. */}
        <BoundingBoxLayer objects={objects} />
      </div>

      {/* Image metadata (Req 4.7). */}
      <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <dt className="font-medium text-foreground">Feed</dt>
          <dd className="text-muted-foreground">{camFeed ?? '—'}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="font-medium text-foreground">Date</dt>
          <dd className="text-muted-foreground">{formatDetailDate(date)}</dd>
        </div>
      </dl>

      {/* Previous/next navigation carrying the Query_State forward (Req 5.1, 5.6). */}
      <ImageNav newerId={newerId} olderId={olderId} query={query} />
    </div>
  );
}
