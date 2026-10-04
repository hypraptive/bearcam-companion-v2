import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BEAR_PRESENCE_VALUES,
  parseQueryState,
  toSearchParams,
  type QueryState,
} from './query-state';
import { type CamFeed } from '@/lib/constants';

/**
 * A search term that survives the parse/serialize round-trip. `toSearchParams`
 * omits a default `''`, and `parseQueryState` trims and drops empty/whitespace
 * or over-length terms. So the canonical, round-trippable set is either the
 * cleared term `''` OR a term that already equals its own trim, is non-empty,
 * and is at most MAX_SEARCH_LENGTH (100) characters.
 */
const searchTermArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s === s.trim() && s.length >= 1 && s.length <= 100),
);

const queryStateArb: fc.Arbitrary<QueryState> = fc.record({
  year: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: null }),
  feed: fc.option(fc.constantFrom<CamFeed>('BF', 'RF', 'BFL', 'KRV', 'RW'), {
    nil: null,
  }),
  bears: fc.constantFrom(...BEAR_PRESENCE_VALUES),
  q: searchTermArb,
  page: fc.integer({ min: 1, max: 100000 }),
});

describe('Query_State round-trip', () => {
  // Feature: image-gallery, Property 1: Query_State serialize/parse round-trip
  // Validates: Requirements 6.1, 6.3, 6.4
  //
  // For any canonical/normalized QueryState, serializing it to URL search
  // params and parsing those params back yields a QueryState deep-equal to the
  // original. This guarantees the URL is a lossless encoding of gallery state,
  // so state is preserved across navigation and reloads.
  it('Property 1: parse(serialize(state)) deep-equals state', () => {
    fc.assert(
      fc.property(queryStateArb, (state) => {
        const roundTripped = parseQueryState(
          Object.fromEntries(toSearchParams(state)),
        );
        expect(roundTripped).toEqual(state);
      }),
      { numRuns: 100 },
    );
  });
});
