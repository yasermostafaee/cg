# Design — live-plate reveal mask (D-202)

## Crop one live plate

The author draws the windows on the plate itself. `liveMask = { mode, rects }` uses the same
normalized rectangle bounds as a linked reveal and is carried per look. Mask keeps the union of
the windows. Revert keeps its complement. Removing all windows removes the crop. The Designer
keeps the named editing guides and the authored fallback is clipped to the same visible regions.
The plate's full-size frame outline is an editing guide while its own mask is active.

The Bridge intersects the disjoint regions with the fitted input and keeps the input's original
`FILL`. The first region uses the original producer. Further regions use muted routes to that
producer's own layer, so a capture device or media stream is opened once. CasparCG 2.5.0 strips the
source layer's mixer transform from a layer route and orders same-channel routes after their source.
The regions share the input's fit and audio remains with its original seat. A fully removed picture
parks that seat's geometry. Each extra region requires an available live-source layer.
The station's server B route fence applies to these layer taps. A multi-fragment crop is supported
on A. Admission refuses it with B as the active engine.

The self mask grants no overlap exception. The linked-reveal contract below still governs saved
projects that use two plates.

## Explicit relation, narrow exception

`revealMask = { targetSourceId, rect, additionalRects? }` lives on the upper plate. Each rectangle is
normalized inside that plate and must stay inside `0..1`. `rect` remains the first window for
existing projects. The optional array adds up to seven windows that reveal the same lower input.
The target is the lower plate's symbolic source id, never a device
address. Self-links, missing targets and direct cycles are invalid.

The existing overlap rule stays intact. Preflight exempts only the explicitly linked pair and only
when every authored reveal window intersects the lower plate in that document/look. Every third-party
collision is still reported against both elements.

## Output composition

The Bridge orders the lower producer below the upper producer, then seats a copy of the lower
producer above both for each visible window. Each copy keeps the lower plate's `FILL`, intersects its
`CLIP` with its window and is permanently muted. The output shows the union of the visible windows
using the existing `FILL`, `CLIP`, `VOLUME` and layer primitives.

The duplicate has a synthetic seat identity while retaining the actual producer argument. This lets
the ledger reconcile and release the copy independently without pretending two identical producers
are one seat. Removing a reveal clears only the synthetic seat. A reveal consumes one real layer;
normal atomic band-capacity refusal therefore covers it before any `PLAY` or graphic reaches air.

## Compatibility and authoring

All fields are optional. Old scenes, packages and ledgers parse unchanged. Designer output carries
only a non-output cyan guide; runtime/output HTML remains transparent where live producers paint.
The Inspector offers target and mask selection, numeric percentages and per-mask removal. A Canvas
drag adds a new rectangle or replaces the selected one. Removing the final mask clears the relation.
Mask names use a screen-sized label while Canvas zoom changes. The Inspector groups add, redraw and
remove as icon actions beside the mask controls.

Direct editing starts with the first mask of a newly selected plate, with a mask picked in the
Inspector, or after Add/Redraw completes. When the plate has both kinds, its own mask opens first.
The Inspector applies the shared selected icon treatment while the editor is active. Its body and
corner handles live on the Designer Canvas overlay, above the preview guides. A drag previews
normalized coordinates clamped to the plate. Release updates only the selected window as one undo
entry. Escape or pointer cancellation discards the draft. Escape or a click outside the editor
leaves it, and that click follows the normal Canvas selection path. Both kinds share the editor.
