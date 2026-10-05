import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BEAR_PRESENCE_VALUES,
  DEFAULT_QUERY_STATE,
  applyControlChange,
  type BearPresence,
  type QueryState,
} from './query-state';
import { CAM_FEEDS, type CamFeed } from '@/lib/constants';

const FEED_CODES = Object.keys(CAM_FEEDS) as CamFeed[];

/**
 * A canonical search term for building a starting QueryState: either cleared
 * (`''`) or a non-empty term already equal to its own trim and within
 * MAX_SEARCH_LENGTH (100). Matching the normalized shape `applyControlChange`
 * compares against keeps the "did it change" reasoning exact.
 */
const canonicalSearchTermArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s === s.trim() && s.length >= 1 && s.length <= 100),
);

/**
 * A starting QueryState with `page >= 2` so a reset to page 1 is observable
 * (a start at page 1 would make the assertion vacuous).
 */
const startingStateArb: fc.Arbitrary<QueryState> = fc.record({
  year: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: null }),
  feed: fc.option(fc.constantFrom<CamFeed>(...FEED_CODES), { nil: null }),
  bears: fc.constantFrom(...BEAR_PRESENCE_VALUES),
  q: canonicalSearchTermArb,
  page: fc.integer({ min: 2, max: 100000 }),
});

/** Pick a year different from `current.year`. */
function differentYearArb(current: number | null): fc.Arbitrary<number | null> {
  return fc
    .option(fc.integer({ min: 1, max: 9999 }), { nil: null })
    .filter((y) => y !== current);
}

/** Pick a feed different from `current.feed`. */
function differentFeedArb(current: CamFeed | null): fc.Arbitrary<CamFeed | null> {
  return fc
    .option(fc.constantFrom<CamFeed>(...FEED_CODES), { nil: null })
    .filter((f) => f !== current);
}

/** Pick a bear-presence value different from `current.bears`. */
function differentBearsArb(current: BearPresence): fc.Arbitrary<BearPresence> {
  return fc.constantFrom(...BEAR_PRESENCE_VALUES).filter((b) => b !== current);
}

/**
 * A new, non-empty, trimmed search term that genuinely differs from
 * `current.q`. Must survive trimming unchanged so the reducer's post-trim
 * comparison sees a real, non-empty change.
 */
function differentNonEmptySearchArb(current: string): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s === s.trim() && s.length >= 1 && s !== current);
}

/**
 * Build a change (a `Partial<QueryState>`) that alters exactly one of the
 * reset-triggering dimensions — year, feed, bears, or a new non-empty q —
 * relative to the given starting state. Each branch guarantees a real change,
 * so each must force `page === 1`.
 */
function realChangeArb(start: QueryState): fc.Arbitrary<Partial<QueryState>> {
  return fc.oneof(
    differentYearArb(start.year).map((year) => ({ year })),
    differentFeedArb(start.feed).map((feed) => ({ feed })),
    differentBearsArb(start.bears).map((bears) => ({ bears })),
    differentNonEmptySearchArb(start.q).map((q) => ({ q })),
  );
}

describe('Query_State reset-to-page-1 on change', () => {
  // Feature: image-gallery, Property 9: Changing a filter or a non-empty search resets to page 1
  // Validates: Requirements 2.12, 3.4
  //
  // For any starting QueryState and any genuine change to year, feed, bears, or
  // to a new non-empty trimmed q, applyControlChange produces a QueryState with
  // page === 1. This guarantees a user who narrows or re-searches the gallery
  // always lands on the first page of the new result set rather than a stale,
  // possibly out-of-range page.
  it('Property 9: a real filter/non-empty-search change resets page to 1', () => {
    fc.assert(
      fc.property(
        startingStateArb.chain((start) =>
          realChangeArb(start).map((change) => ({ start, change })),
        ),
        ({ start, change }) => {
          const next = applyControlChange(start, change);
          expect(next.page).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Complement of Property 9 (the "only on a real change" half of the contract):
  // re-applying the SAME filter values and no new non-empty q must NOT reset the
  // page — it is preserved. This pins the reducer to resetting on real changes
  // only, so the Property 9 reset is meaningful rather than unconditional.
  it('Property 9 (contract): a no-op filter change preserves the page', () => {
    fc.assert(
      fc.property(startingStateArb, (start) => {
        // Re-assert each current value plus a cleared/same q: nothing changes.
        const next = applyControlChange(start, {
          year: start.year,
          feed: start.feed,
          bears: start.bears,
          q: start.q,
        });
        expect(next.page).toBe(start.page);
      }),
      { numRuns: 100 },
    );
  });

  // A concrete anchor example: starting on page 5 with no filters, selecting a
  // feed resets to page 1 while carrying the new feed forward.
  it('Property 9 (example): selecting a feed from the default state resets to page 1', () => {
    const start: QueryState = { ...DEFAULT_QUERY_STATE, page: 5 };
    const next = applyControlChange(start, { feed: 'BF' });
    expect(next.page).toBe(1);
    expect(next.feed).toBe('BF');
  });
});
