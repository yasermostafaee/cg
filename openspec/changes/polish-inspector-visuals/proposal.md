# Inspector visual polish to match the Loopic reference (D-048)

## Why

The inspector's text controls don't yet match the Loopic reference: padding is laid out one input
per row (the reference packs all four into one row), the alignment / sizing toggles use a blue
accent for their active state (the reference uses a neutral, properties-panel-consistent gray),
and the "⚙ More text options" gear is an inert button with no popover. This is an
**appearance-only** pass — no schema, renderer, keyframe, or behavior change.

## What Changes (UI / appearance only)

- **Padding → one row (`TextPaddingSection`):** the four text-padding inputs (top / right / bottom
  / left) render side-by-side in a single row, each a compact number cell with its keyframe
  diamond, matching `D-048-textpadding-0.png`. (Padding is text-only — there is no separate shape
  box-padding section to restyle.)
- **No blue accent active state:** the alignment button-groups (`AlignButtonGroup`) and the
  sizing / auto-squeeze / text-wrap toggles (`TextStyleSection` `TogglePair`) drop the
  `colors.accent` (blue) active fill in favor of the properties-panel-consistent neutral fill
  (`colors.menuHover` — documented as the active fill matching the Loopic reference), matching
  `D-045-align-0/1.png`.
- **"⚙ More text options" popover:** the existing gear (already in the text element's section)
  becomes a real popover trigger following the `ColorPopover` / `FillPopover` pattern (portal,
  anchor positioning, outside-click + Escape to close). The popover houses ONLY existing font
  props — **Font weight** (100..900) and **Font style** (normal / italic) — styled like the
  reference's gear popover (`D-045-align-1.png`).
- **Font weight moves into the popover:** the inline weight `SelectField` added by D-044 moves
  into the popover, joined by a new font-style control. Still UI-parity only — both write
  `font.weight` / `font.style` via `designerStore.updateElement` (non-keyframable; no diamond),
  exactly as before. No stored-value or render change.

## Capabilities

### Added Capabilities

- `designer-inspector`: three new requirements — (1) the text padding inputs render four-in-a-row;
  (2) inspector toggles / alignment groups use a neutral (non-blue) active state consistent with
  the properties panel; (3) the "More text options" gear opens a popover housing font weight +
  font style, which write via the element-update path and are non-keyframable. The popover's
  weight control **supersedes** D-044's inline weight placement (D-044 is not yet archived; this
  change relocates that same control — no behavior change).

## Impact

- **Designer:** `StyleSection.tsx` (`TextPaddingSection` four-up row + a small CSS module),
  `TextStyleSection.tsx` (wire the gear to the new `TextSettingsPopover`, remove the inline weight
  field), a new `TextSettingsPopover.tsx` + `.css.ts`, and active-state CSS edits in
  `TextStyleSection.css.ts` + `AlignButtonGroup.css.ts`.
- **Schema / renderer / keyframe model:** none.
- **Tests:** a small popover test (open/close, weight + style write via `updateElement`); the D-044
  weight test is updated to open the popover first (the control moved there).
- **Docs:** the spec delta below.

## Out of scope

font-decoration / text-transform / font-variant (NOT in the schema or renderer — a separate
feature). Any schema / renderer / keyframe / behavior change. The `D-048-popover-0.png` reference
depicts the D-046 auto-size confirm modal (a separate, paused item), not this text-settings
popover — the popover here matches `D-045-align-1.png` instead.
