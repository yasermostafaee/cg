# Separate text-shadow and box-shadow on the text element (D-057)

## Why

The `text` element is a full box (background, border, radius, padding) but today has
only ONE shadow — `textShadow`, surfaced in a single UI section mislabeled "Drop
Shadow". A text box legitimately wants BOTH a glyph shadow (`text-shadow`) and a box
shadow (`box-shadow`), independently. Recon confirmed: text has no box `shadow` field,
the runtime doesn't paint/animate a box-shadow for text, and the single `shadow.*`
animatable key set is one-target-per-element (text-shadow for text, box-shadow for
shape) — so the two cannot be keyframed independently with today's keys. This adds the
missing box shadow to text. It also relabels the `shape` shadow section "Drop Shadow"
→ "Box Shadow" for naming consistency (cosmetic).

## What Changes (additive — no migration)

- **Schema:** add `shadow: ShadowSchema.optional()` to `TextElementSchema` explicitly
  (like `ShapeElementSchema`; NOT to `BoxStyleSchema` — that would re-add box shadow to
  the content-driven kinds D-056 stripped). Add `boxShadow.offsetX/Y/blur/color` to
  `AnimatablePropertySchema`. Both additive ⇒ old scenes load unchanged.
- **Keys (the independence fix):** keep `shadow.*` AS-IS = text-shadow for text /
  box-shadow for shape (existing keyframes untouched). The text element's NEW box shadow
  animates on the distinct `boxShadow.*` keys. So for a text element: `shadow.*` drives
  text-shadow, `boxShadow.*` drives box-shadow — independently.
- **Runtime:** `scene-builder` `buildText` paints a box-shadow from `element.shadow`
  (mirroring `buildShape`), keeping the existing text-shadow paint. `animation-applier`
  gains a `boxShadow.*` branch writing `box-shadow` for text; the `shadow.*` path is
  unchanged.
- **Designer:** the registry gives text a second shadow descriptor set on `boxShadow.*`
  (reads `el.shadow`); the existing `shadow.*` descriptors stay = "Text Shadow".
  `StyleSection` renames text's section "Drop Shadow" → "Text Shadow", adds a "Box
  Shadow" section (text, `boxShadow.*` + `el.shadow`), and renames shape's section →
  "Box Shadow" (title only). `writeStaticAnimatable` gains a `boxShadow.*` text case.
- **Untouched:** shape behavior (relabel only), content-driven kinds (ticker/clock/
  sequence keep `shadow.*` → text-shadow, no box shadow, no `boxShadow.*`), and the
  existing text-shadow.

## Capabilities

### Added Capabilities

- `designer-box-styling`: a new requirement — the text element has TWO independent
  shadows (text-shadow on the glyphs via `shadow.*` / `textShadow`; box-shadow on the
  box via `boxShadow.*` / `shadow`), both rendered by the runtime and independently
  keyframe-able; shape's box shadow is relabeled "Box Shadow" (behavior unchanged).
  _(designer-box-styling had no prior shadow requirement, so this is ADDED, not
  MODIFIED.)_

### Modified Capabilities

- `designer-inspector-registry`: the "A keyframe diamond renders exactly when the
  property is keyframe-able" requirement — text's keyframe-able style set now also
  includes the box-shadow sub-properties (`boxShadow.*`), alongside the existing
  text-shadow (`shadow.*`). Shape and content-driven kinds unchanged.

## Impact

- **Schema:** `elements.ts` (text `shadow`), `animation.ts` (`boxShadow.*` keys). No
  `.vcg`/GDD break (additive optional).
- **Runtime:** `scene-builder.ts` (`buildText` box-shadow), `animation-applier.ts`
  (`boxShadow.*` branch).
- **Designer:** `field-registry.ts` (text `boxShadow.*` descriptors), `StyleSection.tsx`
  (rename + new section + shape relabel), `timeline.ts` (`boxShadow.*` static write).
- **Tests:** schema load; scene-builder both shadows; the applier INDEPENDENCE test;
  registry/parity (text two shadow sets); shape-relabel; E2E.
- **Docs:** the two specs + the `DropShadowSection`/applier/scene-builder docstrings.

## Out of scope

Shape behavior (label only). Content-driven kinds. Any rename of `shadow.*` (rejected —
it would migrate existing keyframes).
