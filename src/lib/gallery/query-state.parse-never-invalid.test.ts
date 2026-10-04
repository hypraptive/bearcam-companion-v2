import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BEAR_PRESENCE_VALUES,
  MAX_SEARCH_LENGTH,
  parseQueryState,
} from './query-state';
import { CAM_FEEDS, type CamFeed } from '@/lib/constants';

const FEED_CODES = Object.keys(CAM_FEEDS) as CamFeed[];

/**
 * A raw param value arbitrary that deliberately mixes well-formed values with
 * malformed, unrecognized, and over-length garbage. This exercises the full
 * raw-input space `parseQueryState` must survive: unknown feed codes, bogus
 * bear-presence strings, non-numeric / zero / negative / huge pages and years,
 * whitespace, and search terms far longer than MAX_SEARCH_LENGTH.
 */
const rawValueArb: fc.Arbitrary<string> = fc.oneof(
  // Fully arbitrary strings (the bulk of the "garbage" space).
  fc.string(),
  // Plausible-but-maybe-invalid feed codes.
  fc.constantFrom(...FEED_CODES, 'XX', 'bf', '', 'BROOKS'),
  // Plausible-but-maybe-invalid bear-presence values.
  fc.constantFrom(...BEAR_PRESENCE_VALUES, 'ANY', 'maybe', 'yes', ''),
  // Numeric-ish strings incl. zero, negatives, floats, and huge values.
  fc
    .integer({ min: -1000, max: 1_000_000 })
    .map((n) => String(n)),
  fc.constantFrom('0', '-1', '1.5', '01', ' 3 ', 'NaN', '1e5', '99999999999'),
  // Over-length search terms (well past MAX_SEARCH_LENGTH).
  fc.string({ minLength: MAX_SEARCH_LENGTH + 1, maxLength: MAX_SEARCH_LENGTH + 200 }),
  // Whitespace-only values.
  fc.constantFrom('   ', '\t', '\n', '  \t  '),
);

/**
 * An arbitrary record of raw search-param values. Each known key is optionally
 * present with a (possibly malformed) raw string, and arbitrary extra junk keys
 * may also appear — mirroring real, untrusted URL query input.
 */
const rawParamsArb: fc.Arbitrary<Record<string, string | string[] | undefined>> =
  fc.record(
    {
      feed: fc.option(fc.oneof(rawValueArb, fc.array(rawValueArb)), {
        nil: undefined,
      }),
      bears: fc.option(fc.oneof(rawValueArb, fc.array(rawValueArb)), {
        nil: undefined,
      }),
      q: fc.option(fc.oneof(rawValueArb, fc.array(rawValueArb)), {
        nil: undefined,
      }),
      year: fc.option(fc.oneof(rawValueArb, fc.array(rawValueArb)), {
        nil: undefined,
      }),
      page: fc.option(fc.oneof(rawValueArb, fc.array(rawValueArb)), {
        nil: undefined,
      }),
      // Unrecognized junk key — must be ignored, never cause a throw.
      junk: fc.option(rawValueArb, { nil: undefined }),
    },
    { requiredKeys: [] },
  );

describe('Query_State parse-never-invalid', () => {
  // Feature: image-gallery, Property 2: Parsing never yields an invalid Query_State
  // Validates: Requirements 6.5, 3.7, 3.8
  //
  // For any arbitrary record of raw string search-param values (including
  // malformed, unrecognized, or over-length values), parseQueryState returns a
  // QueryState whose every field is in range, and never throws. A bad URL
  // therefore degrades to safe, in-range state rather than crashing the gallery.
  it('Property 2: parse of arbitrary raw params is always valid and never throws', () => {
    fc.assert(
      fc.property(rawParamsArb, (raw) => {
        // No throw: parsing untrusted input must never crash.
        const state = parseQueryState(raw);

        // feed: one of the five defined codes, or null.
        expect(state.feed === null || FEED_CODES.includes(state.feed)).toBe(true);

        // bears: one of 'any' | 'with' | 'without'.
        expect(BEAR_PRESENCE_VALUES).toContain(state.bears);

        // q: trimmed length between 0 and MAX_SEARCH_LENGTH inclusive.
        expect(state.q).toBe(state.q.trim());
        expect(state.q.length).toBeGreaterThanOrEqual(0);
        expect(state.q.length).toBeLessThanOrEqual(MAX_SEARCH_LENGTH);

        // year: null or a positive integer.
        expect(
          state.year === null ||
            (Number.isInteger(state.year) && state.year > 0),
        ).toBe(true);

        // page: an integer >= 1.
        expect(Number.isInteger(state.page)).toBe(true);
        expect(state.page).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});
