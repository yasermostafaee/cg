# Fix setConfig serve-restart regression (R-010) — serialize applies, bounded serve stop, loud bare-id contract

## Why

Operator repro (deterministic, live on CasparCG 2.5.0 `69e8ad5`): Apply a
WRONG OSC port (times out in the UI at 8 s), Apply the correct value again —
then every Load fails with the bridge sending the BARE template id
(`CG 1-60 ADD 0 "362b1285-…" 0 "{}"` → 404 CG ADD FAILED).

Diagnosis (experiments + probes recorded in `design.md`): ONE root cause —
`setConfig` is not serialized — with TWO failure modes:

- **Mode A (their log):** Apply #1 wedges inside `TemplateHttpServer.stop()`
  (`server.close()` waits on held CEF connections; Node <19 never reaps
  them; the local Node 24 reaps in ~300 ms, which is why the naive mock
  repro can't wedge — the mechanism is environment-dependent). The stop
  nulls `#server` immediately, so `listening === false` for the whole wedge.
  The operator's second Apply then runs CONCURRENTLY, reads
  `wasServing = false`, SKIPS the serve restart, returns `ok:true` — serve
  down forever, sessions fine, every Load ships an unservable bare id.
- **Mode B (demonstrated on any Node):** two interleaved applies corrupt the
  session swap — the final adapter can hold already-stopped sessions; every
  send rejects with no wire traffic.

Plus the deeper contract bug: `#sendAdd`'s `listening ? url : bare id`
branch silently ships an unservable ADD in production — R-010 promised
"fail loudly, never a silent bare-id" and never enforced it here.

## What Changes (owner-approved, all four)

1. **Serialize `setConfig`** (`#applyInFlight`): a concurrent apply is
   refused loudly — `ok:false`, new response reason `'apply-in-progress'`
   (one-value enum addition to `connections.set-config`; the panel already
   shows the message).
2. **Bounded forceful serve stop**: `TemplateHttpServer` tracks its sockets
   and destroys them in `stop()` (+ `closeAllConnections?.()` where
   available) — teardown is bounded on every Node/CEF combination; the
   wedge becomes impossible, not just locally unlikely.
3. **`#servingDesired` replaces the transient `wasServing` read**: set once
   by `startServing()`; `setConfig` always restarts the serve when serving
   is desired; still down after the existing loopback retry →
   `ok:false 'apply-failed'` — never `ok:true` with the serve down. Unit
   tests that never call `startServing()` keep today's behavior.
4. **Loud-failure contract in `#sendAdd`**: `servingDesired && !listening` →
   the intent acks `'template-serve-down'` and the load is refused
   (mirroring the unknown-template guard); the bare id survives ONLY for
   the never-served unit-test path.

Plus a test-only `options.templateServer` injection seam so the
serve-down-while-desired state stays directly testable.

## Capabilities

- `runtime-caspar-bridge` (MODIFIED — Requirement "Server connection is
  reconfigurable at runtime, gated on air": serialization, serve-integrity,
  and the loud bare-id contract). That heading was ADDED by the archived
  R-010 change and is owned by NEITHER held delta (`fix-amcp-escaping-v2` /
  `reconnect-reconciliation` own different headings — re-verified) → this
  change archives ordering-independent of that pair.

## Impact

- `packages/shared-ipc` (one enum value + schema test),
  `tools/caspar-bridge` (`template-http-server.ts` socket tracking,
  `caspar-runtime.ts` setConfig/#sendAdd, regression tests), `apps/runtime`
  (type-level ripple only: MockRuntime's return type widened; the panel
  already displays `message`).
- Frozen (untouched): AMCP escape rule, B-044 lifecycle + firehose
  protections, reconnect-reconciliation, the R-009 sweep, B-046 internals.
- Filed as a PRD regression bug (number verified against merged main at
  wrap-up).
