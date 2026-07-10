# Surface orphaned/unknown on-air layers with per-layer Clear (R-009)

## Why

`reconnect-reconciliation` (B-048) deliberately ships no blind startup CLEAR —
an orphan from a dead bridge session stays on air until a Load happens to
target its layer (on-air safety: a cold bridge cannot tell junk from a graphic
ridden through a controller restart). The flip side, confirmed live
2026-07-10: an orphan on a layer no Load targets stays up INDEFINITELY with
zero operator visibility or control. The decision belongs to the operator,
not a heuristic — R-009 gives them the visibility and an explicit per-layer
Clear.

The operator-decided approach is a PERIODIC OCCUPANCY SWEEP (not
interest-widening). Part-A diagnosis (full map + evidence in `design.md`)
corrected the sweep's INSTRUMENT with a live capture: on the actual target
build (CasparCG 2.5.0 `69e8ad5`, read-only probe), `INFO <channel>` returns
format/mixer/output XML with NO per-layer data, and `INFO <ch>-<layer>`
ignores the layer — the assumed AMCP occupancy query does not exist on the
2.3+ lineage. Per-layer occupancy exists ONLY on OSC
(`/channel/N/stage/layer/L/foreground/producer`, the ADR-0004 315k-event
capture). The diagnosis also proved the PRD's original "wire
`unexpected-onair`" idea was structurally insufficient: the interest filter
drops non-owned-layer events UPSTREAM of the Reconciler
(`osc/transport.ts:125`), so that signal can never see a never-loaded layer.

## What Changes

- **`OscOccupancyTap`** (`@cg/caspar-client`): a passive, bounded
  `Map<'ch:layer', {producer, at}>` fed by ONE added line in
  `OscTransport.attachHandlers` — after `messageToEvent`, BEFORE the interest
  drop (every producer message is already parsed there; interest gates
  emission, not parsing). It emits nothing, subscribes nothing, never reaches
  the Reconciler, and is cleared on `resetState()`. The interest set,
  rate-limiter, change-tracker, and their tests stay byte-for-byte untouched —
  asserted explicitly in the suite (the independence proof). Zero added AMCP
  traffic.
- **The sweep** (`CasparRuntime`): every `sweepMs` (default 5000,
  injectable) read `#adapter.primarySession.osc.occupancy` DYNAMICALLY
  (failover/setConfig-proof, no rewiring); skip unless the primary session is
  `healthy` (warnings freeze, never falsely resolve while disconnected).
  Occupied = entries fresh within `occupancyStaleMs` (2500) with
  producer ≠ `empty` (freshness handles real CasparCG going SILENT on CLEAR
  per B-053; the mock exercises the reports-empty path). Orphans =
  occupied − owned(`#slots`), any channel OSC reports. Debounce: surface
  after 2 consecutive sweeps, resolve after 1 empty/aged-out sweep; publish
  only on set change; unref'd timer cleared in `stop()`; no per-tick logging.
- **Channels** (`@cg/shared-ipc`): `layers.orphans` (pull),
  `layers.orphans-changed` (publish), `layers.clear` (request). Clear:
  REFUSED if the layer is in `#slots` (`{ok:false, reason:'owned'}` —
  Out/Remove's job), else an urgent `CLEAR <ch>-<layer>` via the adapter
  (`ok && onPrimary` marks `#adopted`, consistent with out/remove), never
  touching slots/interest it doesn't own; the warning resolves on the next
  sweep's observed empty. NEVER auto-clear.
- **UI**: `OrphanLayersBanner` + `useOrphans` hook — amber, `role="alert"`,
  renders null with no orphans (idle-quiet), one row per layer ("Layer 1-60
  is on air but not on your stack") with a confirm-gated CLEAR, persistent
  while the orphan persists. MockRuntime parity: empty set + clear handling +
  a `CG_E2E_ORPHAN`-guarded seeded orphan for Playwright.
- **Stays dead (C-010 unchanged)**: `unexpected-onair` (superseded by the tap
  for this purpose — and structurally unable to see never-loaded layers),
  `LayerManager.observe`/`collision` (quarantine-on-sweep would change the
  designed adopt-CLEAR allocation behavior — out of scope),
  `beginResync`/`endResync`, `HeartbeatService`.

## Capabilities

- `runtime-caspar-bridge` (ADDED — Requirement "Orphaned layer occupancy is
  swept, surfaced, and operator-clearable").
- `runtime-ui` (ADDED — Requirement "Orphan-layer warning surface with
  per-layer Clear").
- Ordering: the held `fix-amcp-escaping-v2` / `reconnect-reconciliation`
  deltas own seven requirement headings (re-verified this session), none of
  which this change touches; both deltas are ADDs of new headings → archives
  ordering-independent of that pair.

## Impact

- `packages/caspar-client` (tap + one transport line + tests),
  `packages/shared-ipc` (three channels + tests), `tools/caspar-bridge`
  (OrphanTracker + sweep + clearLayer + routes + publish + integration
  tests), `apps/runtime` (contract ripple through all three bridge
  implementations, hook, banner, jsdom + e2e).
- Frozen (reference only): AMCP escape rule, B-044 lifecycle AND its OSC
  firehose/interest protections (untouched, asserted), reconnect-
  reconciliation behavior, R-003, R-010 setConfig, B-046 internals.
- Validation is mock/integration-based (the mock's OSC emitter already
  reports per-layer producers truthfully — no mock changes needed); an
  OPTIONAL live smoke (probe script → foreign graphic → banner → Clear) is a
  Part-C nice-to-have, not a gate.
