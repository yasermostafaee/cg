# Path Style commits apply to pen paths (B-051; rider: B-052 layer icon)

## Why

B-051 (owner-verified, HIGH): on a pen-drawn `path`, the Inspector's Path Style controls — fill,
stroke colour, stroke width, dash array — do nothing: the model value never changes. Recon (red
unit test against the live store — see `design.md`) pinned the mechanism: the edits route through
`commitAnimatable` → (no keyframe track) → `writeStaticAnimatable`, whose per-kind guards predate
the D-109 path element — `boxKind = shape || text` gates the three `stroke.*` static writes and
`fill.color` is `shape`-only, so all four silently no-op on a path. The suspected
missing-default-fill/stroke cause is REFUTED (pen creation seeds both); gradient/mode fill changes
worked all along because they bypass the guard (`applyFillModeChange` → raw `updateElement`).

B-052 (LOW, same "pen left out of a code path" family): the timeline layer list renders a pen
path's row with the rectangle icon — `layerTypeIcon` has no top-level `case 'path'` (the D-109
element type) and falls through to the `Square` default.

## What Changes

- **`writeStaticAnimatable` accepts `path` where the schema does**: `boxKind` (gating
  `stroke.width` / `stroke.dash` / `stroke.color`) gains `path`; `fill.color` accepts
  `shape | path`. The D-056 strictness is PRESERVED: the content-driven kinds (ticker / clock /
  sequence) still refuse stroke writes (regression-tested). No runtime change — the renderer
  already draws path fill / stroke / `stroke-dasharray`, and keyframed `stroke.*` / `fill.color`
  on paths already worked (`upsertKeyframe` is kind-agnostic), so static edits now render,
  keyframe, and export exactly like a shape's.
- **B-052 rider**: `layerTypeIcon` gains a top-level `case 'path'` → the toolbar's `PenTool`
  lucide icon via the shared `Icon` (no new SVG). The helper is exported for the icon-mapping
  unit test; the rest of the mapping was audited — only `path` was missing.

## Capabilities

- **`designer-path-element`** (ADDED requirement): "Path Style edits apply" — static fill /
  stroke-colour / width / dash edits on a path mutate the model, render in the preview, and carry
  through the exports, with the content-driven-kind refusal unchanged.

## Impact

- `apps/designer/src/renderer/state/slices/timeline.ts` — the two guard sets in
  `writeStaticAnimatable`.
- `apps/designer/src/renderer/features/timeline/ElementRow.tsx` — `layerTypeIcon` path case
  (+ export for the test).
- Tests: NEW unit `apps/designer/tests/path-style-commit.test.ts` (red pre-fix) and
  `apps/designer/tests/layer-type-icon.test.ts`; NEW E2E
  `apps/designer/tests/e2e/pen-path-style.spec.ts` (Inspector-driven; preview SVG + single-file
  HTML export assertions).
- Docs: PRD `docs/prd/bugs-designer.md` B-051 + B-052. No engine doc-sync needed (no structural
  or contract change: the state README lists API names only; the canvas README's pen section
  doesn't cover style commits).
