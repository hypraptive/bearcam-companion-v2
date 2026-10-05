'use client';

/**
 * BoundingBoxLayer — the absolutely-positioned overlay container that draws one
 * Bounding_Box_Overlay per Bear_Object over the rendered image on the
 * Image_Detail_Page (Req 4.2, 4.3).
 *
 * Client Component: it measures the live rendered size of its parent image
 * wrapper (which Tailwind/Next.js size responsively) and recomputes overlay
 * geometry when that size changes. Measurement uses a `ref` + `ResizeObserver`,
 * falling back to the element's `clientWidth`/`clientHeight`, and is guarded for
 * SSR so nothing touches the DOM on the server.
 *
 * Division of labor:
 * - `selectBearOverlays` decides which Objects are overlaid (only `label === "Bear"`).
 * - `computeOverlayRect` (pure) scales each Bear object's fractional box into
 *   pixel coordinates for the measured width/height.
 * - `BoundingBox` paints a single rectangle + its `ConsensusLabel`.
 *
 * Renders zero overlays when there are no Bear objects, or until the rendered
 * image box has been measured (width and height both greater than zero).
 */

import { useEffect, useRef, useState } from 'react';

import type { ObjectModel } from '@/lib/amplify/gallery';
import { computeOverlayRect } from '@/lib/bears/geometry';
import { selectBearOverlays } from '@/lib/bears/overlay-selection';
import { BoundingBox } from '@/components/bears/bounding-box';

type BoundingBoxLayerProps = {
  /** All detected Objects for the image; non-Bear objects are ignored here. */
  objects: ObjectModel[];
};

type Size = {
  width: number;
  height: number;
};

const ZERO_SIZE: Size = { width: 0, height: 0 };

export function BoundingBoxLayer({ objects }: BoundingBoxLayerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>(ZERO_SIZE);

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return;

    const measure = (): void => {
      setSize((previous) => {
        const width = element.clientWidth;
        const height = element.clientHeight;
        if (previous.width === width && previous.height === height) {
          return previous;
        }
        return { width, height };
      });
    };

    // Initial measurement once mounted on the client.
    measure();

    // Prefer ResizeObserver so overlays track responsive/layout size changes;
    // fall back to a one-time measurement if it is unavailable (older browsers).
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const bearObjects = selectBearOverlays(objects);
  const measured = size.width > 0 && size.height > 0;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      {measured &&
        bearObjects.map((object) => (
          <BoundingBox
            key={object.id}
            object={object}
            rect={computeOverlayRect(
              {
                left: object.left ?? 0,
                top: object.top ?? 0,
                width: object.width ?? 0,
                height: object.height ?? 0,
              },
              size.width,
              size.height,
            )}
          />
        ))}
    </div>
  );
}
