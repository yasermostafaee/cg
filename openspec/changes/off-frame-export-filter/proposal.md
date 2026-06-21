# Off-frame export filter (D-071 Phase A)

## Why

Authors will soon get an off-frame "pasteboard" to park/stage shapes (D-071, Phase B). Those
parked shapes are already clipped invisible on air by the runtime's `.cg-stage { overflow:
hidden }`, but today they are still SHIPPED in the export — their image bytes inline into the
single-file HTML and package into the `.vcg`, and the runtime builds a node for each. That is pure
bloat: bytes for pixels no viewer can ever see.

Phase A lands the EXPORT-side filter on its own, ahead of the editor pasteboard, because it is safe
in isolation: off-frame elements are invisible in the output today, so dropping the fully-off-frame
ones leaves the rendered result IDENTICAL while shrinking the package. (Authors can already place
elements off-frame — `position` is unclamped — so the win is real even before the pasteboard UI.)

## What Changes

- A new export-only filter `dropFullyOffFrameForExport(scene, scoped)` applied inside
  `scopeSceneToComposition` (the single projection `.vcg` / HTML / broadcast-preview all route
  through, upstream of image collection + `pack()`), AFTER the D-086 closure scoping.
- The rule is deliberately CONSERVATIVE — "when in doubt, KEEP". An element is dropped IFF it is
  CERTAIN never to reach the frame: it is static (no `position`/`size`/`scale`/`rotation` track),
  its whole ancestor chain is static (we only recurse into static containers), it is not a
  `repeater` nor inside a repeater-template composition, and its rotated/scaled AABB (its four
  corners through the static ancestor transforms) is STRICTLY outside its own composition's frame.
  Touching/crossing an edge, a degenerate box, an animated element, an animated ancestor, and
  repeater templates are all KEPT.
- Applied per-composition (each doc vs its own resolution). EXPORT-ONLY: `editSceneOf` (the canvas)
  and Save are not routed through it, so staging shapes stay editable and persist in `.cg.json`.

## Impact

- Affected specs: **designer-composition-export** (ADDED requirement). Recon design:
  `openspec/changes/pasteboard-editing-export-excluded/design.md` (the umbrella D-071 recon; Phase B
  pasteboard is a later, separate change).
- Affected code: `@cg/designer` — new `renderer/state/off-frame.ts`; one call added in
  `renderer/state/scene-doc.ts` (`scopeSceneToComposition`). No exporter / packager / runtime /
  schema change — they inherit the filtered scene upstream (as HTML/preview/.vcg already inherit
  D-086's scope).
- Editor pasteboard (showing + placing off-frame, removing the stage clip, overlay hit-test) is
  **Phase B** — out of scope here; this PR changes only the export bytes, not the editor or the
  rendered output.
- Risk: low and contained. The one real correctness trap (an animated slide-in starting off-frame)
  is handled by the static-only rule and pinned by a "keep" test.
