## Context

Live Source appearance fields are intentionally static and are not part of the animatable Inspector
registry. The multi editor therefore cannot gain them merely by widening the registry intersection;
they need a homogeneous-kind surface that reuses the single Inspector's controls and meanings.

## Decisions

1. Render the new surface only when every selected element is a `video-placeholder`.
2. Use an explicit `mixed` option for discrete selects and the existing mixed state for number and
   colour controls. Rendering mixed state never mutates the scene.
3. Fan document edits through `runAsSingleHistoryEntry`; frame colour preserves each plate's width
   and frame width preserves each plate's colour.
4. Keep-aspect continues to use `aspectLockOff`, keyed per plate and outside document history. A
   mixed lock click converges the selection to locked; a fully locked click frees all.
5. Repair-to-aspect calculates each plate independently from its own transform and declared ratio,
   so differently shaped plates are not coerced to one plate's geometry.
6. Store poster presentation as optional `posterFitMode: contain | cover`, distinct from the
   existing on-air `fitMode`. Absence resolves to `cover`, preserving every older poster. The field
   is consumed only in author mode; output mode continues to paint no poster pixels.

## Risks

- Asset lists can contain a poster stored by only one selected plate. The mixed picker includes the
  union of missing stored ids so the Inspector never substitutes a value the scene does not hold.
- A colour is visually inactive at zero frame width. It remains withheld only when every selected
  width is zero; otherwise editing it updates all selected plates and preserves their widths.
- Reusing the on-air `fitMode` for the poster would make a harmless reference-image adjustment alter
  the live source on air. The separate optional field prevents that coupling.
