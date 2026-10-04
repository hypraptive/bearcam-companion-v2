/**
 * Bounding-box overlay geometry — the pure math that scales an object's
 * fractional bounding box into pixel coordinates for a rendered image box.
 *
 * Pure functions only: no React, Next.js, or browser imports, so this module is
 * independently unit- and property-testable. The detail page's overlay layer
 * measures the rendered image box (width `W`, height `H`) and calls
 * `computeOverlayRect` to position each overlay responsively (Req 4.2).
 */

/**
 * An object's bounding box expressed as fractions of the image dimensions
 * (each value in `[0, 1]`), matching the Rekognition format stored on `Object`.
 */
export type FractionalRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * A bounding box scaled into pixel coordinates relative to the rendered image
 * box's top-left corner.
 */
export type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Scales a fractional bounding box into pixel coordinates for a rendered image
 * box of width `renderedWidth` (`W`) and height `renderedHeight` (`H`).
 *
 * Returns `{ left: left*W, top: top*H, width: width*W, height: height*H }`
 * (Req 4.2). When the fractional box stays within the unit square
 * (`left + width <= 1` and `top + height <= 1`), the result stays within the
 * rendered box — right edge `<= W`, bottom edge `<= H`.
 */
export function computeOverlayRect(
  { left, top, width, height }: FractionalRect,
  renderedWidth: number,
  renderedHeight: number,
): OverlayRect {
  return {
    left: left * renderedWidth,
    top: top * renderedHeight,
    width: width * renderedWidth,
    height: height * renderedHeight,
  };
}
