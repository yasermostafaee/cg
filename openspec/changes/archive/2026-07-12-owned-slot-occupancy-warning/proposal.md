# Warn when an owned slot's adopt-CLEAR missed the primary (B-056)

## Why

B-056 (found by the B-053 adversarial design review, `fix-false-onair-badge`
design.md §8): in mirror-sync with the primary's AMCP link down but no
failover (e.g. `autoFailoverEnabled: false`), a load's adopt-CLEAR and its
`CG ADD` can both succeed BACKUP-ONLY. `#adoptLayer` correctly refuses to
mark the layer adopted (adoption requires `ok && onPrimary`), but `load()`
proceeds — by design — and binds the slot + OSC interest over a layer where a
previous session's VISIBLE orphan producer may survive on the primary
output. Post-B-053 the item honestly reads READY, but there is NO tell that
foreign content is live on the primary under the item's own layer; R-009's
`unexpected-onair`-style orphan surface cannot fire because the slot IS
owned. A subsequent Take would `CG PLAY` the orphan.

Fix approach is **Option B — an additive operator warning**. The loud-fail
alternative (reject the load when adoption misses the primary) is REJECTED:
it would change what a backup-only load means in every redundancy fault
mode — `load()`'s proceed-after-adopt decision is frozen
(reconnect-reconciliation), and keeping it unchanged is a hard requirement
of this change.

## What Changes

- **Detection (load-time, one-shot — NOT a sweep addition)**: `#adoptLayer`
  surfaces the primary-landing result it already computes (return value
  only; the CLEAR it sends, the `ok && onPrimary` adoption gate, the
  backup-only-leaves-unadopted rule, and `load()`'s unconditional proceed
  stay behaviorally identical). In `load()`, when adoption did NOT land on
  the current primary AND the primary session's passive OSC occupancy tap
  reports the target (channel, layer) as non-empty within the R-009
  freshness window — sampled BEFORE the item's own `CG ADD` — the bridge
  raises an owned-slot occupancy warning keyed on (channel, layer, itemId).
  Unknown occupancy (primary OSC silent/stale) does NOT warn — observed
  occupancy only (decision + justification in `design.md`).
- **Surface**: new channels `layers.owned-occupancy` (pull) +
  `layers.owned-occupancy-changed` (publish, change-only) in
  `@cg/shared-ipc` — R-009's `layers.orphans*`/`layers.clear` channels and
  behavior are untouched. The Runtime banner component renders owned-slot
  rows as a DISTINCT variant naming the channel-layer AND the item, with
  **no Clear button** (clearing an owned layer stays Out/Remove's job —
  R-009's `clearLayer` owned-refusal is unchanged); the remedy text points
  the operator at Out/Remove.
- **Resolve (event-driven, never optimistic, never auto-clearing)**: a
  warning resolves ONLY when the primary's layer is provably cleared — a
  later bridge-issued CLEAR for that (channel, layer) lands on the current
  primary (`ok && onPrimary`, the adoption-marking sites: adopt / out /
  remove / operator `layers.clear`) — or when the item is removed / the
  layer deallocated (the layer becomes unowned; the R-009 sweep then owns
  surfacing whatever is still there). A Take does NOT resolve it. A
  `setConfig` server swap drops all warnings (old-server knowledge, mirrors
  the R-009 tracker reset).
- **Ripple**: bridge routes + publish wiring, `RuntimeBridge` contract,
  `WebSocketRuntime`, `MockRuntime` parity (empty set; out/remove resolve;
  `CG_E2E_OWNED_OCCUPANCY`-guarded seed for Playwright), `useOwnedOccupancy`
  hook, banner variant, jsdom + e2e + integration tests.

## Capabilities

- `runtime-caspar-bridge` (ADDED — Requirement "Owned-slot occupancy raises
  a warning when adoption misses the primary").
- `runtime-ui` (ADDED — Requirement "Owned-slot occupancy warning surface
  without a direct Clear").
- Ordering: the held `fix-amcp-escaping-v2` / `reconnect-reconciliation`
  deltas own seven requirement headings (re-verified this session: AMCP
  seam, Template resolution is validated, Live connection is never silently
  downgraded, bridge retains template HTML, Playout verbs are prescriptive,
  browser re-delivers on reconnect), none of which this change touches;
  both of this change's deltas are ADDs of new headings → it archives
  ordering-independent of that pair. In particular the shared "Template
  resolution is validated" clause is NOT modified.

## Impact

- `packages/shared-ipc` (two channels + schema + tests),
  `tools/caspar-bridge` (adopt return plumb, load-time detection, warning
  store + emitter + resolve sites, routes, integration tests),
  `apps/runtime` (contract, WebSocketRuntime, MockRuntime, hook, banner
  variant, jsdom + e2e).
- Frozen (referenced, behavior unchanged): AMCP escape rule; B-044
  completion lifecycle; reconnect-reconciliation (adopt-CLEAR mechanism,
  `#adopted` gate, `load()`'s proceed-after-adopt) — single permitted touch
  is `#adoptLayer` returning its already-computed result; R-003 staged
  edits; R-009 sweep + OrphanTracker owned/unowned diff + `clearLayer`
  owned-refusal; R-010 setConfig semantics; B-064 serve/`#sendAdd`.
- Validation is mock/integration-based; the live smoke (mirror pair,
  primary AMCP down, foreign graphic via a second AMCP client) is recorded
  in the PRD entry as PENDING hardware.
