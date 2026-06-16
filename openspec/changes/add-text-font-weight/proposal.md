# Font-weight control for the plain text element (D-044)

## Why

The font-weight selector that ticker / sequence / clock already expose is missing from the
plain **text** element's inspector. `font.weight` already exists in the shared font schema
(`FontWeightSchema`, 100..900) on all font-bearing kinds incl. text, and the renderer
already applies it for text (`buildText`: `el.style.fontWeight = String(element.font.weight)`).
So an authored text weight renders correctly but can't be changed in the UI — a pure UI gap.

## What Changes (UI parity only — no schema / render / store / keyframe change)

- **`TextStyleSection.tsx`:** add a `weight` `SelectField` (options `100`..`900`) inline beside
  the font-family control (family → weight → size), mirroring the ticker/sequence/clock
  control. It commits via `designerStore.updateElement(id, { font: { ...element.font,
weight: Number(w) } })`.
- **Non-keyframable:** `font.weight` is NOT a member of `AnimatablePropertySchema` (like
  font-family), so the control uses `updateElement` (not `commitAnimatable`) and renders NO
  keyframe diamond.
- **Multi-select:** unchanged — font-weight is single-select-only (consistent with
  font-family and alignment); it is NOT added to the shared-property model.
- **Not in scope:** the "More text options" popover consolidation (D-048) — the control is
  placed inline, not in the popover.

## Capabilities

### Modified Capabilities

- `designer-inspector`: a new requirement — the text element's inspector exposes a
  non-keyframable font-weight control (100..900) inline beside font family / size, writing
  `font.weight`, matching the control ticker / sequence / clock already have.

## Impact

- **Designer:** `TextStyleSection.tsx` (one `SelectField`). No `@cg/shared-schema`,
  `@cg/template-runtime`, or store change.
- **Tests:** a designer test — the text inspector renders the weight select; committing a
  weight updates `element.font.weight` with no keyframe track.
- **Docs:** the spec delta below.

## Out of scope

Schema / render / store / keyframe changes (none needed). Making weight animatable. The
D-048 "More text options" popover. Multi-select font-weight.
