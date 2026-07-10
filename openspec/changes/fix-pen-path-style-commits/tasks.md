# Tasks — fix-pen-path-style-commits (B-051 + B-052 rider)

## 1. Recon

- [x] B-051: red unit test against the live store — all four Path Style commits
      (`stroke.width` / `stroke.dash` / `stroke.color` / `fill.color`) no-op on a fresh pen path
      (values frozen at creation defaults); baseline proves `fill`/`stroke` ARE seeded at creation
      (the missing-defaults hypothesis is REFUTED — the guards are the mechanism).
- [x] B-051: trace why the symptom looked partial (kind-agnostic transform/filter cases; the
      kind-agnostic keyframe path; `applyFillModeChange` bypassing the guard for gradients).
- [x] B-052: `layerTypeIcon` has no top-level `case 'path'` → falls to the `Square` default; the
      SHAPE sub-switch's `'path'` is the legacy variant (`Spline`), unrelated. Full mapping audit:
      only `path` mis-iconed.
- [x] Verify the runtime already renders path fill/stroke/width/`stroke-dasharray` and evaluates
      `stroke.*` tracks (no runtime change needed; edits will render + export).
- [x] Verify next free bug numbers: B-046–048 (runtime), B-049/B-050 (tooling) → B-051, B-052.

## 2. Implementation

- [x] `state/slices/timeline.ts` `writeStaticAnimatable`: `boxKind` gains `'path'`
      (stroke.width/dash/color); `fill.color` accepts `shape | path`. D-056 strictness for
      ticker/clock/sequence preserved.
- [x] `features/timeline/ElementRow.tsx`: top-level `case 'path'` → `PenTool` (shared `Icon`,
      toolbar-matching); `layerTypeIcon` exported for the unit test.

## 3. Tests

- [x] Unit `tests/path-style-commit.test.ts` — red pre-fix / green post-fix: the four commits
      mutate a path; dash 0 clears; shapes keep working; a ticker still refuses stroke writes.
- [x] Unit `tests/layer-type-icon.test.ts` — a path element maps to `PenTool` (not `Square`);
      every other kind keeps its established icon.
- [x] E2E `tests/e2e/pen-path-style.spec.ts` — draw a pen path, drive the REAL Inspector controls
      (spinbuttons, ColorField hex, FillField popover): preview SVG shows `stroke-width` 8,
      `stroke-dasharray` 6, stroke `#FF0000`, fill `#00AA00`; the single-file HTML export carries
      all four.

## 4. Docs

- [x] PRD `docs/prd/bugs-designer.md`: B-051 (high) + B-052 (low) filed in canonical format with
      the recon findings, both `[~]` with branch + change dir.
- [x] Engine doc-sync check: none needed (no structural/contract change; state README lists API
      names only).

## 5. Gate + ship

- [x] Uncached gate (`pnpm turbo run typecheck lint test build --force`, 15/15 incl. 627 unit
      tests + root `pnpm format:check` green); `pnpm test:e2e` (188 passed); `pnpm openspec
validate --all --strict` (33/33).
- [x] Preview served (`vite preview`, fresh dist); PAUSED for owner verification with no
      commit/push. Owner CONFIRMED 2026-07-10 (fill/stroke/width/dash apply on a fresh pen path;
      timeline row shows the pen icon).
- [ ] Then conventional commits (one per bug), push, verify the remote head, give the compare
      URL. `[x]`/archive after owner confirm + merge.
