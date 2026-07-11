# Design — fix setConfig serve-restart regression

## Diagnosis (experiments first, 2026-07-11)

Operator repro (live, CasparCG 2.5.0 `69e8ad5`): wrong-OSC-port Apply (UI
times out at 8 s — `WebSocketRuntime.ts:50` `REQUEST_TIMEOUT_MS`), then a
good Apply — afterwards every Load ships the BARE template id and 404s.
A bare id means `CasparRuntime.#sendAdd` took the `: templateId` branch
(`caspar-runtime.ts:969-971`), i.e. `templateServer.listening === false`
while the bridge still accepted loads.

### What the mock experiments showed (all on pre-fix code)

1. **The clean sequential cycle is NOT the bug**: bad-OSC apply → good
   apply, each awaited → the serve restarts every time (fresh ephemeral
   port), loads carry served URLs. The repro therefore requires the second
   Apply to run while the first is in flight — which the 8 s UI timeout
   guarantees live.
2. **`setConfig` has no serialization** (`caspar-runtime.ts:626` onward).
   A concurrent-applies test showed both returning `ok:true` while
   interleaving teardown/rebuild — and left the adapter holding
   already-stopped sessions: the next Load failed with ZERO wire traffic
   (failure mode B).
3. **`wasServing` reads transient state** (`caspar-runtime.ts:633`):
   `TemplateHttpServer.stop()` nulls `#server` IMMEDIATELY
   (`template-http-server.ts:138-141`), so `listening === false` for the
   entire duration of any in-flight stop. A concurrent good Apply reads
   `wasServing = false` → skips the restart (`:668 if (wasServing)`) →
   returns `ok:true` with the serve down (failure mode A — the operator's).
4. **Why their Apply #1 wedged**: `stop()` awaits `server.close()`, which
   waits on held connections. Probes: local Node 24 force-reaps even
   MID-REQUEST sockets in ~300 ms, so the wedge cannot reproduce here — but
   the reaping is version-dependent (Node <19 never reaps idle
   connections; CEF holds pooled/preconnect sockets for minutes). Their
   sequence: Apply #1 wedges at `caspar-runtime.ts:635` (serve stopped,
   sessions not yet rebuilt) → UI timeout → Apply #2 runs completely
   (sessions rebuilt fine, serve restart SKIPPED per (3)) → sends work,
   serve down → bare-id 404s, byte-for-byte their caspar log.
5. **The deeper contract bug**: `#sendAdd`'s bare-id fallback exists for
   isolated unit tests but silently ships an unservable ADD in production.
   R-010's "fail loudly, never a silent bare-id" was never enforced here.

## The fix (owner-approved, minimal, on-air-safe)

1. **Serialize** — `#applyInFlight`; concurrent apply →
   `{ ok:false, reason:'apply-in-progress', message }` (one-value enum
   addition; the panel already renders `message`). Kills mode B and the
   mode-A window.
2. **Bounded forceful serve stop** — `TemplateHttpServer` tracks sockets
   (`server.on('connection')`), `stop()` calls `closeAllConnections?.()`
   and destroys every tracked socket after initiating `close()` — bounded
   teardown on every Node/CEF combination. Kills the wedge itself.
3. **`#servingDesired`** (set once in `startServing()`) replaces the
   `wasServing` snapshot: `setConfig` always restarts the serve when
   serving is desired, regardless of transient `listening`; still down
   after the existing loopback retry → the already-defined
   `ok:false 'apply-failed'`. `setConfig` can never return `ok:true` with
   the serve down. Unit tests that never call `startServing()` keep
   today's behavior (no serve, bare ids allowed).
4. **Loud bare-id contract** — `#sendAdd`: `servingDesired && !listening` →
   `applyAck(seq, false, 'template-serve-down')`, return false (mirrors
   the unknown-template guard); NO command reaches the wire. The bare id
   survives only for the never-served unit-test path.

Test seam: `options.templateServer?` (constructor injection, test-only) so
the serve-down-while-desired state stays directly testable — post-fix it is
otherwise nearly unreachable, which is the point.

## Out of scope (frozen)

AMCP escape rule; B-044 lifecycle + OSC firehose protections;
reconnect-reconciliation; the R-009 sweep (its timer/state is untouched by
this change beyond riding the existing setConfig reset); B-046 internals.

## Test matrix

- **Concurrent-apply regression** (fails pre-fix): second apply while the
  first is in flight → refused `'apply-in-progress'`, state uncorrupted; a
  follow-up sequential apply succeeds and a Load carries the served URL.
- **CEF-wedge stop() boundedness**: held mid-request + preconnect sockets →
  `stop()` resolves well under 1 s by force-destroy (portable across Node
  versions).
- **Injected-failing-server contract test** (fails pre-fix): a template
  server whose `start()` always throws → apply returns
  `ok:false 'apply-failed'` AND a subsequent Load is refused with the
  `'template-serve-down'` ack and ZERO `CG ADD` on the wire.
- **Sequential-cycle baseline** (green pre- and post-fix): bad-OSC apply →
  good apply → serve listening, Load resolves via the served URL.
- Every existing caspar-client / caspar-bridge / runtime suite + the
  failover integration test stays green.

## Optional live smoke (operator, non-gating)

1. Rebuild + restart the bridge on this branch.
2. SERVERS → change the OSC port to a wrong value → Apply (should return
   promptly now; health may show degraded until fixed — expected).
3. Change the OSC port back → Apply → health returns HEALTHY.
4. Load + Take a template → renders (the caspar log shows `CG ADD` with an
   `http://…/template/<id>` URL, never a bare id).
5. Double-click Apply rapidly: the second click surfaces "another apply is
   in progress" — no corruption, a later Apply works.
