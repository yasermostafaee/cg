# Live frame placement feasibility

The Designer's Plate controls record the resize policy on the authored frame. Import derives a
frame key from its full composition-instance path and keeps its own permission per Look. A
composition containing one plate moves with its associated artwork. Standalone frames move
independently.

Frames in PVW drafts a rectangle in composition pixels, separately for each row, Look and frame.
The same draft drives the Preview picture and page artwork. A wrapper applies the additional
transform around the mounted artwork, so it keeps its bindings and running animations.

Bridge resolves each stored rectangle against the current template and its authoring policy.
Take carries the same placements to the page and uses them for the engine's fill and clip.
Update on air requires a verified resident page and unchanged producer seats. It sends the page
and mixer updates while holding the row's live-seat lock and restores the prior geometry on a
refusal. The operator still needs to verify frame alignment on the target engine.
