import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  bearListMatches,
  isInUtcYear,
  matchesBearPresence,
  matchesFilter,
  type FilterableImage,
  type GalleryFilter,
} from './filter';
import { BEAR_PRESENCE_VALUES, type BearPresence } from './query-state';
import { CAM_FEEDS, type CamFeed } from '@/lib/constants';

/**
 * The five known camera feed codes, drawn from the single source of truth so
 * this test tracks any future additions to `CAM_FEEDS`.
 */
const CAM_FEED_CODES = Object.keys(CAM_FEEDS) as CamFeed[];

/**
 * The calendar year the filter's `year` predicate selects when active. Images
 * are generated with dates spanning `TARGET_YEAR - 1` through `TARGET_YEAR + 1`
 * so a healthy mix fall both inside and outside the filtered year.
 */
const TARGET_YEAR = 2023;

/** Inclusive UTC epoch-ms bounds for a calendar year. */
function utcYearBounds(year: number): { start: number; end: number } {
  return {
    start: Date.UTC(year, 0, 1, 0, 0, 0, 0),
    end: Date.UTC(year, 11, 31, 23, 59, 59, 999),
  };
}

/**
 * An ISO date string that lands somewhere in `[TARGET_YEAR - 1, TARGET_YEAR + 1]`,
 * i.e. deliberately spanning multiple years so generated instants land both in
 * and out of the filter's target year.
 */
const dateArb: fc.Arbitrary<string> = fc
  .integer({
    min: utcYearBounds(TARGET_YEAR - 1).start,
    max: utcYearBounds(TARGET_YEAR + 1).end,
  })
  .map((ms) => new Date(ms).toISOString());

/** A camFeed value: one of the five codes, or null (feed missing). */
const camFeedArb: fc.Arbitrary<CamFeed | null> = fc.option(fc.constantFrom(...CAM_FEED_CODES), {
  nil: null,
});

/** A non-negative bearCount, or null (count missing). */
const bearCountArb: fc.Arbitrary<number | null> = fc.option(fc.integer({ min: 0, max: 12 }), {
  nil: null,
});

/**
 * A bearList: a comma-joined set of tokens, or null. Tokens are drawn from a
 * small realistic vocabulary of bear identifiers so search terms sometimes hit
 * and sometimes miss.
 */
const bearListArb: fc.Arbitrary<string | null> = fc.option(
  fc
    .array(fc.constantFrom('480 Otis', '128 Grazer', '747', 'Unknown', 'Not a bear', '32 Chunk'), {
      maxLength: 4,
    })
    .map((tokens) => tokens.join(',')),
  { nil: null },
);

/** A single filterable image record. */
const imageArb: fc.Arbitrary<FilterableImage> = fc.record({
  date: dateArb,
  camFeed: camFeedArb,
  bearCount: bearCountArb,
  bearList: bearListArb,
});

/**
 * A search term `q`: often empty (inactive) and otherwise a token or substring
 * that may or may not appear in a generated bearList — exercising both the
 * active and inactive search paths, and both hits and misses.
 */
const qArb: fc.Arbitrary<string> = fc.constantFrom(
  '',
  '   ',
  'otis',
  'OTIS',
  'Grazer',
  '747',
  'chunk',
  'nope',
  ', ',
);

/** An arbitrary GalleryFilter, with each dimension independently active or inactive. */
const filterArb: fc.Arbitrary<GalleryFilter> = fc.record({
  year: fc.option(fc.constantFrom(TARGET_YEAR - 1, TARGET_YEAR, TARGET_YEAR + 1), { nil: null }),
  feed: camFeedArb,
  bears: fc.constantFrom<BearPresence>(...BEAR_PRESENCE_VALUES),
  q: qArb,
});

describe('matchesFilter combined logical AND', () => {
  // Feature: image-gallery, Property 8: Combined filters are a logical AND
  // Validates: Requirements 2.10, 3.3
  //
  // For any set of images and any GalleryFilter, an image is included in the
  // filtered result iff it satisfies the year predicate AND the feed predicate
  // AND the bear-presence predicate AND the search predicate, where each
  // inactive filter (year null, feed null, bears 'any', q trimmed to '') is
  // treated as always-true. We assert `matchesFilter` equals an independently
  // computed AND of the four component predicates — closing the loop so the
  // combined predicate can never silently diverge from its parts.
  it('Property 8: inclusion iff year AND feed AND bear-presence AND search all pass', () => {
    fc.assert(
      fc.property(fc.array(imageArb, { maxLength: 25 }), filterArb, (images, filter) => {
        for (const image of images) {
          // Independent reference: mirror the AND semantics using the component
          // predicates directly, treating each inactive filter as always-true.
          const yearOk = filter.year === null || isInUtcYear(image.date, filter.year);
          const feedOk = filter.feed === null || image.camFeed === filter.feed;
          const bearsOk = matchesBearPresence(image.bearCount, filter.bears);
          const searchOk = filter.q.trim() === '' || bearListMatches(image.bearList, filter.q);
          const expected = yearOk && feedOk && bearsOk && searchOk;

          expect(matchesFilter(image, filter)).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });
});
