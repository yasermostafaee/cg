# Tasks — inspector visual polish (D-048)

## 1. Padding four-up row

- [x] `TextPaddingSection` (`StyleSection.tsx`): render the four padding inputs side-by-side in one
      row (top/right/bottom/left), each a compact cell with its `KeyframeDot`; add
      `TextPaddingSection.css.ts`. Match `D-048-textpadding-0.png`. No value/commit change.

## 2. Neutral (non-blue) active state

- [x] `AlignButtonGroup.css.ts` `buttonActive` → `colors.menuHover` fill + `colors.text` (no
      accent).
- [x] `TextStyleSection.css.ts` `toggleOptionActive` → `colors.menuHover` fill + `colors.text` (no
      accent).

## 3. More-text-options popover

- [x] New `TextSettingsPopover.tsx` + `.css.ts` (FillPopover pattern: portal, anchor position,
      outside-click + Escape). Houses Font weight (100..900) + Font style (normal/italic), each
      writing via `designerStore.updateElement` (non-keyframable).
- [x] `TextStyleSection.tsx`: replace the inert gear `Control` with the popover trigger; remove the
      inline D-044 weight `SelectField`.

## 4. Tests

- [x] Popover test: gear opens/closes (Escape + outside-click); weight + style commit via
      `updateElement` with no keyframe track.
- [x] Update `text-font-weight.test.ts` (D-044): open the popover first, then assert the weight
      control + its write/non-keyframable behavior (now in the popover).

## 5. Gate / docs

- [x] Full green gate (uncached) for `@cg/designer`.
- [x] `pnpm openspec validate polish-inspector-visuals --strict`.
- [x] Mark D-048 `[~]` in `docs/prd/designer.md` with the change dir.
