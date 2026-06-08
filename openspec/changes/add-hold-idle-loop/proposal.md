## Why

A graphic that sits on screen often needs continuous subtle motion — a pulsing
logo, a breathing bug, a shimmering lower-third. D-020's single-`outPoint` model
plays the entrance and then **freezes** at the hold frame, so there is no way to
keep a small idle animation running while the graphic is held. This adds that as
an opt-in, without reintroducing the two-marker dead region that D-020 removed.

## What Changes

- **Schema:** add an optional `holdLoopStart` frame to the composition lifecycle
  (alongside D-020's `outPoint`), with the invariant
  `activeRange.in ≤ holdLoopStart ≤ outPoint`. Absent `holdLoopStart` = D-020's
  frozen hold (unchanged). Additive optional; no `schemaVersion` bump.
- **Runtime:** when `holdLoopStart` is set, the HOLD phase loops
  `[holdLoopStart → outPoint]` instead of freezing at `outPoint`. The segment is
  part of the entrance and is fully played the first time through, then replayed
  on a seamless loop — **no frame is skipped** (unlike the removed
  intro-end/outro-start gap). Composes with `auto-out` and `loop-cycle`: the idle
  loops during the hold/dwell, and the exit (`[outPoint → activeRange.out]`) plays
  normally on `stop()` or after `holdMs`.
- **Designer UI:** an optional second timeline marker (`holdLoopStart`) plus a
  "loop while holding" toggle in the playout config; off by default (one marker).
- **Preview:** the preview reflects the idle loop, and the designer can
  toggle/test it in the preview modal (consistent with D-020's preview timing
  controls).
- **Export:** metadata-only — the inlined scene already carries `holdLoopStart`,
  so the runtime in the exported file executes it; no exporter logic change beyond
  surfacing the marker in metadata.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `designer-playout-lifecycle`: extend the HOLD phase with an optional idle loop
  (`holdLoopStart`) that loops a replayed tail of the entrance during hold,
  composing with `manual` / `auto-out` / `loop-cycle`.

## Impact

- **Schema:** `packages/shared-schema/src/scene.ts` — optional `holdLoopStart` on
  the lifecycle; invariant `activeRange.in ≤ holdLoopStart ≤ outPoint`.
- **Runtime:** `packages/template-runtime/src/playout-controller.ts` (loop
  `[holdLoopStart → outPoint]` during hold when set); `frame-driver.ts` (reuse the
  existing loop mode bounded to the idle sub-range).
- **Designer:** `features/timeline/*` (optional `holdLoopStart` marker, invariant
  enforced against `outPoint`); the playout config toggle; `platform/preview.ts`
  reflects it; preview-modal toggle/test.
- **Export:** `packages/vcg-format` / `platform/ExporterSingleFile.ts` — carry
  `holdLoopStart` in metadata (no behavior change; scene is already inlined).
- **Unchanged:** D-020's single-marker default behavior (frozen hold when
  `holdLoopStart` is absent), `.vcg` shape.
- **Tests:** schema (invariant; absent = frozen hold); runtime (hold loops the
  sub-range when set; entrance plays fully once before looping; auto-out/loop-cycle
  compose; stop during idle plays the exit); designer marker store test.
- **Dependencies:** **D-020** (`outPoint`, hold, the controller, preview modal).
