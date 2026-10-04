import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { normalizeSearchTerm } from './query-state';

/**
 * A term that is empty or consists solely of whitespace characters. Built by
 * joining an arbitrary-length array of whitespace characters, which includes
 * the empty array → `''`. This spans the full "nothing to search for" input
 * space: pure whitespace in any combination, plus the empty string itself.
 */
const whitespaceTermArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'))
  .map((chars) => chars.join(''));

/**
 * An arbitrary `bearList` value, including the empty string, any string, and
 * the null/undefined "no bears recorded" cases the filter must tolerate.
 */
const bearListArb: fc.Arbitrary<string | null | undefined> = fc.option(fc.string(), {
  nil: undefined,
});

describe('Empty/whitespace search behaves as a cleared search', () => {
  // Feature: image-gallery, Property 5: Empty/whitespace search matches like a cleared search
  // Validates: Requirements 3.6, 3.7
  //
  // For any `bearList` string and any search term that is empty or consists
  // solely of whitespace, `normalizeSearchTerm` collapses the term to the
  // cleared term `''`. Because the gallery's search flow only ever calls
  // `bearListMatches` with a *non-empty* trimmed term, a normalized `''` means
  // the caller skips `bearListMatches` entirely — the search filter is inactive
  // and filtering is governed solely by the remaining active filters.
  it('Property 5: empty/whitespace terms normalize to the cleared term, independent of bearList', () => {
    fc.assert(
      fc.property(bearListArb, whitespaceTermArb, (_bearList, whitespaceTerm) => {
        const normalized = normalizeSearchTerm(whitespaceTerm);

        // (1) An empty or all-whitespace term always normalizes to the cleared
        // state `{ ok: true, term: '' }`, regardless of the bearList under test.
        expect(normalized).toEqual({ ok: true, term: '' });

        // (2) "Governed only by the remaining filters": the normalized term is
        // the cleared term `''`, so the search filter is inactive. The caller
        // treats this as a cleared search and skips `bearListMatches` entirely,
        // letting the other filters decide inclusion.
        expect(normalized.ok).toBe(true);
        expect(normalized.ok === true && normalized.term === '').toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
