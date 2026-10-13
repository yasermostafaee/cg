# Image fit gains width / height, and `none` becomes `original`

## Why

**D-149.** An author who wants an image to fill a box's WIDTH and let the height
run off — a masthead strip, a full-bleed band — has no option that does it.
`contain` fits the whole image inside (letterboxing on one axis) and `cover`
fills both (cropping whichever axis is proportionally longer). Neither is "match
this ONE axis", which is what a designed band needs.

Separately, `none` is a poor label for what it does. It reads as "no fit applied",
which is true of `fill` too; what it actually means is **the image at its original
size**. The word is the fix.

## What Changes

1. **`fit` gains `fit-width` and `fit-height`.** Fit width scales the image so its
   WIDTH matches the box and lets the height overflow; fit height is the mirror.
   **The overflow is clipped** to the authored rect.
2. **`none` is LABELLED "original" in the Designer.** The **stored value is
   unchanged** — this is a label, not a schema change, and there is **no
   migration**.

## 🔴 The constraint that matters more than the feature

The two new modes need a DOM node that `object-fit` alone cannot provide. Emitting
that node on **every** image would change the rendered output of templates that use
**none** of the new options — **an on-air change bought for nothing**.

> **The extra node is emitted ONLY when the chosen fit requires it.** A document
> using `original`, `contain`, `cover` or `fill` exports output that is
> **IDENTICAL** to what it exports today.

**Proven, not inspected:** `packages/template-runtime/tests/image-fit.test.ts`
compares the built DOM for every pre-existing mode — across four variants each —
against `fixtures/image-fit-golden.json`, **captured from the renderer before this
change landed**.

**A no-wrapper implementation was sought and rejected with reasons**, both recorded
on `buildImageFitAxis`:

- **Picking `contain` vs `cover` from the asset's intrinsic size** would need no
  extra node at all — `fit-width` IS `contain` when the image is proportionally
  wider than the box and `cover` when it is narrower. Rejected because those
  dimensions **are not in the scene**: `defaultImage` uses them to size the element
  at import and stores nothing, so this would need a new schema field that goes
  **stale the moment the asset behind the id is replaced**.
- **Deciding it in JS at asset-load time** (where `naturalWidth` is known) needs
  every host that resolves `data-cg-asset-id` to cooperate, and the Designer's
  preview walk and the runtime's own are separate code. That is the **`B-102`
  class** exactly — renders in preview, absent on hardware.

**CSS decided at BUILD time** reaches the canvas, the Preview modal and the export
through the one `buildScene` call all three already share, which is what makes
preview/export parity structural rather than asserted.

## Impact

- **Affected specs:** `designer-image-element` (new capability — the authoring and
  render contract for the image element's fit)
- **Affected code:** `@cg/shared-schema` (`ImageElementSchema.fit` widened),
  `@cg/template-runtime` (`buildImage` + the new `buildImageFitAxis`),
  `apps/designer` (the Inspector's fit `SelectField` — options and labels)
- **⚠ Reaches air.** The image element renders into the export and onto the
  programme channel. The byte-identity test above is what makes this safe to merge.
- **No migration.** Widening an enum is additive, and no stored value changes.
