import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUERY_STATE,
  MAX_SEARCH_LENGTH,
  normalizeSearchTerm,
  parseQueryState,
} from './query-state';

/**
 * Example-based unit tests for the concrete parse/normalize edge cases called
 * out in the design. These complement the property-based tests (Properties 1-3)
 * by pinning down specific boundary behavior.
 *
 * Covers:
 *   - Requirement 6.5: malformed/unknown Query_State degrades to the default so
 *     browsing is never blocked.
 *   - Requirement 3.8: a search term over the max length is rejected.
 */
describe('Query_State parse/normalize edge cases', () => {
  describe('parseQueryState', () => {
    it('maps empty params to the default state (Req 6.5)', () => {
      expect(parseQueryState({})).toEqual(DEFAULT_QUERY_STATE);
    });

    it('normalizes page=0 to page 1 (Req 6.5)', () => {
      expect(parseQueryState({ page: '0' }).page).toBe(1);
    });

    it('normalizes a negative page to page 1 (Req 6.5)', () => {
      expect(parseQueryState({ page: '-5' }).page).toBe(1);
    });

    it('normalizes a non-integer page to page 1 (Req 6.5)', () => {
      expect(parseQueryState({ page: '1.5' }).page).toBe(1);
      expect(parseQueryState({ page: 'abc' }).page).toBe(1);
    });

    it('drops an unrecognized feed code to null (Req 6.5)', () => {
      expect(parseQueryState({ feed: 'XX' }).feed).toBeNull();
    });

    it('is case-sensitive for feed codes — lowercase is unrecognized (Req 6.5)', () => {
      expect(parseQueryState({ feed: 'bf' }).feed).toBeNull();
    });

    it('keeps a recognized feed code', () => {
      expect(parseQueryState({ feed: 'BF' }).feed).toBe('BF');
    });

    it('accepts a search term of exactly MAX_SEARCH_LENGTH chars (Req 3.8)', () => {
      const q = 'a'.repeat(MAX_SEARCH_LENGTH);
      expect(parseQueryState({ q }).q).toBe(q);
    });

    it('drops an over-length (MAX_SEARCH_LENGTH + 1) search term to empty (Req 3.8, 6.5)', () => {
      const q = 'a'.repeat(MAX_SEARCH_LENGTH + 1);
      expect(parseQueryState({ q }).q).toBe('');
    });

    it('does not degrade when only some params are malformed', () => {
      // A valid feed survives even though page and feed-casing elsewhere differ.
      expect(parseQueryState({ feed: 'RF', page: '0', bears: 'nope' })).toEqual({
        ...DEFAULT_QUERY_STATE,
        feed: 'RF',
      });
    });
  });

  describe('normalizeSearchTerm', () => {
    it('accepts a term of exactly MAX_SEARCH_LENGTH chars (Req 3.8)', () => {
      const term = 'a'.repeat(MAX_SEARCH_LENGTH);
      expect(normalizeSearchTerm(term)).toEqual({ ok: true, term });
    });

    it('rejects a term of MAX_SEARCH_LENGTH + 1 chars with reason too-long (Req 3.8)', () => {
      const term = 'a'.repeat(MAX_SEARCH_LENGTH + 1);
      expect(normalizeSearchTerm(term)).toEqual({ ok: false, reason: 'too-long' });
    });

    it('measures length after trimming — padding does not push a valid term over the limit (Req 3.8)', () => {
      const term = 'a'.repeat(MAX_SEARCH_LENGTH);
      const padded = `   ${term}   `;
      expect(normalizeSearchTerm(padded)).toEqual({ ok: true, term });
    });

    it('treats empty and whitespace-only input as a cleared term', () => {
      expect(normalizeSearchTerm('')).toEqual({ ok: true, term: '' });
      expect(normalizeSearchTerm('   \t\n ')).toEqual({ ok: true, term: '' });
    });
  });
});
