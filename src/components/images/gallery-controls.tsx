'use client';

import { usePathname, useRouter } from 'next/navigation';
import { FilterControls } from '@/components/images/filter-controls';
import { SearchControl } from '@/components/images/search-control';
import {
  applyClear,
  applyControlChange,
  toSearchParams,
  type QueryState,
} from '@/lib/gallery/query-state';

type GalleryControlsProps = {
  /** The current, normalized Query_State driving all control values. */
  state: QueryState;
  /**
   * Distinct calendar years for which at least one Image exists, sorted
   * descending (Req 2.1). An empty array disables the year control (Req 2.2).
   */
  years: number[];
};

/**
 * Gallery_Controls — composes the filter, search, and clear controls for the
 * Gallery_Page and owns all URL writes (Req 2.12, 2.13, 3.4, 6.1).
 *
 * Client Component: `FilterControls` and `SearchControl` are controlled,
 * stateless-with-respect-to-the-URL children that report edits upward. This
 * component centralizes URL mutation so there is a single place that encodes
 * Query_State into the address bar:
 *
 * - A filter change (`onChange`) is merged into the current `state` via
 *   `applyControlChange`, which resets pagination to page 1 whenever a filter
 *   dimension or a new non-empty search term changes (Req 2.12, 3.4).
 * - A clear (`onClear`) resets to the default unfiltered first page via
 *   `applyClear` (Req 2.13).
 * - A search submit is applied as a `{ q }` control change, reusing the same
 *   reset-to-page-1 semantics for a new non-empty term (Req 3.4).
 *
 * In every case the resulting Query_State is serialized with `toSearchParams`
 * (which omits default-valued keys) and pushed onto the current pathname, so
 * the URL remains the single source of truth for the gallery view (Req 6.1).
 */
export function GalleryControls({ state, years }: GalleryControlsProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();

  /** Serialize `next` and push it onto the current pathname. */
  function navigate(next: QueryState): void {
    const query = toSearchParams(next).toString();
    router.push(query === '' ? pathname : `${pathname}?${query}`);
  }

  function handleChange(change: Partial<QueryState>): void {
    navigate(applyControlChange(state, change));
  }

  function handleClear(): void {
    navigate(applyClear());
  }

  function handleSearchSubmit(term: string): void {
    navigate(applyControlChange(state, { q: term }));
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchControl value={state.q} onSubmit={handleSearchSubmit} />
      <FilterControls
        state={state}
        years={years}
        onChange={handleChange}
        onClear={handleClear}
      />
    </div>
  );
}
