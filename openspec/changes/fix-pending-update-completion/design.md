# Design — pending-intent completion (B-044)

## Diagnosis (evidence-backed; Part A of the investigation)

### The mechanism, hop by hop

1. `stack.update` → bridge `CasparRuntime.update()`
   (`tools/caspar-bridge/src/caspar-runtime.ts:316`) → `Reconciler.applyIntent`
   sets `intentStatus='updating'`
   (`packages/caspar-client/src/reconciler/reconciler.ts:245`).
2. The `202` ack resolves promptly (mirror-sync returns the primary's ack even
   with the phantom backup B dead — the backup enqueue rejects in a microtask) →
   `applyAck` sets `ackedStatus = identity(intent) = 'updating'`
   (`reconciler.ts:360-364`). That **confirms** the intent (`acked === intent`,
   `reconciler.ts:350`) — `pending` clears — while the reconciled ladder
   (fresh truth → acked → intent, `reconciler.ts:325-337`) rests the DISPLAYED
   status on `updating`. Nothing ever transitions it again.
3. The only override — OSC truth `on-air` while < 1 s old
   (`truthTtlMs`, `reconciler.ts:379`) — cannot arrive: a `CG UPDATE` causes no
   producer transition, and the `OscChangeTracker` suppresses every repeated
   identical value (`packages/caspar-client/src/osc/change-tracker.ts:18`).
   Framerate is value-tracked too, so in steady state **zero** OscEvents reach
   the reconciler; the "fresh truth" tier exists only ~1 s after a real
   transition.
4. No timeout exists on any tier: the reconciler's `item-divergent` event has no
   IPC channel and no consumer; the UI renders `status` verbatim
   (`StackRow.tsx:74` → `airStateVisual`, which ignores `pending` for
   `updating`); the WS layer's 8 s RPC timeout cannot age out a pushed status.

### Reproduction (bridge → amcp-mock, OSC heartbeat at 40 Hz)

| Step   | Fresh truth (≤1 s) | Resting state after truth decays       | Badge          |
| ------ | ------------------ | -------------------------------------- | -------------- |
| take   | `on-air`           | acked `playing`, pending=false         | "ON AIR" (ok)  |
| update | — (no transition)  | **`updating`, pending=false, forever** | stuck UPDATING |
| out    | `idle`             | **acked `exiting`, pending=false**     | stuck EXIT     |

`out` has the same disease — unnoticed live because "EXIT" reads benign.

### Live confirmation (operator-assisted OSC probe, 2026-07-07, CasparCG 2.5.0 `69e8ad5`)

Temporary datagram counters in the bridge (removed immediately after):

- OSC **does** flow on this box: ~50 datagrams/s to `127.0.0.1:6250`,
  `parseFail=0` — 2.5's address format parses cleanly against the 2.3-shaped
  pipeline (framerate / producer / file / paused all decoded). Phantom B: 0.
- Post-filter events over ~15 min: **10 batches, all transitions** (producer
  `empty↔html`, file-path changes, initial bursts). Suppression is total.
- **No producer event accompanies an Update** — nothing exists on the wire for
  the reconciler to observe. The stuck badge is the acked-`updating` dead end.

### Why no test caught it

- The browser `MockRuntime` hard-codes the missing transition (`#settle`, a
  160 ms timer to `on-air`, `MockRuntime.ts:252-259`) — e2e is structurally
  green on exactly the divergent behavior.
- No bridge→mock test asserts post-update status; `amcp-mock` itself is
  faithful here (immediate `202`, no OSC on `CG UPDATE` — handlers.ts:155-160),
  so the fix needs **no mock change** (the B-041 lesson holds: the mock must
  mirror the real server, and it already does on this path).

## Completion semantics (the contract; approved with refinements)

**For `CG UPDATE`, the AMCP ack is the best available completion signal — but a
`202` does NOT prove the template applied the value.** B-041 is the standing
counterexample: `202 CG OK` + a template-side V8 `SyntaxError` was exactly its
failure mode. The honest reading, which this design adopts:

- ack (`202`) = **"accepted by CasparCG"** — the command was received and
  dispatched to the producer;
- the settled status after an OK ack is the item's **underlying on-air state**
  (`playing`) — precisely the semantics Take's ack already has today
  (`intentToAckedStatus('playing') → 'playing'`, rendered "ON AIR");
- the deeper "did the template actually apply it" verification is the separate
  Take/on-air honesty question and is **explicitly out of scope here**.

**For `out`, the bridge emits exactly one verb: `CLEAR <ch>-<layer>`**
(`command-builder.ts:71-73`; no stop-then-clear sequence). The OK ack of that
single `CLEAR` completes the intent to `idle` — consistent with B-039's model
("CLEAR destroys the producer"), and OSC truth `idle` corroborates it for ~1 s
when it arrives. The playout-cycle integration tests keep proving the verb
sequence.

## Implementation

### Schema (`@cg/shared-schema`, schema-first)

`StackItemStatusSchema` gains `'unconfirmed'` — an explicit resting state for
"the bridge sent the command and no ack arrived within the bound; the on-air
result is unknown". Never a silent revert, never a fake success.

### Reconciler (`@cg/caspar-client`)

- `ItemRecord.settle?: { to: StackItemStatus; evidenced: boolean }` — recorded
  by `applyIntent`. The `evidenced` flag carries the target's **provenance**
  (added after the adversarial review confirmed two inheritance holes):
  - `update` from a RESTING status captures that observed status
    (`evidenced: true`);
  - `update` mid-intent (`updating`/`exiting`/`unconfirmed`) inherits only an
    **evidenced** prior target (back-to-back updates keep the true underlying
    state); otherwise it falls back to `{ to: 'playing', evidenced: false }`.
    An out's unevidenced `idle` TARGET therefore never leaks into an update's
    completion — the review's two confirmed scenarios: an update racing an
    in-flight out would have parked a permanent `exiting`, and an update after
    an EXPIRED out would have rested `idle` while the graphic was possibly
    still live (the dangerous error direction). `playing` is the
    broadcast-safe fallback: a false ON AIR badge prompts the operator to
    check the output; a false IDLE hides a live graphic.
  - `out`: `{ to: 'idle', evidenced: false }` — the out's target, not an
    observation (the CLEAR may never execute).
- `applyAck(seq, ok)`:
  - **Stale-ack guard**: an ack whose `seq !== rec.lastIntentSeq` no longer
    mutates state (a later intent owns the record; with AMCP pipelining an
    older update's ack must not settle a newer one).
  - OK ack with a `settleTo` pending → `intentStatus = ackedStatus = settleTo`;
    clear `settleTo`/`errorCode`. This also rescues a **late ack after
    expiry** (`unconfirmed` → settled): honest, because the ack did arrive.
  - NAK → existing behavior (`ackedStatus='error'` + `errorCode`); `settleTo`
    cleared.
  - Other intents (load/take) keep the existing identity-ack behavior.
- `expireIntent(seq)`: if `seq === rec.lastIntentSeq` and the intent is still
  in flight (`intentStatus` is `updating`/`exiting`) → `intentStatus =
'unconfirmed'`, `ackedStatus` cleared (so the reconcile ladder cannot fall
  back to a stale acked value), `errorCode='unconfirmed'`, emit. `unconfirmed`
  joins `isTerminalStatus` (it is an explicit resting state — `pending=false`,
  no forever-spinner); any subsequent operator intent overwrites it.
  `settleTo` is deliberately KEPT through expiry so a late OK ack can still
  settle the item honestly.
- **A new intent invalidates the previous command's ack**: `take`/`update`/
  `out` now `delete rec.ackedStatus` when applied. Without this the reconcile
  ladder (truth → acked → intent) displays the STALE acked value mid-flight —
  e.g. "ON AIR" (acked `playing`) while an update is in flight, or "READY"
  (acked `loaded`) during a take. Clearing it makes transient intents display
  as transient (`pending=true`), which also activates the pre-existing
  "TAKING" visual (`playing`+pending) exactly as designed.

### Bridge (`tools/caspar-bridge`)

`INTENT_TIMEOUT_MS = 5000`, injectable per-instance via the constructor's
`options.intentTimeoutMs` (tests exercise the REAL expiry wiring with a short
bound — the review proved a dead-server test lands on the pre-existing
send-failure `error` path without ever reaching the timer). `update()`/`out()`
arm a per-seq timer before sending and clear it when the ack lands; on fire it
calls `reconciler.expireIntent(seq)` (published through the existing coalesced
`stackChanged`). Timers are tracked and cleared in `stop()` and `unref`'d.

### UI (`apps/runtime`)

One minimal `airStateVisual` branch: `unconfirmed` → pending-amber, `?` icon,
label "UNCONFIRMED". (Badge restyling wholesale is the queued UI-polish item.)

### Browser MockRuntime alignment

The mock's lifecycle is re-stated on the real contract: an update flips to a
**transient** `updating` and settles to the underlying on-air state on the ack
of its own (simulated) round-trip, within a small bound — same contract, mock
timing. Same for out → `idle`. No hard-coded divergence from the bridge path.

## Tests

- **Reconciler unit** (injected `now()`): OK-ack settles update→`playing` /
  out→`idle`; back-to-back updates settle only on the latest seq's ack; a stale
  ack is ignored; NAK → `error`; `expireIntent` → `unconfirmed` (acked cleared,
  pending=false); late OK ack rescues `unconfirmed`; take/load ack behavior
  unchanged.
- **Bridge→mock integration**, both OSC regimes (`oscHz: 40` AND
  `disableOsc: true` — the heartbeat regime alone would mask nothing here, but
  both are pinned so neither regime can regress): after update the status
  settles (`playing`/`on-air`) within the bound and never rests on `updating`;
  after out it rests on `idle`, never `exiting`; with the mock stopped
  mid-session an update lands in a bounded explicit failure state
  (`error`/`unconfirmed`, via the send-failure path), never a stuck
  `updating`; and — exercising the REAL expiry wiring — a `setHandler`-swallowed
  `CG UPDATE` (socket up, command accepted, no ack ever) expires to
  `unconfirmed` within an injected short bound, before the command queue's own
  timeout can NAK.
- **E2E** (`apps/runtime`, MockRuntime): after take + an Inspector field commit,
  the badge returns to "ON AIR" within the bound (transient "UPDATING"
  allowed), mapping the ADDED requirement's scenarios.

## Out of scope

- Take/on-air ack-honesty (separate item), R-003 staged edits, the AMCP escape
  rule (frozen), amcp-mock changes (already faithful), the four bridge findings
  from the investigation (separate docs-only filing after wrap-up).
