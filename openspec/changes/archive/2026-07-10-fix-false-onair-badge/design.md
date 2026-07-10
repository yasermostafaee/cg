# Design — fix-false-onair-badge (B-053)

Full diagnosis and design as approved by the operator (2026-07-10). The B-053
PRD entry (`docs/prd/bugs-runtime.md`) is the authoritative bug brief; every
claim below was re-verified against the code with file:line evidence, and the
chosen design was adversarially attacked through three lenses (B-044 lifecycle,
reconnect/failover, UI/e2e semantics) before approval.

## 1. Mechanism (confirmed, file:line)

What the operator sees vs what's true: on the first Load onto a fresh layer the
badge rests at **ON AIR** with `pending: false`, indefinitely — while nothing is
on program output (the item is loaded, not taken).

1. `load()` applies intent `loaded`, adopts the layer (CLEAR before slot/OSC
   interest binding), binds slot + interest, sends `CG ADD` with play-on-load
   `0` (`tools/caspar-bridge/src/caspar-runtime.ts:280-329`,
   `command-builder.ts:57`); the ADD's OK ack settles `ackedStatus='loaded'`.
2. Real CasparCG stage-loads AND stage-plays the html producer at `CG ADD`
   (server `cg_proxy.cpp` create_new branch); the template page stays hidden
   until its `play()` is invoked, but the layer's foreground producer flips
   `empty → html` and OSC reports it.
3. The report passes interest → rate-limit → change-tracker
   (`packages/caspar-client/src/osc/transport.ts:125-127`; a first observation
   always passes, `osc/change-tracker.ts:17-20`).
4. `Reconciler.applyOsc` mapped ANY non-empty producer to truth `'on-air'`
   (`reconciler/reconciler.ts:197` pre-fix) → published once with
   `pending:false` (`'loaded'` is a terminal intent, `reconciler.ts:454`, so
   no pending/divergence fires).
5. The merge ladder (truth-if-fresh via `truthTtlMs` 1000 ms, else acked, else
   intent — `reconciler.ts:409-421`) resolves at READ time; the ONLY
   `'item-changed'` emit site (`reconciler.ts:379`) is reached exclusively by
   events (intents, acks, OSC, B-044 expiry). Nothing anywhere observes TTL
   decay; the UI holds the last pushed value (`useStack.ts`). The badge sticks.
6. First-per-layer only: the change-tracker's per-`(kind,channel,layer)` memory
   lives for the transport lifetime (reset only at the post-reconnect resync,
   `session/server-session.ts:214`). `remove()` drops interest
   (`caspar-runtime.ts:410`) BEFORE its CLEAR (`:412`), and a cleared layer
   goes silent on real CasparCG — the tracker keeps `'html'` forever, so every
   later ADD's `html` report is suppressed as a repeat and later loads rest
   READY (from the ack).

Secondary operator harm: `StackRow.tsx:65,85,88,94` computes
`onAir = status === 'on-air' || 'playing'` — the false `on-air` DISABLES PLAY
and enables UPDATE/OUT on a merely-loaded item.

## 2. The crux — load-vs-play is NOT observable over OSC

Verified exhaustively against everything this repo receives and models:

- The pipeline maps exactly five addresses (`osc/event-mapper.ts`; ADR 0004,
  from a 315,626-event live capture): framerate, foreground/producer,
  foreground/file/path, foreground/paused, background/producer. No `/cg.*`
  address exists in CasparCG 2.3.x/2.5.
- `CG PLAY` causes no wire change: the producer is already `html` (the mock's
  re-emit of the identical value is tracker-suppressed — matching real
  CasparCG, where CG PLAY is queued JS into the CEF page, no stage change).
- `foreground/paused` is `false` in both states for CG producers (`CG ADD`
  stage-plays; only media `LOAD` pauses, a verb the bridge never issues).

A load-only producer is therefore wire-identical to a played one. **Play
evidence exists only on the app's intent/ack side** — which ADR 0004 already
prescribes ("AMCP acks are the source of truth for 'CG operation happened'").

## 3. The honest question — the badge is semantically WRONG, not "briefly true"

The app's ON AIR means "graphic visible on program output". At `CG ADD` the
producer is a CasparCG stage-level implementation detail (CEF page running,
hidden); the output shows nothing. The product's own artifacts agree: the PRD
names READY the correct post-Load rest state, the runtime-ui spec lists READY
as a settled state with no Load→ON AIR requirement, and `MockRuntime.load`
already rests `'loaded'`. So the mapping is the disease; stickiness is only the
symptom's persistence — the fix corrects the mapping rather than decaying a
lie.

## 4. Options considered

- **(a) OSC-observable play evidence — impossible** (§2).
- **(a′) intent-side play evidence, derived at read time — CHOSEN** (§5).
- **(b) re-publish on truth-TTL decay — rejected.** Leaves a 1 s false ON AIR
  flash on every first load (still a lie); adds timer lifecycle to a Reconciler
  with no dispose today (leak surface); in error windows it would actively
  resurrect stale acked values over the last physical observation. After (a′)
  the published truth equals the post-decay value in every normal flow, so (b)
  buys nothing visible.
- **(c) reset the change-tracker key when the bridge empties a layer —
  rejected for this change.** Alone it makes the bug uniform (every load
  falsely ON AIR). With (a′) it is a truth-coverage nicety, not needed for the
  badge (take/out are ack-confirmed), and its real-world benefit is untestable
  against the current mock without silent-clear fidelity work (§8). Defer
  toward C-011.

## 5. Chosen design (a′) — all inside the Reconciler

1. `ItemRecord.played: boolean` — `false` when a `load` intent creates the
   (fresh) record; set `true` by the `take` intent (at intent time, before the
   ack); NEVER reset by update/out/unconfirmed. Broadcast-safe: once taken, a
   surviving producer reads on-air — this never-reset rule is load-bearing in
   the backup-only-out reconnect case (a taken item whose out-CLEAR landed only
   on the backup re-observes `html` at the primary's resync and correctly reads
   on-air; a live graphic is never hidden).
2. `ItemRecord.lastProducer?: 'empty' | 'present'` replaces the pre-mapped
   `truthStatus`; `applyOsc` stores the raw observation + `lastOscAt`.
3. `freshTruth()` derives at read time: `'empty'` → `idle`; `'present'` →
   `played ? 'on-air' : 'loaded'`. Merge ladder, `truthConfirmsIntent`
   (truth `loaded` confirms intent `loaded` by equality), and the entire B-044
   settle/expiry/ack machinery untouched. No timers added.

Read-time derivation is what preserves the optimistic take: a Take within the
1 s window re-derives the still-fresh observation as `'on-air'`, instantly
confirming `'playing'` — exactly today's feel. And the value published at
observation time now equals the post-decay ladder value in every normal flow
(load: `loaded`==acked `loaded`; take: `on-air` renders ON AIR == acked
`playing` renders ON AIR; out: `idle`==`idle`), so the sticky-publish gap
closes with zero publish-machinery changes.

### Bridge parity fix (same change, one line)

`CasparRuntime.updateRequest` deferred a system update only when some item's
status was exactly `'on-air'` (`caspar-runtime.ts:514`) while `MockRuntime`
counts `'on-air' || 'playing'`. Post-fix `'on-air'` is rarer (fresh truth on
played items only), so the bridge gate is aligned to `'on-air' || 'playing'` —
strictly more conservative, restores bridge/mock parity. No spec requirement
governs this gate; parity note lives here.

## 6. B-044 / reconnect / R-003 non-interference

- The B-044 machinery (settle-on-ack, expiry→`unconfirmed`, late-ack rescue,
  stale-ack rejection, settle provenance, ack invalidation) operates purely on
  `intentStatus`/`ackedStatus`/`settle` and never touches truth derivation; no
  B-044 test calls `applyOsc`. The `settle` fallback and
  `truthConfirmsIntent` are unchanged.
- Reconnect/failover: verified equal-or-better across mirror/journal-replay
  strategies and the B-039 take-re-ADD path. Bonus fix: after an AMCP reconnect
  resync (tracker reset), a loaded-never-taken item's re-observed `html` now
  derives `loaded` (today it publishes a sticky false ON AIR).
- R-003 (staged Inspector edits) is untouched — the change is reconciler
  mapping + one bridge line.
- No existing test in the repo asserts `on-air` without a prior take (swept:
  caspar-client unit + integration, caspar-bridge integration, amcp-mock,
  runtime unit + e2e) — the suite passes unchanged by construction.

## 7. Verification (pre-implementation)

Adversarial panel (7 agents): mechanism re-derivation with emit-site
enumeration; full ripple sweep; OSC-crux check; spec-collision/ordering check;
three attack lenses. Result: no existing test breaks; one narrow residual
found and ACCEPTED (below); spec delta collides with nothing active (the stale
B-044 leftover dir was deleted as a hygiene commit).

## 8. Accepted residuals + documented divergences

- **Backup-only orphan window → B-056 (filed, NOT fixed here).** If the
  adopt-CLEAR and the ADD both land backup-only (primary AMCP briefly down in
  mirror-sync, no failover), `load()` proceeds and binds an UNADOPTED layer
  where a previous session's visible orphan may survive on the primary; on
  primary reconnect the orphan's `html` routes to the never-taken item →
  post-fix badge reads READY where pre-fix showed a (misattributed but
  attention-drawing) sticky ON AIR. Multi-fault window; pre-fix badge there is
  also a lie ("your item is on air" — foreign content is); the
  reconnect-reconciliation spec itself mandates "never shows on-air from the
  orphan's OSC before take". A load-bail mitigation touches redundancy
  fault-mode semantics → its own change (see B-056).
- **Error-masking fresh-truth window (pre-existing, unchanged).** A rejected
  take/load whose layer still carries a fresh observation shows the derived
  truth for ≤1 s and the badge sticks on it (nothing re-publishes on decay);
  the command failure is independently surfaced by the AsyncButton inline
  error + toast. Sibling of B-053's stickiness on the error path; out of scope.
- **Mock out()-path `'empty'`-emit divergence (documented, NOT fixed).** The
  mock emits a transition `'empty'` on CLEAR (`setLayer` immediate emit) and
  tick mode re-broadcasts erased layers forever, while real CasparCG erases the
  layer and goes silent. Harmless to the B-053 repro (remove() drops interest
  before its CLEAR, so the emit is dropped in both regimes), but bridge→mock
  the out() path receives an `idle` confirmation real CasparCG never sends — a
  fix must never depend on that event, and the B-053 regression test runs
  `disableOsc` transition-only mode, which reproduces the real
  first-observation-emits / later-suppressed asymmetry (tick mode masks it).

## 9. Test plan

- **Reconciler units (injected `options.now`)**: load+ack+OSC `html` →
  `loaded` published AND still `loaded` after the clock passes `truthTtlMs`
  with no further event; the published sequence never contains `on-air`;
  take-within-fresh-window → `on-air` immediately; resync re-observation for
  loaded (→`loaded`) vs playing (→`on-air`); `played` survives out (surviving
  producer after a taken item's out reads `on-air`); `empty` → `idle`
  unchanged; existing B-044 + merge-rule suites untouched.
- **Bridge integration (bridge→amcp-mock, `disableOsc` transition-only)**:
  replicate the PRD's 3-step repro capturing `stackChanged` sequences — first
  load on a fresh layer, remove + re-load (same layer), second fresh layer must
  ALL rest `loaded` with no `on-air` anywhere pre-take; then take → renders ON
  AIR (playing/on-air), out → idle.
- **StackRow jsdom gating test**: status `loaded` → PLAY enabled, UPDATE
  disabled, OUT disabled; status `on-air` → PLAY disabled, UPDATE enabled, OUT
  enabled.
- No new Playwright e2e: the behavior change lives behind the bridge
  (`WebSocketRuntime` path); the browser e2e suite drives `MockRuntime`, which
  already rests `loaded` after load — the scenario is only reachable
  bridge→mock, where the integration test lives. The full e2e suite still runs
  as part of the gate.
