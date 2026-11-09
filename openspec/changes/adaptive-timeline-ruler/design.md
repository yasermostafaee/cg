# Design — adaptive Timeline ruler (B-416)

## One tick list

Estimate the label width from the largest frame number and choose the spacing on an integral
`1 / 2 / 2.5 / 5 × 10ⁿ` ladder. The ruler and lane body draw from the same scroll-window slice of
ticks. One interval of overscan on either side keeps scrolling continuous without mounting a node
for every frame of a long composition.

## Frame-level zoom

Maximum zoom is `max(20, ceil(frameSpan / 12))`. With at most 12 frames in view, a normal Timeline
viewport has room to number each frame. Percent-based frame mapping, scrub rounding and zoom
anchoring are unchanged.
