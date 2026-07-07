# Pending-intent completion: settle `updating`/`exiting` on ack, expire on timeout (B-044)

## Why

B-044 (live, CasparCG 2.5.0 `69e8ad5`): after a `CG UPDATE` the stack badge shows
**"UPDATING" indefinitely** although the value applies on air and Caspar acks
`202`. Diagnosis (proven in code, in a bridge→amcp-mock repro, and confirmed on
the live box with an OSC probe — see `design.md`):

- The Reconciler treats `updating` (and `exiting`) as **resting statuses**: an OK
  ack maps intent → ackedStatus by identity, which _confirms_ the intent (clears
  `pending`) while parking the displayed status on `updating` forever.
- The only escape — fresh OSC truth (`on-air`, < 1s TTL) — can never arrive: a
  `CG UPDATE` causes **no producer transition**, and the OSC change-tracker
  suppresses every repeated identical value (live probe: ~50 datagrams/s in,
  ~zero post-filter events in steady state).
- There is **no timeout anywhere**: `item-divergent` has no IPC channel or
  consumer; the UI renders the pushed status verbatim.
- `out` has the same disease: after OSC truth decays it rests on `exiting`
  ("EXIT") forever — unnoticed live, reproduced against the mock.
- E2E never caught it because the browser `MockRuntime` hard-codes the missing
  settle transition (`#settle`, 160 ms), diverging from the real bridge exactly
  on this behavior.

## What Changes

- **Reconciler — transient intents complete on ack** (`@cg/caspar-client`):
  `update` and `out` intents record a settle target (the item's underlying state:
  prior status for update, `idle` for out). The OK ack of the intent's own
  command (the `CG UPDATE` line; the single `CLEAR` for out) settles
  `intentStatus`/`ackedStatus` to that target. Stale acks (an older seq than the
  latest intent) no longer mutate state. Honesty note: the ack means **accepted
  by CasparCG**, not proof the template applied the value (B-041's history) —
  the same semantics Take's ack already has; see `design.md`.
- **Bounded expiry — never hang forever**: a new explicit `unconfirmed` status
  (added to `StackItemStatusSchema` in `@cg/shared-schema`). The bridge arms a
  5 s timer per update/out send; if no ack lands in time the Reconciler expires
  the intent to `unconfirmed` (+ `errorCode`), surfaced in the UI — never a
  silent revert, never a fake success. A late OK ack after expiry settles
  honestly; a NAK keeps the existing `error` path.
- **UI**: minimal `unconfirmed` badge branch in `airStateVisual` (the queued
  Runtime UI-polish item restyles all badge states later).
- **Browser `MockRuntime` alignment**: its simulated update lifecycle re-stated
  on the new contract (transient `updating` that settles on the ack of its own
  round-trip, bounded) so e2e stays representative rather than structurally
  green via a hard-coded timer.
- **Tests**: injected-clock Reconciler unit tests (settle, stale ack, NAK,
  expiry, late-ack rescue, out→idle); bridge→mock integration in **both** OSC
  regimes (heartbeat on AND `disableOsc`) proving update/out settle within the
  bound and the stuck states cannot regress; an e2e asserting the badge returns
  to ON AIR after an update. The temp diagnostic repro is replaced by these.
- **PRD notes (docs duty)**: append the blur-commit remount hazard to R-003 and
  cross-reference it from B-044.

Out of scope (per approval): Take/on-air ack-honesty semantics, optimistic UI
resolution, the frozen AMCP escape rule, R-003 staged-edits, and the four new
bridge findings (filed separately on a docs-only branch after wrap-up).

## Capabilities

- `runtime-caspar-bridge` (MODIFIED): stack state from OSC confirmations —
  amended to state OSC truth is transition-driven and cannot complete verbs with
  no producer transition.
- `runtime-caspar-bridge` (ADDED): transient stack intents complete on ack or
  expire to an explicit `unconfirmed` state within a bound.

## Impact

- `@cg/shared-schema` — `StackItemStatusSchema` gains `'unconfirmed'`.
- `@cg/caspar-client` — Reconciler: settle-on-ack, stale-ack guard,
  `expireIntent`.
- `tools/caspar-bridge` — 5 s expiry timers around update/out sends.
- `apps/runtime` — `airStateVisual` branch; `MockRuntime` lifecycle alignment.
- Tests in `@cg/caspar-client`, `@cg/caspar-bridge`, and `@cg/runtime` (the
  `@cg/shared-schema` change is enum-only — no test needed); PRD notes in
  `docs/prd/`.
- B-044 stays `[ ]` → flips `[x]` only after the operator's live validation
  (incl. the stop-Caspar-mid-update negative test).
