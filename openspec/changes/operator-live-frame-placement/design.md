# Live frame placement feasibility

The Designer's **CG Control** section groups Fit, movement permission and resize policy. The
same section applies edits to one or several selected live plates. Designer geometry and aspect
settings stay in the Plate section.
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

Reload and replacement can list a new version while the row still holds its running page.
For in-place edits, Bridge compares the held and listed live frame metadata, including
geometry, routing, frame keys, permissions and foreground pairing. The Inspector's Auto
layout permission is independent. Compatible versions use the same existing producers.
A different frame layout requires a Take of the listed version before editing its on-air frames.

**Reset frames** is available in Inspector → Position for the selected eligible row.
The action stages an all-presets reset and PVW renders the authored frame rectangles. Update
uses the normal frame placement acknowledgement. On a verified resident row, the page and
its existing live seats return to the authored geometry in place. Discard cancels the reset.
The row's whole-template Position and input crop are separate and are retained.

## Designer Auto layout

Reuse the existing row, gap and order calculation in the Designer multi-selection Inspector.
Use the current geometry of each eligible visual layer. A direct plate uses its declared aspect
when set. A composition with one live plate uses the projected plate as its layout bounds and
transforms the whole instance, so its title and artwork keep their relative positions and
proportions. Other compositions use their instance bounds. Ordinary visuals keep their rotation
and proportions.

Apply the transforms through the existing geometry edit and undo paths. Swap changes spatial
order while preserving layer order. Audio and locked elements are excluded from the calculation.

Designer uses its per-instance aspect lock for compositions containing one live plate. The
referenced raster supplies the ratio. A resize compensates for the instance's existing scale.
Restore fits that ratio inside the current footprint around the instance anchor in one undo step.
Existing transforms load as authored. A composition displayed through a legacy Arrangement cell
continues to use the Arrangement's sizing rules.

CG Control resolves the visible frame set again when the active preset changes. Its Auto layout
inputs are kept by preset while inspecting the row, and the existing placement draft carries
the preset ID. The Inspector derives each preset's available layouts from its own frame count.
An Arrangement selection calculates and stages the full layout from the change event, like a valid gap edit.
Gap controls use the shared numeric scrub input. An incomplete value or a gap that cannot fit the frames preserves the last valid draft. Arrange frames can reapply the current settings, including on grids that have no Arrangement choice.

Designer stores the permission on the managed preset record and shows its checkbox in the
registered preset's composition Inspector. New presets default off. A saved preset with no
explicit value inherits its owner's legacy output permission. An explicit false overrides a
legacy true. The old permission fields remain readable, and ordinary nested compositions
have no role in the inheritance.

The carrier retains the root flag for exports with only a legacy permission. Once any preset
has an explicit choice, the carrier sends each preset's effective value and omits the root flag.
This prevents older consumers that ignore the preset field from enabling unauthorized presets.
A catalogue change limited to Auto layout permission leaves the resident geometry compatible.

Each frame's **Allow move** and **Resize** settings independently control its geometry edits.
For an opted-in multi-frame preset where some frames cannot move or resize, Position explains
the missing permission. A preset with one frame needs no arrangement controls.
