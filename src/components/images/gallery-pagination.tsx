'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PaginationControls } from '@/components/images/pagination-controls';
import { parseQueryState, toSearchParams } from '@/lib/gallery/query-state';

type GalleryPaginationProps = {
  /** The current 1-based page number (already clamped by the page). */
  page: number;
  /** Whether a further page exists after the current one (Req 1.5, 1.6). */
  hasNextPage: boolean;
  /** Whether a page exists before the current one, i.e. page > 1 (Req 1.7). */
  hasPrevPage: boolean;
};

/**
 * Gallery_Pagination — the client wrapper that owns pagination URL writes and
 * renders {@link PaginationControls}.
 *
 * `PaginationControls` is a Client Component that reports a direction delta via
 * an `onPageChange` function. The Gallery_Page is a Server Component and cannot
 * pass a function handler across the server/client boundary, so this thin
 * `'use client'` wrapper bridges the two — exactly mirroring how
 * `GalleryControls` owns URL writes for the filter/search controls. Keeping
 * pagination's URL mutation here means the Server Component only ever passes
 * serializable props (`page`, `hasNextPage`, `hasPrevPage`) and the "page lives
 * in the URL" invariant (Req 6.1) is enforced in one client place per control
 * group.
 *
 * On an enabled prev/next activation it reads the live Query_State from the URL
 * (`useSearchParams`), applies the `delta` to `page` (never below 1), and
 * reserializes with `toSearchParams` (which omits default-valued keys, so
 * paging back to page 1 yields a clean URL). The disabled-edge logic itself
 * lives in `PaginationControls`, driven by the `hasPrevPage`/`hasNextPage`
 * flags the server computed (Req 1.6, 1.7).
 */
export function GalleryPagination({
  page,
  hasNextPage,
  hasPrevPage,
}: GalleryPaginationProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handlePageChange(delta: -1 | 1): void {
    const current = parseQueryState(Object.fromEntries(searchParams.entries()));
    const nextPage = Math.max(1, current.page + delta);
    const query = toSearchParams({ ...current, page: nextPage }).toString();
    router.push(query === '' ? pathname : `${pathname}?${query}`);
  }

  return (
    <PaginationControls
      page={page}
      hasNextPage={hasNextPage}
      hasPrevPage={hasPrevPage}
      onPageChange={handlePageChange}
    />
  );
}
