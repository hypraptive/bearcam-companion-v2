'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CAM_FEEDS, type CamFeed } from '@/lib/constants';
import {
  BEAR_PRESENCE_VALUES,
  type BearPresence,
  type QueryState,
} from '@/lib/gallery/query-state';

/** Sentinel value used by native selects to represent "no selection" (all). */
const ALL_VALUE = '';

/** Human-readable labels for the three bear-presence options (Req 2.4). */
const BEAR_PRESENCE_LABELS: Record<BearPresence, string> = {
  any: 'Any',
  with: 'With bears',
  without: 'Without bears',
};

/** The five defined CamFeed codes, in declaration order (Req 2.3). */
const CAM_FEED_CODES = Object.keys(CAM_FEEDS) as CamFeed[];

/**
 * Shared Tailwind classes for the native `<select>` controls. Uses the shadcn
 * design tokens (border, background, ring) so the controls match the rest of
 * the UI without introducing custom colors.
 */
const SELECT_CLASS = cn(
  'h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm',
  'text-foreground transition-colors',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
  'disabled:pointer-events-none disabled:opacity-50',
);

const LABEL_CLASS = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

type FilterControlsProps = {
  /** The current, normalized Query_State driving the control values. */
  state: QueryState;
  /**
   * Distinct calendar years for which at least one Image exists, sorted
   * descending (Req 2.1). An empty array disables the year control (Req 2.2).
   */
  years: number[];
  /**
   * Emit a partial Query_State change (one filter dimension at a time). The
   * owner (GalleryControls) merges this via `applyControlChange` and writes the
   * URL, resetting pagination as required (Req 2.12).
   */
  onChange: (change: Partial<QueryState>) => void;
  /**
   * Clear all filters and search, returning to the default unfiltered first
   * page (Req 2.13).
   */
  onClear: () => void;
};

/**
 * Filter_Controls — the year / camera-feed / bear-presence selects plus a clear
 * control on the Gallery_Page (Req 2.1–2.4, 2.13).
 *
 * Client Component: the selects are interactive and emit changes through
 * `onChange`; the clear control emits through `onClear`. This component owns no
 * URL state itself — it is a controlled component driven by `state` and reports
 * edits upward, keeping URL writes centralized in GalleryControls.
 */
export function FilterControls({
  state,
  years,
  onChange,
  onClear,
}: FilterControlsProps): React.JSX.Element {
  const hasYears = years.length > 0;

  // A clear control is only meaningful when something is actually active.
  const hasActiveFilters =
    state.year !== null || state.feed !== null || state.bears !== 'any' || state.q !== '';

  function handleYearChange(value: string): void {
    onChange({ year: value === ALL_VALUE ? null : Number.parseInt(value, 10) });
  }

  function handleFeedChange(value: string): void {
    onChange({ feed: value === ALL_VALUE ? null : (value as CamFeed) });
  }

  function handleBearsChange(value: string): void {
    onChange({ bears: value as BearPresence });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {/* Year filter (Req 2.1, 2.2) */}
      <label className={cn(LABEL_CLASS, 'sm:w-32')}>
        Year
        <select
          className={SELECT_CLASS}
          value={state.year === null ? ALL_VALUE : String(state.year)}
          onChange={(event) => handleYearChange(event.target.value)}
          disabled={!hasYears}
          aria-label="Filter by year"
        >
          <option value={ALL_VALUE}>{hasYears ? 'All years' : 'No years'}</option>
          {years.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </label>

      {/* Camera feed filter (Req 2.3) */}
      <label className={cn(LABEL_CLASS, 'sm:w-32')}>
        Camera feed
        <select
          className={SELECT_CLASS}
          value={state.feed ?? ALL_VALUE}
          onChange={(event) => handleFeedChange(event.target.value)}
          aria-label="Filter by camera feed"
        >
          <option value={ALL_VALUE}>All feeds</option>
          {CAM_FEED_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      {/* Bear-presence filter (Req 2.4) */}
      <label className={cn(LABEL_CLASS, 'sm:w-32')}>
        Bears
        <select
          className={SELECT_CLASS}
          value={state.bears}
          onChange={(event) => handleBearsChange(event.target.value)}
          aria-label="Filter by bear presence"
        >
          {BEAR_PRESENCE_VALUES.map((value) => (
            <option key={value} value={value}>
              {BEAR_PRESENCE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      {/* Clear control (Req 2.13) */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={!hasActiveFilters}
        className="self-start sm:self-auto"
      >
        <X aria-hidden="true" />
        Clear
      </Button>
    </div>
  );
}
