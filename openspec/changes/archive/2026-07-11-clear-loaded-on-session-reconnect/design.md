# Design — clear `#loaded` on AMCP session reconnect (B-054)

> Part-A diagnosis + design, recorded in full per the B-054 brief. Process
> note: the approval stop was waived mid-task by the operator ("document your
> diagnosis + design decisions in design.md and proceed straight through") —
> product-behavior decisions below are therefore decided-and-documented, not
> approval-gated. All file:line references verified against the working tree
> at `f0be269` (origin/main, B-064 merged).

## 1. Diagnosis — the mechanism, with file:line

`CasparRuntime.#loaded` (`tools/caspar-bridge/src/caspar-runtime.ts:144`) is
the B-039 producer-existence bookkeeping: itemIds whose slot currently has a
live producer. Its full lifecycle today:

- **Set:** `#sendAdd` adds the itemId when a `CG ADD` acks ok
  (`caspar-runtime.ts:1035`) — shared by `load()` (`:447`) and the take
  re-ADD path (`:471`).
- **Read:** exactly one consumer — `take()` (`:462`). Present → bare
  `CG PLAY` (`:484`). Absent → the B-039 re-ADD branch (`:462-482`):
  `CG ADD` (fresh load, reconciler-merged fields, non-intent seq) then
  `CG PLAY`.
- **Cleared:** `out()` (`:515`), `remove()` (`:598`), and — since R-010 —
  the `setConfig` rebuild (`:698`; the PRD entry predates R-010's clear and
  lists only out/remove). **No session-transition path touches it.**
  `#wireAdapter` (`:265-290`) wires only the per-session OSC firehose and the
  adapter's `health`/`failover-complete`; the sole `'healthy'` consumer is
  the transient `whenServerHealthy` (`:368-393`).

**The failure:** restart CasparCG (not the bridge, not the page). The
`ServerSession` loop reconnects on its own
(`packages/caspar-client/src/session/server-session.ts:205-250`): the AMCP
peer close transitions to `disconnected` (`:327-331`), backoff emits
`'disconnected'` (`:241-242`), then connect → handshake → resync →
`healthy` (`:220`) + `emit('healthy')` (`:221`). Nothing in the bridge
observes this for bookkeeping. The next `take()` finds the itemId still in
`#loaded` and sends a bare `CG PLAY` onto the restarted server's **empty**
layer. Real CasparCG blind-acks `202`; the mock models exactly this
(`tools/amcp-mock/src/handlers.ts:192-203`: always 202, `onAir:true` only if
`producer === 'html'`). Nothing renders — the blank take.

**`#adopted` (`caspar-runtime.ts:155`) has the same staleness and is
confirmed harmless in this direction.** A restarted server's layers are
empty, and a CasparCG restart destroys every producer — including any orphan
a previous bridge session left. So the skipped adopt-CLEAR
(`#adoptLayer`, `:940-948`) skips a guaranteed no-op, and a skipped `CLEAR`
on an empty layer changes nothing. We deliberately do **not** clear
`#adopted` on reconnect: (a) it buys nothing (above); (b) extra re-CLEARs
would add AMCP traffic and latency to every post-blip load for zero benefit;
(c) adoption semantics interact with B-056's backup-only-adoption edge —
out of this change's verb-choice scope.

**Why not the structural fix:** C-010/C-011 (re-derive producer existence
from persisted, layer-aware reconciliation; `Reconciler.beginResync`/
`endResync` exist with no production caller —
`packages/caspar-client/src/reconciler/reconciler.ts:266-287`) remain the
structural home. B-054 takes the PRD's first fix-space option: a targeted
invalidation of process-lifetime memory at the exact moment it can become a
lie. It composes with, and does not preempt, C-011.

## 2. The clearing trigger

**Signal: `ServerSession`'s `'healthy'` event, per declared session, wired
inside `#wireAdapter`'s A/B loop.**

- `'healthy'` is emitted at exactly one site: loop-path resync completion
  (`server-session.ts:221`) — i.e. after **every completed TCP
  reconnect cycle** (connect → VERSION/INFO handshake → OSC resync drain),
  including the very first connect. Critically, the degraded→healthy OSC-
  recovery path (`:313-317`, reason `'osc recovered'`) emits only
  `'state-change'`, **not** `'healthy'` — so an OSC blip with an intact AMCP
  connection (producers untouched, no restart possible) never triggers a
  clear. This is precisely the right granularity: a completed reconnect
  cycle is the only event after which the server's producer set is
  unvouchable.
- The adapter's `'health'` event is NOT usable: it is deduped by effective
  liveness (up/degraded/down,
  `packages/caspar-client/src/redundancy/redundancy-adapter.ts:467-484`,
  `:514-518`) and its bridge handler ignores the payload
  (`caspar-runtime.ts:280`) — reconnect micro-transitions never reach it.
- **First connect included, by design.** There is no first-vs-reconnect
  discriminator (`'healthy'` has no payload; the backoff attempt count is
  reset before the emit, `server-session.ts:219-221`) and none is needed:
  at first connect `#loaded` is empty (a no-op clear), and for a mirror
  backup that reaches its **first** healthy after loads already landed via
  the primary, clearing is _correct_ — that server never had the producers,
  the same epistemic situation as a restart. The rule is uniform: **a
  session that just completed a connect cycle is a server whose producer
  set we cannot vouch for.** (Narrow benign race: an ADD acked during the
  150 ms resync window would be wiped by the subsequent `'healthy'`,
  costing one redundant re-ADD at the next take. Safe; accepted.)

**Wholesale, not per-session.** `#loaded` is one Set, deliberately
server-agnostic (`caspar-runtime.ts:138-144`): every ADD/CLEAR fans out to
all declared servers, so existence tracks together. Under mirror-sync:

- If the **restarted** side is the backup, its producers vanished while the
  primary's survive. A bare PLAY would _look_ fine on air — and leave the
  backup silently diverged (a later failover lands on an empty server: the
  B-054 blank take deferred to the worst moment). The correct policy is
  "re-ADD if **any** declared server may lack the producer" — the fan-out
  re-ADD recreates the missing producer on the restarted side and benignly
  stage-replaces the live one on the surviving side. That policy is
  _exactly equivalent_ to a wholesale clear on any session's reconnect.
- A per-server map (`itemId → Set<label>`) would therefore change nothing
  observable — `take()` would still have to re-ADD when any label's bit is
  missing — at strictly higher complexity and a new invariant to maintain.
- Single-primary: per-session and wholesale are the same set.

**Subscription site + teardown.** The handler lives in `#wireAdapter`'s
`['A','B']` loop (the R-009/R-010 dynamic-primary pattern,
`caspar-runtime.ts:270-277`): `#wireAdapter` re-runs after every `setConfig`
rebuild (`:696`) against the fresh session objects, so the subscription
survives reconfiguration; failover replaces no session objects
(`redundancy-adapter.ts:183-206`), so it survives failover with zero
rewiring. Teardown follows the established by-abandonment pattern
(`:262-264` — old listeners die with the old session/adapter objects): a
stopped session's loop has exited (`server-session.ts:180-191` transitions
via `stop()` without emitting `'healthy'`; `running=false` ends the loop) so
it can never fire the handler again. Belt-and-braces, the handler carries a
staleness guard — `this.#sessions[label] === session` — so a session object
from a torn-down era can never touch the current era's bookkeeping (the old
sessions are stopped _before_ `#sessions` is reassigned during
`#applyConfig`, `:678` vs `:689`; the guard makes that window provably
inert). The handler is synchronous — no await between the signal and the
clear, so a concurrent `take()` cannot read the stale set mid-heal.

## 3. Non-interference proofs

**(a) B-044 bounded-completion / settle semantics — untouched.** The handler
mutates only the `#loaded` Set: no Reconciler call, no timer, no AMCP send,
no emitter. Intent settling rides seq-keyed acks (`#send`, `:998-1000`) and
`#expiryTimers` (`:966-981`); neither reads `#loaded`. In-flight `update`/
`out` reference `#slots`, not `#loaded` — a clear mid-flight changes nothing
about their ack/expiry. The only behavioral surface is the **next** `take()`
(the single read, `:462`), whose re-ADD rides a non-intent seq (`:471-477`)
so the take's own status settle is byte-identical to the existing B-039
re-ADD path. The down-window is also unchanged: we clear on _healthy entry_,
not on disconnect, so commands issued against a down server behave exactly
as today (B-044's dead-server paths land `error`/`unconfirmed` unchanged).

**(b) reconnect-reconciliation re-delivery — disjoint by trigger and by
state.** Template re-delivery is keyed solely to the **browser↔bridge
WebSocket** reopen (`apps/runtime/src/platform/WebSocketRuntime.ts:189-197`
→ `#resync()` → `TemplatesImportChannel` → `TemplateRegistry` only —
`tools/caspar-bridge/src/bridge.ts:330-332`, `caspar-runtime.ts:855-860`).
A CasparCG restart reconnects the **AMCP** session inside `ServerSession`'s
loop and never drops the WS server (`bridge.ts:163-174`). Different link,
different state (`#templates` vs `#loaded`): no double-fire, no fight. The
adjacent bridge-restart event (their trigger) starts a fresh process whose
`#loaded` is already empty — a hypothetical clear there is a no-op. The
adopt-CLEAR machinery is untouched (`#adopted` preserved, §1).

**(c) Transient blip (same server, producers intact) — on-air safe.** The
clear itself sends **zero** AMCP commands; at the moment of reconnect,
nothing on air changes. The cost lands only on the next explicit operator
take: the re-ADD branch issues `CG ADD` onto the item's **own** layer —
stage-replacing its own producer with the same template and the
reconciler-merged fields (CasparCG ADD semantics; and no adopt-CLEAR
re-fires since `#adopted` is kept) — then `CG PLAY`. The operator asked for
a take; a take that re-renders the graphic from scratch is the _meaning_ of
take. One extra ADD of wire traffic, no cross-layer effect, no badge
deviation (ADD ack on a non-intent seq; PLAY settles the take as always;
OSC re-confirms on-air). Compare the alternative miss: skipping the clear
on "maybe-just-a-blip" reconnects would re-open B-054 whenever the blip was
actually a fast restart — indistinguishable from the bridge's seat. We take
the provably-safe extra ADD.

## 4. After the clear — the heal

Next `take()` (`:462`): `#loaded` misses → unknown-template guard (`:467`,
unchanged) → `#sendAdd` re-issues `CG ADD` with the served URL and merged
fields (`:471-477`, re-populating `#loaded` on ack, `:1035`) → `CG PLAY`
(`:484`). On the restarted-empty server the layer renders again; the badge
follows the same path as every B-039 re-ADD take (settle on PLAY ack, OSC
confirms on-air). A field `update()` issued between restart and take is not
lost: the re-ADD sends the reconciler's merged fields.

## 5. Mock fidelity + test plan

The B-041 lesson: model the real restarted-empty server, not our assumption.

- **Restart** = `mock.stop()` + `createMock()` on the **same** AMCP port
  (listener fully closes and releases the port,
  `tools/amcp-mock/src/server.ts:54-65`; same-port precedent
  `packages/caspar-client/tests/server-session.test.ts:71-78`) and the same
  OSC destination port. Layer state is per-instance
  (`tools/amcp-mock/src/mock.ts:33`, closure-local `LayerRegistry`) so the
  new instance is genuinely EMPTY — like real CasparCG.
- **Blip** = `mock.closeAllAmcpConnections()` (TCP reset, listener up,
  layer state preserved — `mock.ts:151-153`, `server.ts:47-52`).
- The mock's `CG PLAY` models the blind ack (`handlers.ts:192-203`): 202
  always, renders only onto a live `html` producer — so the pre-fix repro
  _observably fails_ (`onAir` stays false, no re-ADD in the wire trace).
- B-064 contention lesson: settle CG ADD resolutions
  (`waitForCgAddResolution`) before stopping a mock (never sever an
  in-flight template GET), keep waits as polled `waitFor`s with generous
  timeouts, and run the suite both isolated and under the full parallel
  `pnpm test` before declaring green.

Tests (all in `tools/caspar-bridge` unless noted):

1. **B-054 repro (fails pre-fix):** single-server config; load + take on
   air; restart mock (same ports); wait healthy; take → the new server's
   wire trace shows `CG ADD` then `CG PLAY`, producer `html`, `onAir` true —
   and **no** `CLEAR` (pins `#adopted` retained + harmless).
2. **Transient blip:** same server, `closeAllAmcpConnections()`; after
   reconnect the bridge has sent nothing but handshake (`VERSION`/`INFO`);
   the next take re-ADDs onto the live layer and renders (the designed
   harmless extra ADD).
3. **Backup-only restart (wholesale rule):** two mocks, A primary + B
   backup, item on air on both; restart B only; after B is healthy again a
   take re-ADDs on **both** (B healed — producer recreated; A benignly
   stage-replaced, still on air).
4. **Survives setConfig + failover; disposes cleanly:** after a `setConfig`
   re-point, a restart of the _new_ server still heals the next take (the
   subscription rides `#wireAdapter`'s re-run); after a manual `failover()`,
   a restart still heals (no rewiring needed); after `runtime.stop()`, a
   mock restart attracts no zombie reconnect (`amcpClientCount` stays 0).
5. **OSC-degrade recovery does not clear (caspar-client unit,
   trigger-precision pin):** degraded→healthy recovery emits `'state-change'`
   only, never `'healthy'` (`server-session.ts:313-317` vs `:221`) — the
   event our fix subscribes to cannot fire on an OSC blip.

No new Playwright E2E: the changed behavior is bridge-internal verb choice
on an AMCP reconnect — not drivable from the browser (an E2E cannot restart
CasparCG), and the user-facing UI surface is unchanged. The existing E2E
suite runs as part of the gate.

**Optional live smoke (not a gate):** live CasparCG — import, Load, Take on
air; restart CasparCG (not the bridge, not the page); wait for the session
to reconnect healthy; Take again → fresh `CG ADD` in the caspar log, then
`PLAY`, then render.

## 6. Spec placement — held-pair collision avoidance

The held `reconnect-reconciliation` delta owns `## MODIFIED` on the
requirement _"Playout verbs are chosen from producer state (prescriptive)"_
(and `fix-amcp-escaping-v2` owns the AMCP-seam + template-resolution
requirements). This change's delta is therefore authored as an **ADDED
requirement** — _producer-existence bookkeeping is invalidated when a
session completes a reconnect_ — which is also the honest structure: the
verb-choice rule itself is unchanged; what is new is the invalidation rule
for the bookkeeping that feeds it. Archive ordering stays clean of the held
pair.
