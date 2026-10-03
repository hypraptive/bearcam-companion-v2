import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { cn } from './utils';

// Feature: project-setup, Property 2: cn() non-conflicting class preservation
// Validates: Requirements 7.4
//
// The task's generator draws from ['flex', 'block', 'hidden', 'rounded', 'border'].
// NOTE: 'flex', 'block', and 'hidden' are all Tailwind `display` utilities and DO
// conflict with one another under tailwind-merge — when more than one appears, only
// the LAST occurrence survives (last-wins). 'rounded' and 'border' belong to their
// own non-conflicting groups and always survive.
//
// Therefore a naive "output contains every input class" assertion is wrong for this
// generator. The correct preservation property is: every class that is the LAST of
// its conflict group in the input must appear in the output. We model this by walking
// the input and, for each conflict group, keeping only the last class seen from that
// group; the resulting set is exactly what tailwind-merge should preserve.
//
// Matching is done on a whitespace token basis (word boundary), not raw substring, so
// e.g. 'border' is not spuriously matched inside some other token.

// Map each generated class to the identifier of the conflict group it belongs to.
// Classes sharing a group id conflict with each other; distinct ids never conflict.
const CONFLICT_GROUP: Record<string, string> = {
  flex: 'display',
  block: 'display',
  hidden: 'display',
  rounded: 'rounded',
  border: 'border',
};

/**
 * Given the ordered input classes, return the set of classes that should survive
 * tailwind-merge resolution: for each conflict group, only the last occurrence wins.
 */
function survivingClasses(classes: string[]): Set<string> {
  // Track the winning class per conflict group in input order (later overwrites earlier).
  const winnerByGroup = new Map<string, string>();
  for (const cls of classes) {
    const group = CONFLICT_GROUP[cls];
    winnerByGroup.set(group, cls);
  }
  return new Set(winnerByGroup.values());
}

/** True if `cls` appears as a whitespace-delimited token within `output`. */
function containsClassToken(output: string, cls: string): boolean {
  return output.split(/\s+/).includes(cls);
}

describe('cn() non-conflicting class preservation (Property 2)', () => {
  it('preserves every class that is the last of its conflict group', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('flex', 'block', 'hidden', 'rounded', 'border')),
        (classes) => {
          const output = cn(...classes);
          const expected = survivingClasses(classes);

          // Every surviving (last-of-group) class must be present as a token.
          for (const cls of expected) {
            expect(containsClassToken(output, cls)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
