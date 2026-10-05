'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

type ImageNavProps = {
  /**
   * The id of the Image immediately adjacent in the newer direction of the
   * active ordering, or `null` when the current Image is the newest edge
   * (Req 5.2, 5.4).
   */
  newerId: string | null;
  /**
   * The id of the Image immediately adjacent in the older direction of the
   * active ordering, or `null` when the current Image is the oldest edge
   * (Req 5.3, 5.5).
   */
  olderId: string | null;
  /**
   * The serialized Query_State query string (without a leading `?`) that
   * produced the originating Image_Grid. It is carried forward onto both
   * navigation targets unchanged so returning to the Gallery_Page restores
   * identical filters, search, and pagination (Req 5.6). An empty string means
   * the default, unfiltered state.
   */
  query: string;
  /**
   * When true, an adjacent Image could not be retrieved; an inline indication
   * is rendered and no navigation is offered beyond the already-resolved edges
   * (Req 5.7). The owning detail page sets this when `getAdjacentImageIds`
   * fails.
   */
  loadError?: boolean;
};

/**
 * Build the Image_Detail_Page href for an adjacent image, carrying the active
 * Query_State forward unchanged (Req 5.6). The query string is appended only
 * when non-empty so the default state produces a clean `/images/[id]`.
 */
function buildAdjacentHref(id: string, query: string): string {
  return query ? `/images/${id}?${query}` : `/images/${id}`;
}

/**
 * Previous/next navigation between adjacent images on the Image_Detail_Page
 * (ImageNav).
 *
 * Client Component: renders a next-image control (newer direction) and a
 * previous-image control (older direction) (Req 5.1). When an adjacent id is
 * present, the control is a Next.js `<Link>` to `/images/[id]?<query>` carrying
 * the Query_State forward unchanged (Req 5.6). When an adjacent id is `null`,
 * that edge is disabled: it renders a non-interactive, visually muted control
 * that performs no navigation and triggers no data request (Req 5.4, 5.5).
 * When an adjacent image cannot be loaded, an inline indication is shown while
 * the current detail page remains unchanged (Req 5.7).
 */
export function ImageNav({
  newerId,
  olderId,
  query,
  loadError = false,
}: ImageNavProps): React.JSX.Element {
  const disabledClassName = cn(
    buttonVariants({ variant: 'outline', size: 'sm' }),
    'pointer-events-none opacity-50',
  );
  const enabledClassName = buttonVariants({ variant: 'outline', size: 'sm' });

  return (
    <nav
      aria-label="Image navigation"
      className="flex flex-col items-center gap-2 py-4"
    >
      <div className="flex items-center justify-center gap-3">
        {olderId !== null ? (
          <Link
            href={buildAdjacentHref(olderId, query)}
            className={enabledClassName}
            aria-label="Previous image (older)"
          >
            <ChevronLeft data-icon="inline-start" aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span
            className={disabledClassName}
            aria-disabled="true"
            aria-label="Previous image (older), unavailable"
          >
            <ChevronLeft data-icon="inline-start" aria-hidden="true" />
            Previous
          </span>
        )}

        {newerId !== null ? (
          <Link
            href={buildAdjacentHref(newerId, query)}
            className={enabledClassName}
            aria-label="Next image (newer)"
          >
            Next
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        ) : (
          <span
            className={disabledClassName}
            aria-disabled="true"
            aria-label="Next image (newer), unavailable"
          >
            Next
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </span>
        )}
      </div>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          The adjacent image could not be loaded.
        </p>
      ) : null}
    </nav>
  );
}
