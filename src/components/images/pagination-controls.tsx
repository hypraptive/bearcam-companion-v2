'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PaginationControlsProps = {
  /** The current 1-based page number (Req 6.1). */
  page: number;
  /** Whether a further page exists after the current one (Req 1.5, 1.6). */
  hasNextPage: boolean;
  /** Whether a page exists before the current one, i.e. page > 1 (Req 1.7). */
  hasPrevPage: boolean;
  /**
   * Called when an enabled control is activated, with the direction delta
   * (`-1` for previous, `+1` for next). The owning component (GalleryControls,
   * task 11.4) performs the URL write; this component never navigates itself.
   */
  onPageChange: (delta: -1 | 1) => void;
};

/**
 * Prev/next pagination controls for the Image_Grid (PaginationControls).
 *
 * Client Component: renders a previous and a next control whose enabled state
 * is driven entirely by `hasPrevPage`/`hasNextPage`. The previous control is
 * disabled while the current page is the first page (Req 1.7); the next control
 * is disabled while the current page is the last available page (Req 1.6). A
 * disabled control produces no navigation — its `onPageChange` is never
 * invoked (Req 1.6). An enabled control reports its direction delta via
 * `onPageChange` so the owner can advance/return and encode the resulting page
 * in the Query_State (Req 1.5).
 */
export function PaginationControls({
  page,
  hasNextPage,
  hasPrevPage,
  onPageChange,
}: PaginationControlsProps): React.JSX.Element {
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-3 py-4"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasPrevPage}
        onClick={() => onPageChange(-1)}
      >
        <ChevronLeft data-icon="inline-start" aria-hidden="true" />
        Previous
      </Button>

      <span className="text-sm font-medium text-muted-foreground" aria-current="page">
        Page {page}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNextPage}
        onClick={() => onPageChange(1)}
      >
        Next
        <ChevronRight data-icon="inline-end" aria-hidden="true" />
      </Button>
    </nav>
  );
}
