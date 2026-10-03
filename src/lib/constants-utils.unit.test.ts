import { describe, expect, it } from 'vitest';

import { CAM_FEEDS, META_IDENTIFICATION_OPTIONS } from './constants';
import { cn } from './utils';

/**
 * Example-based unit tests for shared constants and utilities.
 *
 * Validates: Requirements 7.1, 7.2
 */

describe('CAM_FEEDS', () => {
  it('has exactly 5 feed codes', () => {
    expect(Object.keys(CAM_FEEDS)).toHaveLength(5);
  });

  it('maps each feed code to its canonical explore.org slug', () => {
    expect(CAM_FEEDS).toEqual({
      BF: 'brown-bear-salmon-cam-brooks-falls',
      RF: 'brown-bear-salmon-cam-the-riffles',
      BFL: 'brooks-falls-brown-bears-low',
      KRV: 'brown-bear-salmon-cam-lower-river',
      RW: 'river-watch-brown-bear-salmon-cams',
    });
  });
});

describe('META_IDENTIFICATION_OPTIONS', () => {
  const expected = [
    'Not a bear',
    'Unknown',
    'Unknown Adult',
    'Unknown Subadult',
    'Known Adult',
    'Known Subadult',
    'Cub (COY)',
    'Cub (1.5yo)',
    'Cub (2.5yo)',
    'Cub (3.5yo)',
  ];

  it('has exactly 10 entries in the expected order', () => {
    expect(META_IDENTIFICATION_OPTIONS).toHaveLength(10);
    expect([...META_IDENTIFICATION_OPTIONS]).toEqual(expected);
  });

  it('contains no duplicate entries', () => {
    const unique = new Set(META_IDENTIFICATION_OPTIONS);
    expect(unique.size).toBe(META_IDENTIFICATION_OPTIONS.length);
  });
});

describe('cn', () => {
  it('returns a plain string when called with zero arguments', () => {
    const result = cn();
    expect(typeof result).toBe('string');
  });
});
