// @vitest-environment jsdom

/**
 * Integration test for Query_State round-trip across navigation (task 17.1).
 *
 * Verifies the end-to-end state-preservation path the design calls out:
 *   "load /?feed=BF&bears=with, open a detail page, return, and confirm the grid
 *    is restored to the same Query_State (filters, search, page)".
 *
 * The project has no browser/e2e harness (Vitest + jsdom + @testing-library),
 * so this exercises the same wiring the pages use rather than driving a real
 * browser. The chain under test is:
 *
 *   1. The Gallery_Page is loaded directly with a URL carrying a Query_State
 *      (`parseQueryState` of the incoming searchParams — Req 6.4).
 *   2. The visitor opens a detail page. `ImageDetail` carries the Query_State
 *      forward by building `query = toSearchParams(parseQueryState(searchParams))
 *      .toString()` and passing it to `ImageNav` (Req 6.2). This test reproduces
 *      that exact expression and renders `ImageNav` with the carried query to
 *      confirm the prev/next links preserve `feed=BF&bears=with` unchanged.
 *   3. The visitor returns to the grid: the carried query string is parsed back
 *      and must deep-equal the original Query_State (restoration equivalence —
 *      Req 6.3), so the restored grid shows exactly the images the original
 *      Query_State produced.
 *
 * `parseQueryState` / `toSearchParams` are the single source of truth for this
 * encoding, so driving them directly (plus a real `ImageNav` render) is a
 * faithful integration check of the carry-forward/restore contract without a
 * deployed backend or router. `next/link` is mocked to a native `<a>` so href
 * assertions work without the Next runtime, matching the pattern in
 * `src/components/bears/overlays-nav.test.tsx`.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_QUERY_STATE,
  parseQueryState,
  toSearchParams,
  type QueryState,
} from '@/lib/gallery/query-state';
import { ImageNav } from '@/components/images/image-nav';

// --- next/link mock --------------------------------------------------------
// Render to a native <a> so href assertions work without the Next router,
// matching the convention in overlays-nav.test.tsx.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} data-next-link="true" {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Reproduce exactly what `ImageDetail` does to carry the Query_State forward:
 * normalize the incoming searchParams and reserialize them unchanged into the
 * query string handed to `ImageNav` (see src/app/(public)/images/[id]/page.tsx).
 */
function carryForwardQuery(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  return toSearchParams(parseQueryState(searchParams)).toString();
}

/** Parse a carried-forward query string back into a QueryState (the restore step). */
function restoreFromQuery(query: string): QueryState {
  return parseQueryState(Object.fromEntries(new URLSearchParams(query)));
}

describe('Query_State round-trip across navigation (Req 6.2, 6.3, 6.4)', () => {
  it('parses /?feed=BF&bears=with into the expected normalized Query_State (Req 6.4)', () => {
    // Loading a Gallery_Page URL that carries a Query_State applies that state.
    const state = parseQueryState({ feed: 'BF', bears: 'with' });

    expect(state).toEqual<QueryState>({
      feed: 'BF',
      bears: 'with',
      year: null,
      q: '',
      page: 1,
    });
  });

  it('carries the Query_State forward to the detail page unchanged (Req 6.2)', () => {
    // The query string the detail page builds and hands to ImageNav must encode
    // exactly the active, non-default filters — nothing added, nothing lost.
    const query = carryForwardQuery({ feed: 'BF', bears: 'with' });

    expect(query).toBe('feed=BF&bears=with');
  });

  it('restores the identical Query_State when returning to the grid (Req 6.3)', () => {
    const original = parseQueryState({ feed: 'BF', bears: 'with' });

    // Open a detail page (carry forward) then return to the grid (parse back).
    const carried = carryForwardQuery({ feed: 'BF', bears: 'with' });
    const restored = restoreFromQuery(carried);

    // The grid is restored to the same Query_State it departed with.
    expect(restored).toEqual(original);
  });

  it("ImageNav's prev/next links carry feed=BF&bears=with forward unchanged (Req 6.2)", () => {
    const query = carryForwardQuery({ feed: 'BF', bears: 'with' });

    render(<ImageNav newerId="newer-1" olderId="older-1" query={query} />);

    const next = screen.getByRole('link', { name: 'Next image (newer)' });
    const prev = screen.getByRole('link', { name: 'Previous image (older)' });
    expect(next).toHaveAttribute('href', '/images/newer-1?feed=BF&bears=with');
    expect(prev).toHaveAttribute('href', '/images/older-1?feed=BF&bears=with');
  });

  it('round-trips a full Query_State with every dimension set — filters, search, page (Req 6.3, 6.4)', () => {
    // A richer URL exercises year, feed, bears, q, and a non-first page together.
    const incoming = {
      year: '2024',
      feed: 'KRV',
      bears: 'without',
      q: '480 Otis',
      page: '3',
    };
    const original = parseQueryState(incoming);
    expect(original).toEqual<QueryState>({
      year: 2024,
      feed: 'KRV',
      bears: 'without',
      q: '480 Otis',
      page: 3,
    });

    const carried = carryForwardQuery(incoming);
    const restored = restoreFromQuery(carried);

    // Full filters + search + page survive the open-detail/return round-trip.
    expect(restored).toEqual(original);

    // And ImageNav carries that complete state forward on both edges.
    render(<ImageNav newerId="n" olderId="o" query={carried} />);
    expect(screen.getByRole('link', { name: 'Next image (newer)' })).toHaveAttribute(
      'href',
      `/images/n?${carried}`,
    );
    expect(screen.getByRole('link', { name: 'Previous image (older)' })).toHaveAttribute(
      'href',
      `/images/o?${carried}`,
    );
  });

  it('drops malformed/unrecognized values on the way through, degrading to defaults (Req 6.4)', () => {
    // A URL mixing a valid filter with junk restores to just the valid part;
    // the junk never survives the round-trip and never blocks restoration.
    const incoming = {
      feed: 'BF',
      bears: 'maybe', // unrecognized -> 'any' (default, omitted)
      year: '-5', // non-positive -> null (default, omitted)
      page: '0', // < 1 -> 1 (default, omitted)
    };
    const original = parseQueryState(incoming);
    expect(original).toEqual<QueryState>({
      feed: 'BF',
      bears: 'any',
      year: null,
      q: '',
      page: 1,
    });

    const carried = carryForwardQuery(incoming);
    // Only the surviving, non-default filter is encoded.
    expect(carried).toBe('feed=BF');
    expect(restoreFromQuery(carried)).toEqual(original);
  });

  it('carries the default (unfiltered) state as a clean, empty query string', () => {
    // Returning from a detail page opened off the unfiltered grid restores the
    // default state, and the carried query is empty so links stay clean.
    const carried = carryForwardQuery({});
    expect(carried).toBe('');
    expect(restoreFromQuery(carried)).toEqual(DEFAULT_QUERY_STATE);

    render(<ImageNav newerId="n" olderId="o" query={carried} />);
    // Empty query -> no `?` suffix on the hrefs.
    expect(screen.getByRole('link', { name: 'Next image (newer)' })).toHaveAttribute(
      'href',
      '/images/n',
    );
  });
});
