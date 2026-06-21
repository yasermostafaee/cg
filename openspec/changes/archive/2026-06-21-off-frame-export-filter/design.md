# Design — Off-frame export filter (D-071 Phase A)

This change implements **only the export-side filter** from the D-071 recon. The full
current-state map, the six decisions (A–F), and the editor-pasteboard plan live in the umbrella
recon: `openspec/changes/pasteboard-editing-export-excluded/design.md`. Phase B (the editor
pasteboard — showing + placing off-frame, relaxing the stage clip, overlay hit-test) is a separate,
later change. (Two-phase split mirrors D-086: land the risky/contained engine piece first.)

## Where it sits

`scopeSceneToComposition` (`renderer/state/scene-doc.ts`) is the ONE projection `.vcg`, single-file
HTML, and the broadcast preview all route through (D-086), upstream of `collectImageElements` and
`pack()`. The filter runs there, AFTER the closure scoping:

```
projected = editSceneOf(scene, id)                       // D-086 layer projection
scoped     = { ...projected, compositions: closure }     // D-086 closure scope
return dropFullyOffFrameForExport(scene, scoped)          // D-071 Phase A — NEW
```

`editSceneOf` (the canvas) and Save (`JSON.stringify(scene)`) do NOT call this, so off-frame
staging shapes stay editable and persist in `.cg.json` — the exclusion is export-only by
construction.

## The rule (conservative — KEEP when in doubt)

Drop an element IFF ALL: (1) no geometry track (`position.*`/`size.*`/`scale.*`/`rotation`); (2)
no animated ancestor (guaranteed — we only recurse into static containers); (3) not a `repeater`
nor inside a repeater-template composition; (4) its rotated/scaled AABB (4 corners through the
static ancestor transforms) is STRICTLY outside the doc's frame `[0,0,W,H]`. Touching/crossing an
edge, degenerate/non-finite boxes, animated elements, animated ancestors, and repeater templates
are all KEPT. Applied per-doc (the projected frame + each non-repeater-template closure comp, each
vs its OWN resolution).

`isFullyOffFrame` re-implements the `localToScene` corner math (mirrors
`features/canvas/geometry.ts`) self-contained, so the export filter is pure and independently
testable with no cross-feature import.

## Why this is safe to land alone

Off-frame content is already clipped invisible by the runtime's `.cg-stage { overflow: hidden }`,
so dropping fully-off-frame elements leaves the rendered output byte-for-byte identical — it only
removes dead weight (their image bytes are never gathered; one fewer node renders). The single
correctness trap (an element keyframed to slide in from off-frame) is covered by the static-only
guard and a dedicated "keep" test.
