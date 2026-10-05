'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MAX_SEARCH_LENGTH, normalizeSearchTerm } from '@/lib/gallery/query-state';

type SearchControlProps = {
  /** The currently applied search term from the Query_State ('' = no search). */
  value: string;
  /**
   * Called with the normalized, trimmed search term when a valid search is
   * submitted. An empty string signals a cleared search (Req 3.6, 3.7).
   */
  onSubmit: (term: string) => void;
};

/**
 * Search_Control — the free-text input for searching Images by bear name or
 * number (Req 3.1).
 *
 * Client Component: owns the uncommitted draft text as local state and
 * synchronizes it with the applied `value` whenever that changes (e.g. on
 * back/forward navigation or a clear).
 *
 * On submit the draft is run through `normalizeSearchTerm`:
 * - `ok` → `onSubmit(term)` is called with the trimmed term; an empty/whitespace
 *   draft normalizes to `''`, which the caller treats as a cleared search
 *   (Req 3.6, 3.7).
 * - not `ok` (over `MAX_SEARCH_LENGTH` after trimming) → the input is rejected,
 *   the prior Query_State is left unchanged (no `onSubmit` call), and a
 *   max-length indication is shown (Req 3.8).
 */
export function SearchControl({ value, onSubmit }: SearchControlProps): React.JSX.Element {
  const [draft, setDraft] = useState<string>(value);
  const [tooLong, setTooLong] = useState<boolean>(false);

  // Keep the draft in sync with the applied value when it changes externally
  // (e.g. navigation restoring a Query_State, or a clear action).
  useEffect(() => {
    setDraft(value);
    setTooLong(false);
  }, [value]);

  const errorId = 'search-control-error';

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = normalizeSearchTerm(draft);
    if (!result.ok) {
      // Over-length: reject, keep prior Query_State unchanged, show indication.
      setTooLong(true);
      return;
    }
    setTooLong(false);
    onSubmit(result.term);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setDraft(event.target.value);
    // Clear the indication once the user edits the field again.
    if (tooLong) setTooLong(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            value={draft}
            onChange={handleChange}
            placeholder="Search by bear name or number"
            aria-label="Search by bear name or number"
            aria-invalid={tooLong || undefined}
            aria-describedby={tooLong ? errorId : undefined}
            className={cn(
              'h-8 w-full rounded-lg border border-border bg-background pr-2.5 pl-8 text-sm',
              'placeholder:text-muted-foreground',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              tooLong && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
            )}
          />
        </div>
        <Button type="submit" variant="default">
          Search
        </Button>
      </div>
      {tooLong && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          Search term must be {MAX_SEARCH_LENGTH} characters or fewer.
        </p>
      )}
    </form>
  );
}
