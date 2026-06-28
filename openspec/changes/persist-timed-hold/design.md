# Design — persist the timed hold (B-032)

## Decision: same field, layered override (no schema change)

The fix sets the EXISTING optional `playout.holdMs` — no new field. The inspector
control writes the STORED default; the preview session override still layers on top
via the unchanged `effectivePlayoutFor` (`o?.holdMs ?? b.holdMs`). So an
authored-default and an operator-override compose: the export/on-air uses the stored
value, a preview/rundown can retune it for a run.

## Decision: the runtime + exporter already honor a stored holdMs

The controller's `scheduleHold(holdMs)` and the runtime wiring honor `holdMs` for
both `auto-out` and `loop-cycle` (incl. the between-cycle hold) — proven by the
`content-less-timed-hold` runtime guards. `buildPlayoutMetadata` already bakes
`holdMs` when present, and the single-file export inlines the whole scene (the
runtime reads `scene.playout` directly). So NO runtime/exporter code change is
needed — the only gap was the missing authoring path. There is no mode-specific
branch: baking the stored value fixes auto-out and loop-cycle uniformly.

## Decision: the inspector control gating

`holdMs` is offered only when the hold is TIMED under an exit mode — `(mode ===
'auto-out' || mode === 'loop-cycle')` AND the effective hold source is `timed`
(`hasContent ? (playout.holdSource ?? 'timed') : 'timed'`). A content-driven hold
ignores `holdMs`, and `manual` has no timed hold, so the control is hidden there. It
is a shared `RealtimeNumberInput` (ms, min 0, step 100) writing
`designerStore.setPlayout({ holdMs })`. The mode select already seeds a default
`outPoint` when picking `auto-out` / `loop-cycle`, so an exit segment exists.

`repeat` is intentionally left as a preview/rundown session override (out of scope
for B-032, which is specifically the timed hold).

## Tests

- **Exporter**: `buildPlayoutMetadata` bakes a stored `holdMs` for a content-less
  `auto-out` AND `loop-cycle` (value, not 0).
- **Designer E2E**: the inspector `holdMs` control appears for a content-less timed
  `auto-out` / `loop-cycle`, persists the value across a mode round-trip, and is
  hidden for `manual`.
- **Kept**: the `content-less-timed-hold` runtime guards (stored / override /
  loop-cycle between-cycle / no-out-point / export-collapse-without-holdMs) + the
  preview E2E (loop-cycle holds; no-out-point gate).

## Out of scope

- A persisted `repeat` (stays a preview/rundown session override).
- Seeding a non-zero default `holdMs` on mode change (the operator authors it; an
  unset hold stays 0 — no hold authored).
