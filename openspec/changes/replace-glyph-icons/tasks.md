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
- [x] 3.17 `App.tsx` (beyond the inventory) — toast close ✕ → X. (`CompositionActionBar` ▷ and `TextStyleSection` tT/↕/VA remain — see design.md.)

## 4. Tests

- [x] 4.1 E2E (`tests/e2e/icon-pack.spec.ts`): a migrated toolbar button contains an `<svg>` and no longer its old glyph text; the icon inherits colour (`stroke="currentColor"`); a `flipRtl` icon mirrors under `[dir="rtl"]` while a default icon does not; the canvas tool order is drawing-first → dynamic; the canvas zoom group is icons + a `100%` text reset; the panel add buttons render the shared `Plus` icon; a text layer-row's type icon matches the text tool icon (both lucide `Type`).

## 5. Post-review amendments

- [x] 5.1 Tool icons: ticker → `MoveHorizontal`, sequence → `ArrowDownUp` (symmetric, no flipRtl) in `CanvasToolbar` + `ToolRail`.
- [x] 5.2 Reorder the canvas tools (drawing-first → dynamic) in `CanvasToolbar` + `ToolRail`; update the D-008 comment. No test asserted tool order before; E2E now covers it.
- [x] 5.3 Asset grid/list toggle: remove the local `GridIcon` / `ListIcon` SVG functions, render `Icon` `LayoutGrid` / `List` in `ProjectAssetsPanel` + `SharedLibraryPanel`; drop the dead cross-import.
- [x] 5.4 Zoom controls: canvas (`CanvasArea`) Fit → `Maximize`, in/out → `ZoomIn` / `ZoomOut`, reset → text `100%`, group reordered readout → Fit → reset → in → out; timeline (`StatusBar`) in/out → `ZoomIn` / `ZoomOut` — one unified pair (supersedes the earlier `Plus` / `Minus`).
- [x] 5.5 Panel add buttons: `+` → shared `Icon` `Plus` (`size={16}`) in `ProjectAssetsPanel` / `CompositionsPanel` / `SharedLibraryPanel`; align the two `iconButton` CSS boxes (drop the dead `fontSize`).
- [x] 5.6 Reset-button overflow: dedicated `zoomResetButton` text style in `CanvasArea.css.ts` (auto width, 22px tall) so `100%` fits; `headerButton` unchanged for the icon buttons.
- [x] 5.7 Radius toggle + Fit icon (supersedes Fit=`Maximize`): canvas Fit → `ScanSearch`; the border-radius single/per-corner toggle (`StyleSection` `RadiusToggle`) → shared `Icon` `Square` (uniform) / `Maximize` (per-corner) at `size={12}`; remove the dead `iconUniform` / `iconPerCorner` styles (+ `ICON` / `line` / `ARM` / `THICK`) from `BorderRadiusSection.css.ts`. Also fixed a stale `CanvasToolbar` function JSDoc (D-008 reference) flagged in review.
- [x] 5.8 Timeline layer-type icons: replace the `LayerTypeIcon` custom-SVG switch (`ElementRow.tsx`) with the shared `Icon` (`size={12}`, tint via `style.color`), matching the toolbar for shared kinds; lottie/video → `Film`, container → `Group`, composition → `Component`, polygon → `Triangle`, path → `Spline`. Added a `style` passthrough to the `Icon` component.
- [x] 5.9 Shared `Select` chevron: render a REAL lucide `ChevronDown` via the shared `Icon`, overlaid inside a `Select` wrapper (`Select.tsx` + `Select.css.ts` `wrap`/`chevron`), `pointer-events: none`. Supersedes the earlier `background-image` data-URI, which a per-site `background` override kept wiping.
- [x] 5.10 "More text options" gear (`TextSettingsPopover.tsx`): `⚙` → shared `Icon` `Settings2`.
- [x] 5.11 CLAUDE.md "Design system" convention: all icons go through the shared `Icon` (lucide); no new Unicode-glyph or ad-hoc inline-SVG icons in the renderer.
- [x] 5.12 Review fix: corrected the stale `Maximize` → `ScanSearch` in the "Canvas zoom controls" requirement body (spec.md). E2E asserts a shared `Select` renders a real `svg.lucide-chevron-down` element.

## 6. Gate

- [ ] 6.1 `@cg/designer` green gate — `format:check` + `typecheck` + `lint` + `test` + `build` — and run the E2E (`pnpm test:e2e`).
