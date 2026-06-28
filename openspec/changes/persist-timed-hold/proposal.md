# Persist the timed hold (holdMs) so a content-less export holds (B-032)

## Why

A content-less `auto-out` / `loop-cycle` composition with a timed hold closes
almost immediately on EXPORT / on-air (any `holdMs` behaving like 0). Recon pinned
the cause to PREVIEW-vs-EXPORT: the runtime and controller correctly honor `holdMs`
(stored on `scene.playout` OR a preview-session `playoutOverride`, including
loop-cycle's between-cycle hold and the no-out-point/empty-outro case) — so the
PREVIEW holds. But the single-file export bakes only the STORED playout
(`buildPlayoutMetadata` → `playoutOf`, and the inlined scene the runtime reads), and
the inspector NEVER persisted `holdMs` (D-020 made it preview/session-only). So an
exported content-less timed `auto-out` has `holdMs` undefined ⇒ `scheduleHold(0)` ⇒
it collapses.

## What Changes

- **Designer (the fix)** — the inspector's Playout section gains an authorable
  `holdMs` control that writes the STORED `scene.playout.holdMs`. It appears only
  for a TIMED hold under `auto-out` / `loop-cycle` (content-driven ignores
  `holdMs`). The preview-session override still layers on top via
  `effectivePlayoutFor` (`override.holdMs ?? stored.holdMs`), so authored-default +
  operator-override both work.
- **Export** — already correct: `buildPlayoutMetadata` bakes `holdMs` when present,
  and the inlined scene carries `scene.playout.holdMs`. Once the inspector persists
  it, both auto-out and loop-cycle exports hold for the authored duration (no
  mode-specific path — the runtime already honors a stored `holdMs`).
- No schema change (the optional `playout.holdMs` field already exists). `repeat`
  stays a preview/rundown session override (unchanged).

## Capabilities

- `designer-playout-lifecycle` (MODIFIED): `holdMs` is no longer preview-only — it
  is an authorable STORED default (exported), still overridable in the preview; the
  inspector authors it for timed `auto-out` / `loop-cycle`.

## Impact

- `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx` (the `holdMs`
  control + the note/hint update) + an E2E.
- `packages/vcg-format/tests/playout-metadata.test.ts` (a B-032 bake test for both
  modes); the existing `content-less-timed-hold` runtime guards stay.
- No runtime/exporter code change (both already honor a stored `holdMs`); no schema
  change, no version bump.
