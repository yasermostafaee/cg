# Strip box styling from content-driven element types (D-056)

## Why

D-042 and D-052 gave the content-driven kinds (ticker / clock / sequence) full box
styling — background, border-radius (incl. per-corner), box padding, stroke/path-style,
and box drop-shadow — keyframe-able and runtime-applied. That was the wrong call: these
kinds are intrinsically content-driven and giving them box styling duplicates what a
`shape` layer does better, adds complexity (the B-016 gradient-text/background
collision), and fights the layered authoring model (a shape background + content on
top, which also matches the Lottie/AF asset flow). They should carry ONLY their text.

## What Changes

For **ticker / clock / sequence** (and ONLY these three — `text` and `shape` are
unchanged; `repeater` is already box-free):

- **Remove** from the inspector + runtime: background (`backgroundColor`/`backgroundFill`),
  border-radius (uniform + per-corner), box padding, path-style/stroke, and box
  drop-shadow.
- **Keep**: text colour (incl. gradient `colorFill`), **text-shadow**, and font/text
  styling. The shadow section is renamed **"Text Shadow"** (it was mislabeled "Drop
  Shadow") with its offset X/Y on ONE line (absorbing the earlier ب/ج tweaks).

This reverses D-042 (cornerRadius) and D-052 (stroke / text-colour / background /
shadow / padding) **for these three kinds only**.

- **Migration = option B**: the schema fields are RETAINED (no breaking schema / `.vcg`
  / GDD change; dead data on these unused kinds is harmless). The UI must not expose
  them and the runtime must not apply them. EXCEPTION (strict): the `writeStaticAnimatable`
  stroke `boxKind` gate is narrowed to shape/text so a programmatic stroke write does
  NOT mutate `el.stroke` on these kinds.
- **B-016**: removing background from clock/sequence makes the gradient-text/background
  collision moot for them (ticker never had `colorFill`). It REMAINS on the `text`
  element (unchanged) — tracked separately as the narrowed B-016 (text-only).

## Capabilities

### Modified Capabilities

- `designer-box-styling`: "background-capable kinds" narrows from five to **shape +
  text**; static stroke / per-corner render and per-corner keyframing scope to
  shape/text; the D-052 "Stroke animation for shapes and time-driven kinds" requirement
  is RENAMED back to shape-only (text stroke stays static).
- `designer-inspector-registry`: the "Keyframe-able styling for time-driven elements"
  requirement is carved back — these kinds keyframe ONLY transform/opacity/filter +
  `text.color` + `shadow.*` (text-shadow); NOT stroke/cornerRadius/background/padding.
- `designer-ticker-element` / `designer-clock-element` / `designer-sequence-element`:
  the styling-subset descriptions become text-only (font, colour, `colorFill`,
  `textShadow`); the box-style schema fields are retained but inert (option B).

## Impact

- **Designer:** `field-registry.ts` (shrink the three arrays; revert the `isTimeDriven`
  branch of the stroke/background/padding predicates), `StyleSection.tsx` (drop the
  background/padding/stroke/border-radius blocks; rename + relayout the shadow section).
- **Runtime:** `@cg/template-runtime/animation-applier.ts` (background→text-only,
  applyStroke→shape-only, gate cornerRadius+padding by `!isTimeDriven`) and
  `scene-builder.ts` (stop painting background/stroke/radius/padding for the three
  kinds, incl. the ticker inner-viewport padding). **No schema change** (option B).
- **Designer store:** `timeline.ts writeStaticAnimatable` (background/padding cases →
  text-only; stroke `boxKind` gate narrowed to shape/text).
- **Tests:** revert the D-042/D-052 per-kind assertions for these three kinds; keep
  text/shape; keep text-colour + text-shadow; E2E that these kinds expose only text
  colour + Text Shadow.
- **Docs:** the five specs above + the registry/applier/scene-builder/section docstrings.

## Out of scope

The `text` element and `shape` (unchanged). Repeater (already box-free). Any schema
removal (option B keeps the fields). The text-only B-016 (tracked separately).
