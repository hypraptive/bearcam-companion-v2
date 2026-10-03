import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { CAM_FEEDS, type CamFeed } from './constants';

describe('CAM_FEEDS', () => {
  // Feature: project-setup, Property 4: CAM_FEEDS key completeness
  // Validates: Requirements 7.1, 7.3
  //
  // For any value of type CamFeed ("BF" | "RF" | "BFL" | "KRV" | "RW"),
  // looking it up in CAM_FEEDS always returns a non-empty string — no CamFeed
  // value maps to undefined or an empty string.
  it('Property 4: maps every CamFeed key to a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CamFeed>('BF', 'RF', 'BFL', 'KRV', 'RW'),
        (key) => {
          const slug = CAM_FEEDS[key];
          expect(typeof slug).toBe('string');
          expect(slug.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 5 },
    );
  });
});
