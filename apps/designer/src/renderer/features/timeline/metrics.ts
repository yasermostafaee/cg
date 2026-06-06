/**
 * Row heights (px) for the timeline tree. Kept in a plain module so both the
 * row components and their vanilla-extract stylesheets (`*.css.ts`) can import
 * them — the label and lane halves of a row must stay the exact same height or
 * the two columns drift out of alignment as you scroll.
 */
export const ELEMENT_ROW_HEIGHT = 24;
export const TRACK_ROW_HEIGHT = 22;
export const DISPLAY_ROW_HEIGHT = 22;
