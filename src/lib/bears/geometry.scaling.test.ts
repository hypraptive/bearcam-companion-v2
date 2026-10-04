import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { computeOverlayRect } from './geometry';

describe('Bounding-box overlay geometry scaling', () => {
  // Feature: image-gallery, Property 11: Bounding-box overlay geometry scales with rendered size
  // Validates: Requirements 4.2
  //
  // For any object with fractional coords left, top, width, height in [0, 1]
  // and any rendered box of width W >= 0 and height H >= 0, the computed rect
  // equals { left: left*W, top: top*H, width: width*W, height: height*H }
  // exactly (the overlay scales linearly with the rendered image box). In
  // addition, whenever the fractional box stays within the unit square
  // (left + width <= 1 and top + height <= 1), the scaled rect stays within the
  // rendered box — its right edge <= W and its bottom edge <= H — so overlays
  // never spill outside the image they annotate.
  it('Property 11: scaling is exact and stays within the rendered box', () => {
    const fraction = fc.float({
      min: 0,
      max: 1,
      noNaN: true,
      noDefaultInfinity: true,
    });
    const dimension = fc.float({ min: 0, noNaN: true, noDefaultInfinity: true });

    fc.assert(
      fc.property(
        fraction,
        fraction,
        fraction,
        fraction,
        dimension,
        dimension,
        (left, top, width, height, W, H) => {
          const rect = computeOverlayRect({ left, top, width, height }, W, H);

          // 1. Exact linear scaling of all four fields. The test recomputes the
          //    same products, so exact equality is the correct assertion.
          expect(rect.left).toBe(left * W);
          expect(rect.top).toBe(top * H);
          expect(rect.width).toBe(width * W);
          expect(rect.height).toBe(height * H);

          // 2. Containment: when the fractional box is inside the unit square,
          //    the scaled overlay stays within the rendered box. A tiny epsilon
          //    tolerance absorbs floating-point rounding in the edge sums.
          const epsilon = 1e-9 * Math.max(1, W, H);

          if (left + width <= 1) {
            expect(rect.left + rect.width).toBeLessThanOrEqual(W + epsilon);
          }

          if (top + height <= 1) {
            expect(rect.top + rect.height).toBeLessThanOrEqual(H + epsilon);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
