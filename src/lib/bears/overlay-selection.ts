/**
 * Overlay-selection module — pure logic for choosing which detected Objects are
 * drawn as bounding-box overlays on the Image_Detail_Page, and for resolving the
 * Consensus_Label text/vote count for each.
 *
 * Pure functions only: no React, Next.js, or browser imports, so this module is
 * independently unit- and property-testable (design §Property 12).
 *
 * Consumes the generated `Object` model type rather than duplicating it
 * (conventions: "do not manually duplicate model types").
 */

import type { Schema } from '../../../amplify/data/resource';

type ObjectModel = Schema['Object']['type'];

/**
 * The exact label string that marks an Object as a bear. Only Objects whose
 * `label` equals this value are overlaid on the detail page (Req 4.3).
 */
export const BEAR_LABEL = 'Bear';

/**
 * Placeholder text shown on a Bear_Object's Consensus_Label when no
 * identification has been submitted yet, i.e. `consensusName` is null (Req 4.5).
 * Exported so components and tests share one source of truth rather than
 * repeating a magic string.
 */
export const NO_IDENTIFICATION_LABEL = 'No identification yet';

/**
 * Minimal structural shape needed to decide whether an Object is overlaid.
 * Any value carrying a `label` field (including the generated `ObjectModel`)
 * satisfies this, so callers never need to duplicate the full model type.
 */
type Labeled = { label: ObjectModel['label'] };

/**
 * Minimal structural input for consensus-label resolution. Accepts the possibly
 * null/undefined denormalized fields exactly as the generated model exposes them.
 */
export type ConsensusInput = {
  consensusName: string | null | undefined;
  totalVotes: number | null | undefined;
};

/**
 * Resolved Consensus_Label, discriminated on `identified` so the identified case
 * always carries a concrete `name`, while both cases always carry a numeric
 * `totalVotes` (0 in the no-identification case, per Req 4.5).
 */
export type ConsensusLabel =
  | { identified: true; name: string; totalVotes: number }
  | { identified: false; placeholder: typeof NO_IDENTIFICATION_LABEL; totalVotes: 0 };

/**
 * Return only the Objects that are overlaid on the detail page: those whose
 * `label` equals the exact string "Bear" (Req 4.3). Preserves input order and
 * returns an empty array when there are no Bear objects.
 *
 * Generic over the input element type so it works with the full generated
 * `ObjectModel` (narrowing the result to that same type) without duplicating it.
 */
export function selectBearOverlays<T extends Labeled>(objects: readonly T[]): T[] {
  return objects.filter((object) => object.label === BEAR_LABEL);
}

/**
 * Resolve the Consensus_Label for a Bear_Object.
 *
 * - When `consensusName` is a non-null, non-empty string: identified case —
 *   returns the name plus the integer vote count (null/undefined votes coalesce
 *   to 0) (Req 4.4).
 * - Otherwise: no-identification case — returns the placeholder and a vote count
 *   of exactly 0, regardless of the incoming `totalVotes` (Req 4.5).
 */
export function resolveConsensusLabel({
  consensusName,
  totalVotes,
}: ConsensusInput): ConsensusLabel {
  if (consensusName !== null && consensusName !== undefined && consensusName !== '') {
    return {
      identified: true,
      name: consensusName,
      totalVotes: totalVotes ?? 0,
    };
  }

  return {
    identified: false,
    placeholder: NO_IDENTIFICATION_LABEL,
    totalVotes: 0,
  };
}
