import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { matchesBearPresence } from './filter';

describe('Bear-presence predicate partition', () => {
  // Feature: image-gallery, Property 7: Bear-presence predicate partitions by bearCount
  // Validates: Requirements 2.7, 2.8, 2.9
  //
  // For any non-negative integer bearCount: `'any'` always matches; `'with'`
  // matches iff bearCount >= 1; `'without'` matches iff bearCount === 0. The
  // `'with'` and `'without'` predicates are mutually exclusive and jointly
  // exhaustive, so every image is classified into exactly one of them — the
  // guarantee the bear-presence filter relies on.
  it('Property 7: with/without partition bearCount; any always matches', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0 }), (count) => {
        const any = matchesBearPresence(count, 'any');
        const withBears = matchesBearPresence(count, 'with');
        const withoutBears = matchesBearPresence(count, 'without');

        // 1. `'any'` always matches, regardless of count.
        expect(any).toBe(true);

        // 2. `'with'` matches iff there is at least one bear.
        expect(withBears).toBe(count >= 1);

        // 3. `'without'` matches iff there are no bears.
        expect(withoutBears).toBe(count === 0);

        // 4. Mutual exclusivity: `'with'` and `'without'` are never both true.
        expect(withBears && withoutBears).toBe(false);

        // 5. Joint exhaustiveness: every count >= 0 satisfies one of them.
        expect(withBears || withoutBears).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
