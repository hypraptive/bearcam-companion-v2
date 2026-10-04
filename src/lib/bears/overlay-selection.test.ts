import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BEAR_LABEL,
  NO_IDENTIFICATION_LABEL,
  resolveConsensusLabel,
  selectBearOverlays,
} from './overlay-selection';

/**
 * A label for a generated Object. The pool deliberately mixes the exact
 * BEAR_LABEL constant with other plausible detection labels and fully random
 * strings so the generator exercises both the overlaid (`=== BEAR_LABEL`) and
 * non-overlaid branches. BEAR_LABEL is weighted so bear objects appear with
 * reasonable frequency rather than being swamped by random strings.
 */
const labelArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constant(BEAR_LABEL) },
  { weight: 2, arbitrary: fc.constantFrom('Person', 'Bird', 'Animal', 'bear', 'BEAR') },
  { weight: 1, arbitrary: fc.string() },
);

/**
 * A consensus name covering every shape resolveConsensusLabel must distinguish:
 * null, undefined, and the empty string (all → no-identification), plus
 * non-empty names (→ identified).
 */
const consensusNameArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
  fc.string({ minLength: 1 }),
);

/**
 * A vote count covering the nullable integer field exactly as the generated
 * model exposes it: null, undefined, or a non-negative integer.
 */
const totalVotesArb: fc.Arbitrary<number | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer({ min: 0 }),
);

/** The minimal Object shape the overlay-selection logic reads. */
type TestObject = {
  label: string;
  consensusName: string | null | undefined;
  totalVotes: number | null | undefined;
};

const objectArb: fc.Arbitrary<TestObject> = fc.record({
  label: labelArb,
  consensusName: consensusNameArb,
  totalVotes: totalVotesArb,
});

describe('Bear-only overlays and consensus label resolution', () => {
  // Feature: image-gallery, Property 12: Only Bear objects are overlaid; consensus label reflects votes
  // Validates: Requirements 4.3, 4.4, 4.5
  //
  // For any array of detected objects:
  //  - selectBearOverlays returns exactly the subset whose label === BEAR_LABEL,
  //    in input order, with no non-Bear object included — proven by comparing
  //    against the reference `objects.filter(o => o.label === BEAR_LABEL)`.
  //  - resolveConsensusLabel on each overlaid object reflects votes: a non-empty
  //    consensusName yields the identified case carrying that exact name and the
  //    coalesced vote count (null/undefined → 0); a null/undefined/empty
  //    consensusName yields the no-identification placeholder with exactly 0 votes.
  it('Property 12: overlays are exactly the Bear subset and consensus labels reflect votes', () => {
    fc.assert(
      fc.property(fc.array(objectArb), (objects) => {
        const overlays = selectBearOverlays(objects);
        const reference = objects.filter((o) => o.label === BEAR_LABEL);

        // 1. selectBearOverlays returns exactly the Bear subset (order preserved).
        expect(overlays).toEqual(reference);

        // 2. No non-Bear object is ever included in the overlays.
        expect(overlays.every((o) => o.label === BEAR_LABEL)).toBe(true);

        // 3. The consensus label of each overlaid object reflects its votes.
        for (const object of overlays) {
          const result = resolveConsensusLabel(object);
          const hasName =
            object.consensusName !== null &&
            object.consensusName !== undefined &&
            object.consensusName !== '';

          if (hasName) {
            expect(result.identified).toBe(true);
            if (result.identified) {
              expect(result.name).toBe(object.consensusName);
              expect(result.totalVotes).toBe(object.totalVotes ?? 0);
            }
          } else {
            expect(result.identified).toBe(false);
            if (!result.identified) {
              expect(result.placeholder).toBe(NO_IDENTIFICATION_LABEL);
              expect(result.totalVotes).toBe(0);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
