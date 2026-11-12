# Live frame placement feasibility

The Designer's Plate controls record movement permission separately from resize policy.
An absent movement flag on an older opted-in frame keeps movement available. A frame with
movement allowed and resize locked exports a move-only target. A resize-only target carries an
explicit movement denial. Import derives a frame key from its full composition-instance path
and keeps its permissions per Look. A composition containing one plate moves with its
associated artwork. Standalone frames move independently.

A package using move-only or resize-only permissions requires Runtime 1.2.3 and a Bridge that
advertises `previewResizeMode`. Import and rebuild check for support before registration.

An authored proportional policy constrains resize. With **Operator chooses aspect ratio**,
CG Control starts with the ratio lock checked, and a locked gesture retains the frame ratio
at the start of that gesture.

Frames in PVW drafts a rectangle in composition pixels, separately for each row, Look and frame.
The same draft drives the Preview picture and page artwork. A wrapper applies the additional
transform around the mounted artwork, so it keeps its bindings and running animations.

Bridge resolves each stored rectangle against the current template and its authoring policy.
Take carries the same placements to the page and uses them for the engine's fill and clip.
Update on air requires a verified resident page and unchanged producer seats. It sends the page
and mixer updates while holding the row's live-seat lock and restores the prior geometry on a
refusal. The operator still needs to verify frame alignment on the target engine.

**Reset frames** is available in Inspector → Position for the selected eligible row.
The action stages an all-presets reset and PVW renders the authored frame rectangles. Update
uses the normal frame placement acknowledgement. On a verified resident row, the page and
its existing live seats return to the authored geometry in place. Discard cancels the reset.
The row's whole-template Position and input crop are separate and are retained.
