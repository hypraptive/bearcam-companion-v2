import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { clampPage } from './query-state';

describe('Query_State page clamping', () => {
  // Feature: image-gallery, Property 3: Page clamping stays in range
  // Validates: Requirements 6.6
  //
  // For any integer page and any totalPages >= 0, clampPage(page, totalPages)
  // returns a value r such that 1 <= r <= max(totalPages, 1), with r = 1
  // whenever page <= 1 and r = max(totalPages, 1) whenever
  // page >= max(totalPages, 1). This guarantees an out-of-range pagination
  // position in a loaded URL is always corrected to the nearest valid page
  // rather than rendering an empty or invalid grid position.
  it('Property 3: clampPage stays in [1, max(totalPages, 1)] with correct boundaries', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 0 }), (page, totalPages) => {
        const r = clampPage(page, totalPages);
        const max = Math.max(totalPages, 1);

        // In-range: the result is never below 1 nor above the last valid page.
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(max);

        // Lower boundary: any page at or below the first page clamps to 1.
        if (page <= 1) {
          expect(r).toBe(1);
        }

        // Upper boundary: any page at or beyond the last valid page clamps to it.
        if (page >= max) {
          expect(r).toBe(max);
        }

        // Interior: a page strictly between the bounds passes through unchanged.
        if (page > 1 && page < max) {
          expect(r).toBe(page);
        }
      }),
      { numRuns: 100 },
    );
  });
});
