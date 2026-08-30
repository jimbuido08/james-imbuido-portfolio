/**
 * The one z-scale for the Data Universe stack. The canvas floats inside the
 * page while its drei `<Html>` labels escape it as sibling DOM — so label
 * z-indexes, the DOM overlay, the header scrim, and the header itself must
 * agree on one order or labels paint over the mobile menu (the original bug
 * these values fixed). Touching any layer's stacking means touching only this
 * file plus its single import per consumer.
 */

/**
 * drei `<Html>` zIndexRange for labels inside the canvas: the range is clamped
 * to low 0–10 values so a label's inline z-index stays under the header (z-50)
 * and under the overlay (z-10). drei's default (≈16.7M) escapes the page
 * entirely.
 */
export const CANVAS_LABEL_Z_RANGE: [number, number] = [10, 0];

/** DOM overlay (hover card + hint) above page content, below the header scrim. */
export const UNIVERSE_OVERLAY_Z = "z-10";

/** Mobile nav scrim: dims the universe while the header menu is open. */
export const HEADER_SCRIM_Z = "z-40";

/** Header bar and its dropdown menu — the top of the whole stack. */
export const HEADER_Z = "z-50";
