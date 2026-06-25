# Tasks — Icon pack (D-092)

## 1. Dependency

- [x] 1.1 Add `lucide-react` to `apps/designer/package.json` (via `pnpm add`).
- [x] 1.2 Add a lucide-react (ISC) row to `THIRD_PARTY_LICENSES.md`.

## 2. Shared `Icon` primitive

- [x] 2.1 `renderer/ui/Icon.tsx` — wrapper over a passed `LucideIcon`: single `size` (default 16), `currentColor` (lucide default), `aria-hidden`, optional `strokeWidth`, opt-in `flipRtl`, `className` passthrough.
- [x] 2.2 `renderer/ui/Icon.css.ts` — `flipRtl` class: `transform: scaleX(-1)` under an `[dir="rtl"]` ancestor only.

## 3. Migrate the glyph inventory (glyph → `<Icon>`)

- [x] 3.1 `canvas/CanvasToolbar.tsx` (+ remove `HAND_ICON`) — tool icons (MousePointer2 / Hand / Type / ChevronsLeft / Clock / ChevronsRight / Rows3 / Square / Circle / Image).
- [x] 3.2 `tools/ToolRail.tsx` — same tool-icon set.
- [x] 3.3 `inspector/AlignButtonGroup.tsx` — H TextAlignStart/Center/End, V AlignVerticalJustifyStart/Center/End.
- [x] 3.4 `inspector/transform-fields.tsx` — scale.x→MoveHorizontal, scale.y→MoveVertical, rotation→RotateCw, opacity→Contrast; widen `FieldMeta.icon`/`FieldProps.icon` to `ReactNode`; keep X/Y/W/H letters as text.
- [x] 3.5 `inspector/CollapseSection.tsx` — chevron ChevronDown / ChevronRight (collapsed `flipRtl`).
- [x] 3.6 `timeline/ElementRow.tsx` — row chevron ChevronDown / ChevronRight (collapsed `flipRtl`). Eye / lock / type-icon SVGs left as-is.
- [x] 3.7 `timeline/TimelineDock.tsx` — group chevron ChevronDown / ChevronRight (collapsed `flipRtl`).
- [x] 3.8 `timeline/LayerContextMenu.tsx` — submenu ▶ → ChevronRight (`flipRtl`).
- [x] 3.9 `shell/TopToolbar.tsx` — view-menu check ✓ → Check.
- [x] 3.10 `shell/Modal.tsx` — close ✕ → X.
- [x] 3.11 `fields/PreviewTransport.tsx` — Play/Pause/Square/SkipForward/RotateCcw.
- [x] 3.12 `fields/PreviewFieldForm.tsx` — error ⚠ → TriangleAlert.
- [x] 3.13 `inspector/KeyframeInspector.tsx` — back ← → ArrowLeft (`flipRtl`); multi-warning ⚠ → TriangleAlert.
- [x] 3.14 `ui/Callout.tsx` — default icons ℹ → Info, ⚠ → TriangleAlert.
- [x] 3.15 `shell/TransportBar.tsx` — remove the `ic()` helper + inline-SVG consts; render SkipBack / StepBack / Play / Pause / StepForward / Repeat / ArrowLeftRight via `<Icon>`.
- [x] 3.16 `shell/NewProjectModal.tsx` — verified `×` / `≈` are math text (no icon), left unchanged.
- [x] 3.17 `App.tsx` (beyond the inventory) — toast close ✕ → X (the enumerated "close" glyph). `CanvasArea` ⛶ / `CompositionActionBar` ▷ / `TextStyleSection` tT/↕/VA reported but left as-is (see design.md).

## 4. Tests

- [x] 4.1 E2E (`tests/e2e/icon-pack.spec.ts`): a migrated toolbar button contains an `<svg>` and no longer its old glyph text; the icon inherits colour (`stroke="currentColor"`); a `flipRtl` icon mirrors under `[dir="rtl"]` while a default icon does not.

## 5. Gate

- [ ] 5.1 `@cg/designer` green gate — `format:check` + `typecheck` + `lint` + `test` + `build` — and run the E2E (`pnpm test:e2e`).
