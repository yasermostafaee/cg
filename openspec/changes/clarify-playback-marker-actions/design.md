# Design: semantic Playback boundaries

## Terminology

Generic NLEs reserve In/Out for selecting or trimming a clip range. Premiere's Source Monitor uses
Mark In / Mark Out and Clear In / Clear Out for that purpose. Motion-graphics tooling names authored
phases instead: Adobe Responsive Design exposes Set Intro End / Set Outro Start, while Cinegy Title
uses Loop Start / Loop End / Leave Loop for its repeat range.

This Designer boundary is not a clip trim. `contentStart` ends the entrance and begins the picture
held or repeated; `outPoint` begins the exit. The UI therefore calls them **Hold start** and **Outro
start**. Actions use **Set** and **Clear**, with the phase in the accessible name, so the narrow button
stays scannable without losing meaning for assistive technology.

## Boundary interaction

The stored schema remains `contentStart ≤ outPoint`. When an author activates Set for an absent Hold
start, its fallback is `outPoint - 1` whenever the active range has room; this avoids creating an
empty Middle as the initial explicit choice. It is a seed, not an invariant. Dragging either explicit
boundary across the other carries the partner boundary to the requested frame, so the two may become
coincident and both drag directions remain predictable.

Coincident boundaries remain valid authored data. The timeline renders both full-height lines and
offsets only their painted positions by a few pixels. Their stored frames, hit targets and playback
arithmetic remain unchanged.

## Marker color distinction — owner follow-up, 2026-11-04

Hold start uses the Designer's existing semantic green (`#5FAE80`) for its Inspector action/icon,
timeline grip and solid/dashed start line. The Loop range uses the matching translucent green
surface. The playhead/current-frame indicator remains blue (`#38BDF8`) and Outro start remains
orange (`#FFAE57`). One marker token owns the related surfaces; this is not a new palette or a
second lifecycle state. Stored frame positions, range boundaries, hit targets and coincidence
offsets remain unchanged. Browser coverage must observe the actual painted colors as well as
the existing unchanged marker interaction.

The initial translucent tint was too weak over saturated layer strips. The owner's final correction
rejects the attempted diagonal hatching and thick vertical halos as visually coarse and masking
the green/orange markers. Use a restrained plain green range fill instead; keep underlying row
colors, labels and keyframes readable and keep the green Hold-start and orange Outro-start lines
uncovered. No hatch or thick boundary halo is retained. Pointer ownership does not change. Browser
validation includes strongly colored layer rows, not only the neutral ruler.

The scoped implementation uses the existing 14% green tint over a uniform 18% black wash, painted
above the colored layer bars, with thin full-opacity green/orange boundary lines. The automatic
Hold boundary remains dashed. This flat treatment contains neither a repeating pattern nor a
shadow halo; its actual contrast and row readability still require the pending browser check.

## References

- Adobe Premiere Elements, Responsive Design: Set Intro End / Set Outro Start.
- Adobe Premiere Source Monitor: Mark In / Mark Out and Clear In / Clear Out.
- Cinegy Title Scene Settings: Loop Start / Loop End / Leave Loop.
