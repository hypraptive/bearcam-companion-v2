'use client';

/**
 * BoundingBox — a single Bounding_Box_Overlay drawn over the rendered image on
 * the Image_Detail_Page.
 *
 * Renders one absolutely-positioned rectangle from a pre-computed pixel `rect`
 * (produced by `computeOverlayRect` in `@/lib/bears/geometry`) and nests a
 * `ConsensusLabel` showing the object's crowd-sourced identification and vote
 * count (Req 4.2, 4.4, 4.5).
 *
 * Client Component: this overlay is positioned against the dynamically measured
 * rendered image box by its parent `BoundingBoxLayer`, which lives in the client
 * bundle. The actual geometry math is pure and done upstream — this component
 * only paints the result.
 *
 * Styling note: static styling (border, positioning mode, label placement) is
 * expressed with Tailwind utility classes. The dynamic pixel geometry is applied
 * via an inline `style` because Tailwind cannot express arbitrary runtime pixel
 * values; this is the one sanctioned use of inline style for computed geometry.
 */

import type { OverlayRect } from '@/lib/bears/geometry';
import type { ObjectModel } from '@/lib/amplify/gallery';
import { ConsensusLabel } from '@/components/bears/consensus-label';

type BoundingBoxProps = {
  /** Pixel-space rectangle for the overlay, relative to the rendered image box. */
  rect: OverlayRect;
  /** The detected Object this overlay represents. */
  object: ObjectModel;
};

export function BoundingBox({ rect, object }: BoundingBoxProps): React.JSX.Element {
  return (
    <div
      className="pointer-events-none absolute rounded-sm border-2 border-amber-400 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
      style={{
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    >
      <span className="absolute left-0 top-full mt-0.5 whitespace-nowrap">
        <ConsensusLabel
          consensusName={object.consensusName ?? null}
          totalVotes={object.totalVotes ?? null}
        />
      </span>
    </div>
  );
}
