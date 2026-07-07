# Design — Caspar bridge Phase 3a (C-001)

Key decisions only. Builds on Phase 2 (`caspar-bridge-runtime`).

## Two sessions under the existing RedundancyAdapter

`CasparRuntime` now holds `{ A: ServerSession, B: ServerSession }` and a
`RedundancyAdapter` (from `@cg/caspar-client`, **not** reimplemented), constructed
with the config's `strategy` + `autoFailoverEnabled`, `initialPrimary: 'A'`. All
AMCP goes through `adapter.send(line, opts)`:

- mirror-sync fans out to both, primary ack wins;
- the adapter's own logic records timeouts / 5xx and trips `maybeFailover(...)`;
- the adapter wires the primary session's `state-change` → auto-failover on
  disconnect/degraded.

So sending through the adapter is what makes auto-failover real — no extra trigger
code in the bridge.

## OSC across a switch

Each session's `OscTransport` emits filtered events. The Reconciler is fed events
**only from the current primary** (`if (adapter.currentPrimary === label)`), and OSC
interest for an allocated slot is registered on **both** sessions' transports. Both
sessions receive the same (mirrored) commands, so after a failover the new primary's
OSC already reflects the right state and re-confirms it — the Reconciler keeps its
items; no reset. (Reconnect of a dropped session still runs `ServerSession`'s
mandatory RESYNCING.)

## Health & lastFailover

`health()` reports current ROLES: `primary` = current-primary server's
`{label, state, amcpAxisOk}`, `backup` = the other, `currentPrimary` = real, and
`lastFailover` captured from the adapter's `failover-complete` event
(`{at, reason, from, to}` → `FailoverInfo`). `connections.failover` →
`adapter.failover('manual')` → returns the new primary. `healthChanged` is emitted on
the adapter's `health` and `failover-complete` events.

## Test wiring (two amcp-mocks)

Each session binds its own OSC port; each mock pushes OSC to its session's port. So:
pick two free UDP ports (A, B), create `mockA`/`mockB` with those `oscPort`s, and a
connection `{ servers: { A: {amcpPort: mockA, oscPort: portA}, B: {amcpPort: mockB,
oscPort: portB} }, strategy: 'mirror-sync', autoFailoverEnabled: true }`.

- **Auto:** both healthy → `mockA.stop()` (or `closeAllAmcpConnections()`) → session A
  drops → adapter fails over to B → assert `currentPrimary==='B'`, a command acks via
  B, health shows B + `lastFailover`.
- **Manual:** both healthy → `runtime.failover()` → `currentPrimary==='B'`,
  `lastFailover.reason==='manual'`, a command continues to B.

## Out of scope (Phase 3b)

On-hardware validation of the AMCP HTML-producer update sequence (ADR 0006). The
command-builder seam is untouched here.
