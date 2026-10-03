import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cn } from './utils';

/**
 * Returns true if `token` appears as a whole class token in the
 * space-separated class string `output`. Matching on token boundaries avoids
 * substring false matches (e.g. "p-2" would otherwise match inside "gap-2").
 */
function hasClassToken(output: string, token: string): boolean {
  return output.split(/\s+/).includes(token);
}

describe('cn() last-wins conflict resolution', () => {
  // Feature: project-setup, Property 1: cn() last-wins conflict resolution
  // Validates: Requirements 7.4
  it('keeps the second conflicting class and drops the first', () => {
    // Pairs of conflicting Tailwind utilities. The two values in each pair are
    // chosen so neither is a substring of the other, preventing false
    // "contains" matches.
    const conflictingPairs: ReadonlyArray<readonly [string, string]> = [
      ['text-red-500', 'text-blue-500'],
      ['p-2', 'p-4'],
      ['m-1', 'm-8'],
      ['bg-green-500', 'bg-yellow-500'],
      ['w-full', 'w-screen'],
      ['flex', 'block'],
    ];

    fc.assert(
      fc.property(fc.constantFrom(...conflictingPairs), ([firstClass, secondClass]) => {
        const result = cn(firstClass, secondClass);

        // The later class wins.
        expect(hasClassToken(result, secondClass)).toBe(true);
        // The earlier conflicting class is removed.
        expect(hasClassToken(result, firstClass)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
