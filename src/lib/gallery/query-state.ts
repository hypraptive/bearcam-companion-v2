/**
 * Query_State module — the single source of truth for encoding/decoding/
 * validating the gallery's URL-driven state.
 *
 * Pure functions only: no Next.js, React, or browser imports, so this module is
 * independently unit- and property-testable (Req 6.1).
 *
 */

import { CAM_FEEDS, type CamFeed } from '@/lib/constants';

/** Number of images shown per gallery page (Req 1.2). */
export const PAGE_SIZE = 24;

/** Maximum accepted length of a search term, after trimming (Req 3.1, 3.8). */
export const MAX_SEARCH_LENGTH = 100;

/** The three bear-presence filter values. */
export const BEAR_PRESENCE_VALUES = ['any', 'with', 'without'] as const;

/** Bear-presence filter: `'any' | 'with' | 'without'`. */
export type BearPresence = (typeof BEAR_PRESENCE_VALUES)[number];

/** Normalized, always-valid gallery state. The rest of the app only ever sees this shape. */
export type QueryState = {
  year: number | null; // null = all years
  feed: CamFeed | null; // null = all feeds
  bears: BearPresence; // defaults to 'any'
  q: string; // trimmed search term, '' = no search
  page: number; // 1-based, >= 1 (not yet clamped to total)
};

/** The default, unfiltered, first-page state. */
export const DEFAULT_QUERY_STATE: QueryState = {
  year: null,
  feed: null,
  bears: 'any',
  q: '',
  page: 1,
};

/**
 * Parse raw URL search params into a normalized QueryState. NEVER throws and
 * NEVER produces an invalid field: unrecognized / malformed values fall back to
 * their default, so a bad URL degrades to the default unfiltered state rather
 * than blocking browsing (Req 6.5). An over-length search term is dropped to ''
 * (Req 6.5). page < 1 or non-integer becomes 1 (final clamp to the last page
 * happens later, once the page count is known — Req 6.6).
 */
export function parseQueryState(
  raw: Record<string, string | string[] | undefined>,
): QueryState {
  return {
    year: parseYear(firstValue(raw.year)),
    feed: parseFeed(firstValue(raw.feed)),
    bears: parseBears(firstValue(raw.bears)),
    q: parseSearch(firstValue(raw.q)),
    page: parsePage(firstValue(raw.page)),
  };
}

/**
 * Normalize a raw param value (which may be a string, an array of strings, or
 * undefined) down to a single string or undefined. Arrays use their first
 * element; an empty array is treated as absent.
 */
function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  return value;
}

/** Parse an integer from a raw string, returning null for anything non-integer. */
function parseIntStrict(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isInteger(n) ? n : null;
}

/** year: positive integer, otherwise null (all years). */
function parseYear(value: string | undefined): number | null {
  const n = parseIntStrict(value);
  return n !== null && n > 0 ? n : null;
}

/** feed: must be an exact CAM_FEEDS key, otherwise null (all feeds). */
function parseFeed(value: string | undefined): CamFeed | null {
  if (value !== undefined && Object.prototype.hasOwnProperty.call(CAM_FEEDS, value)) {
    return value as CamFeed;
  }
  return null;
}

/** bears: must be a known presence value, otherwise 'any'. */
function parseBears(value: string | undefined): BearPresence {
  return (BEAR_PRESENCE_VALUES as readonly string[]).includes(value ?? '')
    ? (value as BearPresence)
    : 'any';
}

/** q: trimmed; empty/whitespace or over-length drops to '' (Req 6.5). */
function parseSearch(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SEARCH_LENGTH) return '';
  return trimmed;
}

/** page: positive integer, otherwise 1 (final clamp happens in clampPage). */
function parsePage(value: string | undefined): number {
  const n = parseIntStrict(value);
  return n !== null && n >= 1 ? n : 1;
}

/**
 * Serialize a QueryState back to a URLSearchParams, omitting default-valued keys
 * so the default state produces a clean, empty query string.
 */
export function toSearchParams(state: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.year !== null) params.set('year', String(state.year));
  if (state.feed !== null) params.set('feed', state.feed);
  if (state.bears !== 'any') params.set('bears', state.bears);
  if (state.q !== '') params.set('q', state.q);
  if (state.page !== 1) params.set('page', String(state.page));
  return params;
}

/** Clamp a 1-based page to [1, max(totalPages, 1)] (Req 6.6). */
export function clampPage(page: number, totalPages: number): number {
  const max = Math.max(totalPages, 1);
  if (page <= 1) return 1;
  if (page >= max) return max;
  return page;
}

/**
 * Validate/normalize a raw search term: trim, treat empty/whitespace as cleared
 * (Req 3.7), reject (return `{ ok: false }`) when it exceeds MAX_SEARCH_LENGTH
 * (Req 3.8).
 */
export function normalizeSearchTerm(
  raw: string,
): { ok: true; term: string } | { ok: false; reason: 'too-long' } {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_SEARCH_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  return { ok: true, term: trimmed };
}

/**
 * Apply a control change (a partial Query_State edit from a filter/search/
 * pagination control) to the current state, returning a new normalized
 * QueryState.
 *
 * The `q` field of `change`, if present, is trimmed before being compared and
 * applied, so callers may pass raw input.
 *
 * Pagination is reset to the first page (`page = 1`) whenever the change alters
 * a filter dimension — `year`, `feed`, or `bears` — or sets a NEW non-empty
 * trimmed `q` relative to `current` (Req 2.12, 3.4). A change that leaves every
 * filter dimension untouched (e.g. only `page` moves, or `q` normalizes to the
 * same value, or the search is cleared) preserves the incoming `page` and does
 * not force it back to 1.
 */
export function applyControlChange(
  current: QueryState,
  change: Partial<QueryState>,
): QueryState {
  // Trim q from the change (if present) before comparing/applying.
  const trimmedQ = change.q !== undefined ? change.q.trim() : undefined;

  const merged: QueryState = {
    ...current,
    ...change,
    ...(trimmedQ !== undefined ? { q: trimmedQ } : {}),
  };

  const yearChanged = merged.year !== current.year;
  const feedChanged = merged.feed !== current.feed;
  const bearsChanged = merged.bears !== current.bears;
  // Only a NEW non-empty search term forces page 1 (Req 3.4); clearing the
  // search is governed by the remaining filters and does not reset the page.
  const newNonEmptySearch = merged.q !== current.q && merged.q !== '';

  if (yearChanged || feedChanged || bearsChanged || newNonEmptySearch) {
    return { ...merged, page: 1 };
  }

  return merged;
}

/**
 * Clear all filters, search, and pagination, returning exactly the default
 * unfiltered first-page state (Req 2.13).
 */
export function applyClear(): QueryState {
  return DEFAULT_QUERY_STATE;
}
