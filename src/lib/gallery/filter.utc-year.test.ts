import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { isInUtcYear } from './filter';

/**
 * UTC range bounds for a calendar `year`, in epoch milliseconds. The inclusive
 * range is `[year-01-01T00:00:00.000Z, year-12-31T23:59:59.999Z]`.
 */
function utcYearBounds(year: number): { start: number; end: number } {
  return {
    start: Date.UTC(year, 0, 1, 0, 0, 0, 0),
    end: Date.UTC(year, 11, 31, 23, 59, 59, 999),
  };
}

/**
 * A realistic, ISO-safe calendar year range. JS `Date` supports a far wider
 * span, but 1970–9999 is both valid for `toISOString()` and realistic.
 */
const yearArb: fc.Arbitrary<number> = fc.integer({ min: 1970, max: 9999 });

describe('isInUtcYear UTC bounds', () => {
  // Feature: image-gallery, Property 6: UTC year bounds are inclusive and exclusive of neighbors
  // Validates: Requirements 2.5
  //
  // For any calendar year and any instant, isInUtcYear(iso, year) returns true
  // iff the instant is on or after year-01-01T00:00:00.000Z and on or before
  // year-12-31T23:59:59.999Z (UTC). Instants that fall in year-1 or year+1
  // return false. This guarantees the year filter selects exactly the images
  // whose UTC timestamp belongs to the chosen calendar year — no off-by-one at
  // the year boundary and no bleed into neighboring years.
  it('Property 6: matches a reference UTC-range predicate across neighbor years', () => {
    fc.assert(
      fc.property(
        yearArb,
        // An offset in milliseconds relative to the start of `year`, spanning
        // from well before `year-1` through well after `year+1` so the generated
        // instant lands in the previous year, the target year, or the next year.
        fc.integer({ min: -500 * 24 * 60 * 60 * 1000, max: 900 * 24 * 60 * 60 * 1000 }),
        (year, offsetMs) => {
          const { start, end } = utcYearBounds(year);
          const ms = start + offsetMs;
          const iso = new Date(ms).toISOString();

          const ref = ms >= start && ms <= end;
          expect(isInUtcYear(iso, year)).toBe(ref);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 6: exact boundary instants are inclusive, one ms outside is exclusive', () => {
    fc.assert(
      fc.property(yearArb, (year) => {
        const { start, end } = utcYearBounds(year);

        // Exactly the first instant of the year → true.
        expect(isInUtcYear(new Date(start).toISOString(), year)).toBe(true);
        // Exactly the last instant of the year → true.
        expect(isInUtcYear(new Date(end).toISOString(), year)).toBe(true);
        // One millisecond before the start → false.
        expect(isInUtcYear(new Date(start - 1).toISOString(), year)).toBe(false);
        // One millisecond after the end → false.
        expect(isInUtcYear(new Date(end + 1).toISOString(), year)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: instants within year-1 or year+1 are excluded', () => {
    fc.assert(
      fc.property(
        // Keep the neighbors in-range for ISO safety: 1971..9998 so that
        // year-1 >= 1970 and year+1 <= 9999.
        fc.integer({ min: 1971, max: 9998 }),
        // A fractional position within a neighbor year's own UTC range.
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (year, frac) => {
          const prev = utcYearBounds(year - 1);
          const next = utcYearBounds(year + 1);

          const prevMs = prev.start + Math.round((prev.end - prev.start) * frac);
          const nextMs = next.start + Math.round((next.end - next.start) * frac);

          // An instant anywhere within year-1 → false for `year`.
          expect(isInUtcYear(new Date(prevMs).toISOString(), year)).toBe(false);
          // An instant anywhere within year+1 → false for `year`.
          expect(isInUtcYear(new Date(nextMs).toISOString(), year)).toBe(false);

          // Sanity: those same instants DO match their own years.
          expect(isInUtcYear(new Date(prevMs).toISOString(), year - 1)).toBe(true);
          expect(isInUtcYear(new Date(nextMs).toISOString(), year + 1)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
