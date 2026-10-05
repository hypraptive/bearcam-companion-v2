/**
 * ConsensusLabel — the text label attached to a Bounding_Box_Overlay showing an
 * Object's crowd-sourced consensus identification and vote count.
 *
 * Server-safe: no `'use client'` directive, no React hooks, and no browser APIs,
 * so it can render inside a Server Component or be nested within the client-side
 * `BoundingBox` without pulling either into the client bundle unnecessarily.
 *
 * All label/vote resolution is delegated to the pure `resolveConsensusLabel`
 * helper (Req 4.4, 4.5) so the display logic has a single source of truth.
 */

import { resolveConsensusLabel } from '@/lib/bears/overlay-selection';

type ConsensusLabelProps = {
  /** Plurality winner for the Object, or null when no identification exists. */
  consensusName: string | null;
  /** Total number of identifications; null is treated as zero. */
  totalVotes: number | null;
};

export function ConsensusLabel({
  consensusName,
  totalVotes,
}: ConsensusLabelProps): React.JSX.Element {
  const label = resolveConsensusLabel({ consensusName, totalVotes });

  if (label.identified) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
        <span>{label.name}</span>
        <span className="tabular-nums text-white/70">
          {label.totalVotes} {label.totalVotes === 1 ? 'vote' : 'votes'}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white/70 italic">
      <span>{label.placeholder}</span>
      <span className="tabular-nums not-italic">{label.totalVotes} votes</span>
    </span>
  );
}
