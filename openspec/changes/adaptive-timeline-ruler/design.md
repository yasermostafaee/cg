# Design — adaptive Timeline ruler (B-416)

## Two densities

Number labels and minor grid lines no longer share one terminal stride. Label spacing estimates the
largest frame number's rendered width and divides the measured lane viewport by that minimum. Grid
spacing targets a denser 16 px minimum. Both raw intervals round upward on a readable
`1 / 2 / 2.5 / 5 × 10ⁿ` ladder, so they continue scaling at any duration without arbitrary values.

The same grid stride drives the ruler background and lane-body background, keeping vertical lines
aligned. Every numbered tick still lands on a grid line because both strides come from the same
divisible ladder.

## Frame-level zoom

Maximum zoom is `max(20, ceil(frameSpan / 40))`. Short projects therefore preserve their existing
range. At the maximum of a long project, at most 40 frames are visible; on a normal Timeline viewport
the minor-grid calculation resolves to stride one, exposing every frame. Percent-based frame mapping,
scrub rounding and zoom anchoring are unchanged.
