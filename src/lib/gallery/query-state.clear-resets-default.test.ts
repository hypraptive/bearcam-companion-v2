import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BEAR_PRESENCE_VALUES,
  DEFAULT_QUERY_STATE,
  applyClear,
  type QueryState,
} from './query-state';
import { CAM_FEEDS, type CamFeed } from '@/lib/constants';

const FEED_CODES = Object.keys(CAM_FEEDS) as CamFeed[];

/**
 * An arbitrary, possibly heavily-filtered QueryState representing any prior
 * gallery state a user might have before pressing "clear": any year, any feed,
 * any bear-presence, any (trimmed, in-range) search term, and any page beyond
 * the first. The generator intentionally ranges over non-default values so the
 * property demonstrates that clearing discards all of them.
 */
const queryStateArb: fc.Arbitrary<QueryState> = fc.record({
  year: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: null }),
  feed: fc.option(fc.constantFrom<CamFeed>(...FEED_CODES), { nil: null }),
  bears: fc.constantFrom(...BEAR_PRESENCE_VALUES),
  q: fc.oneof(
    fc.constant(''),
    fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => s === s.trim() && s.length >= 1 && s.length <= 100),
  ),
  page: fc.integer({ min: 1, max: 100000 }),
});

describe('Query_State clear resets to default', () => {
  // Feature: image-gallery, Property 10: Clear resets to the default unfiltered first page
  // Validates: Requirements 2.13
  //
  // For any prior QueryState, applying the clear operation yields exactly
  // DEFAULT_QUERY_STATE (year null, feed null, bears 'any', q '', page 1).
  // `applyClear` is argument-less and returns the default regardless of prior
  // state; the generated QueryState models the arbitrary prior state the clear
  // control may be invoked from, and the result must be independent of it.
  it('Property 10: applyClear() deep-equals DEFAULT_QUERY_STATE for any prior state', () => {
    fc.assert(
      fc.property(queryStateArb, () => {
        expect(applyClear()).toEqual(DEFAULT_QUERY_STATE);
      }),
      { numRuns: 100 },
    );
  });
});
