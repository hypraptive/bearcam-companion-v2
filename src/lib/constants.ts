/**
 * Shared constants for BearCam Companion v2.
 *
 * This module has zero Next.js or browser dependencies so it is safe to import
 * from Lambda functions in `amplify/functions/*` as well as from frontend code.
 * Do not add imports from `next/*`, React, or any browser-only API here.
 */

/**
 * Canonical mapping of camera feed codes to their explore.org snapshot slugs.
 * This is the single source of truth for feed codes — do not hardcode slugs elsewhere.
 */
export const CAM_FEEDS = {
  BF: 'brown-bear-salmon-cam-brooks-falls',
  RF: 'brown-bear-salmon-cam-the-riffles',
  BFL: 'brooks-falls-brown-bears-low',
  KRV: 'brown-bear-salmon-cam-lower-river',
  RW: 'river-watch-brown-bear-salmon-cams',
} as const satisfies Record<string, string>;

/**
 * Union of valid camera feed codes: `"BF" | "RF" | "BFL" | "KRV" | "RW"`.
 */
export type CamFeed = keyof typeof CAM_FEEDS;

/**
 * Fixed, ordered list of non-bear / meta identification labels shown at the top
 * of the identification dropdown, before named bears from the Bear table.
 */
export const META_IDENTIFICATION_OPTIONS = [
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
] as const;

/**
 * Union of the meta identification option string literals.
 */
export type MetaIdentificationOption = (typeof META_IDENTIFICATION_OPTIONS)[number];
