// @vitest-environment jsdom

/**
 * Component tests for the gallery control components' disabled / empty / limit
 * states (task 11.5):
 *   - `PaginationControls` — the previous control is disabled on the first page
 *     and fires no navigation (Req 1.7); the next control is disabled on the
 *     last page and fires no navigation (Req 1.6).
 *   - `FilterControls`     — the year select is empty-and-disabled when no years
 *     are available (Req 2.2).
 *   - `SearchControl`      — submitting a term longer than MAX_SEARCH_LENGTH
 *     shows the max-length message and does not call `onSubmit`; a valid term
 *     does call `onSubmit` (Req 3.8).
 *
 * Interactions use `fireEvent`. These components are Client Components, so
 * rendering them with `@testing-library/react` under jsdom exercises exactly
 * the behavior a visitor drives.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaginationControls } from './pagination-controls';
import { FilterControls } from './filter-controls';
import { SearchControl } from './search-control';
import {
  DEFAULT_QUERY_STATE,
  MAX_SEARCH_LENGTH,
  type QueryState,
} from '@/lib/gallery/query-state';

/** Build a QueryState overriding only the fields a test cares about. */
function makeState(overrides: Partial<QueryState> = {}): QueryState {
  return { ...DEFAULT_QUERY_STATE, ...overrides };
}

describe('PaginationControls — disabled edges (Req 1.6, 1.7)', () => {
  it('disables Previous on the first page and fires no navigation (Req 1.7)', () => {
    const onPageChange = vi.fn();

    render(
      <PaginationControls
        page={1}
        hasNextPage={true}
        hasPrevPage={false}
        onPageChange={onPageChange}
      />,
    );

    const prev = screen.getByRole('button', { name: /previous/i });
    expect(prev).toBeDisabled();

    // Activating a disabled control must not navigate.
    fireEvent.click(prev);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('disables Next on the last page and fires no navigation (Req 1.6)', () => {
    const onPageChange = vi.fn();

    render(
      <PaginationControls
        page={3}
        hasNextPage={false}
        hasPrevPage={true}
        onPageChange={onPageChange}
      />,
    );

    const next = screen.getByRole('button', { name: /next/i });
    expect(next).toBeDisabled();

    fireEvent.click(next);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('fires onPageChange with the direction delta for enabled controls', () => {
    const onPageChange = vi.fn();

    render(
      <PaginationControls
        page={2}
        hasNextPage={true}
        hasPrevPage={true}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(-1);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    expect(onPageChange).toHaveBeenCalledTimes(2);
  });
});

describe('FilterControls — year empty-disabled state (Req 2.2)', () => {
  it('disables the year select when no years are available', () => {
    render(
      <FilterControls
        state={makeState()}
        years={[]}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const yearSelect = screen.getByLabelText('Filter by year');
    expect(yearSelect).toBeDisabled();

    // The only option is the "No years" placeholder — no concrete year options.
    const options = within(yearSelect).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('No years');
  });

  it('enables the year select and lists the available years when present', () => {
    render(
      <FilterControls
        state={makeState()}
        years={[2024, 2023]}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const yearSelect = screen.getByLabelText('Filter by year');
    expect(yearSelect).toBeEnabled();

    const options = within(yearSelect).getAllByRole('option');
    // "All years" placeholder + the two provided years.
    expect(options.map((o) => o.textContent)).toEqual(['All years', '2024', '2023']);
  });
});

describe('SearchControl — over-length message and submit gating (Req 3.8)', () => {
  it('rejects an over-length term, shows the max-length message, and does not call onSubmit', () => {
    const onSubmit = vi.fn();

    render(<SearchControl value="" onSubmit={onSubmit} />);

    const input = screen.getByRole('searchbox', {
      name: /search by bear name or number/i,
    });

    const overLength = 'a'.repeat(MAX_SEARCH_LENGTH + 1);
    fireEvent.change(input, { target: { value: overLength } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    // Max-length indication is shown and onSubmit is never called (Req 3.8).
    expect(
      screen.getByText(
        `Search term must be ${MAX_SEARCH_LENGTH} characters or fewer.`,
      ),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid term (at the max length) via onSubmit with no message', () => {
    const onSubmit = vi.fn();

    render(<SearchControl value="" onSubmit={onSubmit} />);

    const input = screen.getByRole('searchbox', {
      name: /search by bear name or number/i,
    });

    const atLimit = 'o'.repeat(MAX_SEARCH_LENGTH);
    fireEvent.change(input, { target: { value: atLimit } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(atLimit);
    expect(
      screen.queryByText(
        `Search term must be ${MAX_SEARCH_LENGTH} characters or fewer.`,
      ),
    ).not.toBeInTheDocument();
  });

  it('clears the over-length message once the user edits the field again', () => {
    const onSubmit = vi.fn();

    render(<SearchControl value="" onSubmit={onSubmit} />);

    const input = screen.getByRole('searchbox', {
      name: /search by bear name or number/i,
    });

    fireEvent.change(input, { target: { value: 'b'.repeat(MAX_SEARCH_LENGTH + 1) } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // Editing again dismisses the indication without needing a resubmit.
    fireEvent.change(input, { target: { value: 'b'.repeat(MAX_SEARCH_LENGTH) } });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(
      screen.queryByText(
        `Search term must be ${MAX_SEARCH_LENGTH} characters or fewer.`,
      ),
    ).not.toBeInTheDocument();
  });
});
