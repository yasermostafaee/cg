# Design — inspector visual polish (D-048)

Appearance-only. No schema, renderer, keyframe, or behavior change. If matching a reference were
to force any such change, stop and report (it does not here).

## 1. Padding four-up row

`TextPaddingSection` (`StyleSection.tsx`) currently stacks four `NumberField`s (one per row).
Replace with a single row of four compact cells — top / right / bottom / left, left-to-right —
each a bordered field holding a `RealtimeNumberInput` + the property's `KeyframeDot`, matching
`D-048-textpadding-0.png` (`0 ◇ 0 ◇ 0 ◇ 0 ◇`). Values, commit path (`commitAnimatable`), and
diamonds are unchanged — only the layout. Styles go in a small `TextPaddingSection.css.ts`.
Padding is text-only (`field-registry`/schema), so there is no shape box-padding section to touch.

## 2. Neutral (non-blue) active state

The blue active fill is `background: colors.accent; color: #000` in two places:

- `AlignButtonGroup.css.ts` `buttonActive`
- `TextStyleSection.css.ts` `toggleOptionActive`

Both become the properties-panel-consistent neutral fill: `background: colors.menuHover; color:
colors.text` (`menuHover` is the token documented as "the active fill matching the Loopic
reference"). No blue accent remains on these active states, matching `D-045-align-0/1.png`. The
shared `Button` `selected` style keeps its accent border elsewhere; the inspector toggles/align
groups use their own neutral active class (no accent border) to honor "no blue accent here".

## 3. "More text options" popover

Follow the `FillPopover` pattern exactly:

- A `TextSettingsButton` owns `open` state + a `btnRef`; it renders the gear `Control`
  (`aria-label="More text options"`, `aria-expanded`, neutral active styling while open) and, when
  open, the `TextSettingsPopover`.
- `TextSettingsPopover` is `createPortal(…, document.body)`, positioned from the anchor rect in a
  `useLayoutEffect`, and closes on outside `pointerdown` (capture) or `Escape` via a `useEffect`
  (identical wiring to `FillPopover`).
- Contents — two labelled dropdowns (the reference's gear popover, `D-045-align-1.png`):
  - **Font weight** — shared `Select` (`aria-label="weight"`, preserved from D-044), options
    `100..900` with named labels (Thin … Black). Writes `font.weight` via
    `designerStore.updateElement` (non-keyframable; no diamond) — unchanged from D-044.
  - **Font style** — shared `Select` (`aria-label="font style"`), options `normal` / `italic`
    (labels Normal / Italic). Writes `font.style` via `designerStore.updateElement`.

The inline weight `SelectField` (D-044) is removed from `TextStyleSection`; the gear replaces the
inert `Control` with `<TextSettingsButton>`. Text-element-only (the gear lives in the text
section). `font.style` already exists in the schema and renders (`scene-builder` sets
`fontStyle`), so this is pure UI parity.

## Test ripple

`text-font-weight.test.ts` (D-044) asserts the weight `select[aria-label="weight"]` renders in the
section. The control moved into the popover (portaled to `document.body`, present only when open),
so the test is updated to open the popover (click the gear) and then assert against `document`.
Its behavioral assertions (writes `font.weight`, no keyframe track, no diamond) are unchanged.
