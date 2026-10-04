import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { bearListMatches } from './filter';

/**
 * A bear-name token for a `bearList`. Real bear-name tokens never contain a
 * comma — the comma is the token separator — so the generated tokens must
 * exclude it, otherwise the token/separator semantics break and the reference
 * oracle (`tokens.some(...)`) would disagree with the comma-split under test.
 */
const tokenArb: fc.Arbitrary<string> = fc
  .string()
  .map((s) => s.replace(/,/g, ''));

/**
 * A non-empty search term, also constrained to exclude commas: a term that
 * contains a comma can never be a substring of any single comma-free token, so
 * including commas would only exercise the trivially-false path.
 */
const termArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1 })
  .map((s) => s.replace(/,/g, ''))
  .filter((s) => s.length >= 1);

describe('bearList comma-scoped case-insensitive search', () => {
  // Feature: image-gallery, Property 4: bearList search is comma-token-scoped and case-insensitive
  // Validates: Requirements 3.2
  //
  // For any list of comma-free bear-name tokens joined with commas and any
  // non-empty search term, bearListMatches returns true iff at least one
  // individual token contains the term as a case-insensitive substring. A term
  // that would only match by spanning across a comma separator must NOT match,
  // because the reference oracle tests each token independently. Comparing both
  // sides lowercased simultaneously proves comma-token-scoping and
  // case-insensitivity.
  it('Property 4: matches iff some individual token contains the term (case-insensitive, never across a comma)', () => {
    fc.assert(
      fc.property(fc.array(tokenArb), termArb, (tokens, term) => {
        const bearList = tokens.join(',');
        const needle = term.toLowerCase();
        const expected = tokens.some((t) => t.toLowerCase().includes(needle));
        expect(bearListMatches(bearList, term)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('does not match a term that only spans across a comma separator', () => {
    const bearList = ['480 Otis', '128 Grazer'].join(',');
    // 'Otis,128' only appears in the joined string by bridging the comma; no
    // single token contains it, so the result must be false.
    expect(bearListMatches(bearList, 'Otis,128')).toBe(false);
  });

  it('matches case-insensitively within a token', () => {
    const bearList = ['480 Otis'].join(',');
    expect(bearListMatches(bearList, 'otis')).toBe(true);
    expect(bearListMatches(bearList, 'OTIS')).toBe(true);
  });
});
