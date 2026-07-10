# Design — harden redundancy for single- and two-server operation

## Part A diagnosis (confirmed against code, 2026-07-10)

Every B-046/B-047 consequence was confirmed with file:line before design.

### 1. Journal grows without bound (all strategies, healthy or not)

Every send appends: mirror-sync `redundancy-adapter.ts:215`, mirror-async
`:249`, journal-replay `:279`. `InMemoryJournal.append` pushes onto a plain
array (`journal.ts:63-67`). `prune()` exists (`journal.ts:84-87`) but its only
caller in the entire repo is the journal unit test. Nothing bounds the journal
in any configuration — a healthy two-server pair leaks exactly as fast as a
phantom-backup one. Confirmed memory risk for a long-running bridge.

### 2. Every send on a dead backup records a divergence

Mirror-sync fans out to both queues and awaits both
(`redundancy-adapter.ts:218-221`). A dead B's enqueue rejects immediately —
`AmcpTransport.send` throws `socket not writable` when unconnected
(`transport.ts:93-97`) — so the primary-fulfilled/backup-rejected arm calls
`reportDivergence(seq, code, -1)` on EVERY send (`:230-236`; the comment says
"log + degrade backup health" but the code counts toward split-brain).
Mirror-async's fire-and-forget rejection handler does the same (`:263-265`).

### 3. Every 3rd divergence in 30 s → `split-brain-persistent` + full-journal replay

`reportDivergence` windows timestamps (defaults 3-in-30 000 ms,
`redundancy-adapter.ts:111-112`), emits `split-brain-persistent`, resets the
window, and triggers the corrective resend (`:337-351`).
`triggerCorrectiveResend` replays the ENTIRE ok-journal —
`journal.all().filter(outcome === 'ok')` — to the dead backup's queue,
emitting one `corrective-resend` event per entry, each enqueue rejecting into
a swallowed catch (`:360-377`). The journal grows by one per send and a full
replay fires every ~3rd send → cumulative event noise is O(n²) in sends.

### 4. Health churn: ~2 unchanged publishes per backoff cycle, forever

Dead B's session loop per cycle: `transitionTo('connecting')`
(`server-session.ts:207`) → connect fails → `transitionTo('disconnected',
'cycle teardown')` (`:239`) → backoff (cap 4 s). Both transitions hit the
adapter's per-session `state-change → emitHealth()` listeners
(`redundancy-adapter.ts:407-408`) → `CasparRuntime` re-emits `healthChanged`
(`caspar-runtime.ts:189`) → published to every WS client (`bridge.ts:249`).
≈1 800 publishes/hour of unchanged information. Bonus defect: the initial
primary's state changes fire TWO `health` events each (the `:401` trigger
listener also calls `emitHealth`, plus the `:407` per-session listener).

### 5. `whenServerHealthy()` requires BOTH sessions

`caspar-runtime.ts:249-273` — `bothHealthy` needs A AND B `'healthy'`; on the
default config it can only ever reject on timeout. Used by every bridge
integration test; a footgun for any future caller (CLI healthcheck, panel).

### Phantom-B default confirmed

`bridge.ts:92-101` `defaultConnection()` hardcodes B at `127.0.0.1:5251/6251`;
the CLI builds B unconditionally as A's ports +1
(`bin/caspar-bridge.mjs:26-30`); the schema REQUIRES B
(`shared-ipc/src/channels/connections.ts:58`). Single-server literally cannot
be declared today.

### B-047 confirmed — and it is worse than "inert"

The failover-trigger listener binds once to the INITIAL primary
(`redundancy-adapter.ts:401`); the comment at `:402-406` claims "We re-bind in
failover-complete" — no such code exists (the only `failover-complete` in the
adapter is the emit at `:175`). After A→B failover:

- B's death CANNOT trigger auto-failover (nothing watches B), and
- A's ongoing reconnect-loop transitions STILL fire `maybeFailover`, flipping
  primary BACK onto dead A (ping-pong onto a corpse).

### Soak-fidelity gap (the B-041 lesson, in code)

`tools/soak-runner/src/harness.ts:130-137` — `makeFakeSession` hardcodes
`state: () => 'healthy'` and the harness always boots two live mocks. The
soak could not represent a dead or absent backup at all: exactly the
configuration the operator actually runs, and exactly the distinction
(dead-backup vs live-diverged-backup) the liveness gating rides on.

## Decisions (owner-approved 2026-07-10)

### Decision 1 — single-server quiet: DECLARED mode (not auto-detect)

`servers: { A: required, B?: optional }` in `ConnectionConfigSchema`;
`ConnectionHealth.backup` optional to match. `defaultConnection()` becomes
A-only; the CLI builds B only when explicit `--backup-host` /
`--backup-amcp-port` / `--backup-osc-port` flags are given. `CasparRuntime`
constructs one session when B is absent. `RedundancyAdapter` accepts
`sessions: { A, B? }`; with no B: `send()` short-circuits to primary-only
under every strategy, `failover()` refuses (`ok: false`), the
divergence/split-brain/replay machinery never engages, health snapshots carry
no backup.

Why declared beats auto-detect: only declared intent can distinguish
"no backup exists" (be quiet) from "my backup is down" (ALARM). Auto-quiescing
on "B has never connected" necessarily silences a real backup that is offline
at boot — the one moment an operator with genuine redundancy most needs the
warning. Declared mode is also actually quiet (no B session object → no
reconnect loop, no socket churn — not suppressed machinery, absent machinery)
and is the config shape the future server-settings panel edits: a primary
block plus an optional backup block, no mode enum; "remove backup" = delete
the B key. Tradeoff accepted: schema + CLI + adapter + health-UI ripple.

### Decision 2 — journal bounding: self-bounding ring (count cap + resolved-age retention)

`InMemoryJournal` gains `{ maxEntries = 500, retentionMs = 300_000 }`,
enforced ON APPEND (no timers): first drop RESOLVED entries older than
`retentionMs`, then if still over `maxEntries` evict oldest. Bounded in every
regime at ≤ `maxEntries` entries (≈100 KB worst case).

Replay-correctness reconciliation, stated precisely: the corrective resend
exists to converge a BRIEFLY-LAGGED LIVE backup — its trigger is by
construction a divergence burst inside `divergenceWindowMs` (30 s). Retention
is 10× that window: any command a briefly-lagged backup missed is younger
than `retentionMs` and therefore retained, unless sustained throughput
exceeds `maxEntries/retentionMs` (>1.6 commands/s for 5 straight minutes — an
order of magnitude above real CG playout pace, and `maxEntries` is tunable
for stations that differ). So no entry a LEGITIMATE corrective resend needs
is ever dropped.

What bounding deliberately gives up — the journal-replay-strategy ripple,
stated honestly: "rebuild a cold backup on failover from full history" now
formally requires a persistent `CommandJournal` implementation. The in-memory
journal never truly provided that property (a bridge restart loses it), and
Phase 5 §7.7 already assigns durable journaling to a WAL'd SQLite
implementation (which may retain 7 days). The shipped default (mirror-sync)
does not rely on the journal for failover at all — the backup received every
command live; mirror-async lag is send-latency-scale, well inside retention.
With the in-memory journal, journal-replay failover catch-up replays the
retained tail. This is documented in the journal's contract docs.

### Decision 3 — liveness-gated divergence/replay, from `backupSession.state`

"Live" comes from session state. The rule:

- A backup-UNREACHABLE failure (today's `-1`) counts as divergence ONLY when
  `backupSession.state ∈ {'healthy', 'degraded'}` — degraded means AMCP is
  still up (OSC-silent), so a send failure there is real evidence. A rejected
  send to a `disconnected`/`connecting`/`handshaking`/`resyncing` backup is
  EXPECTED and records nothing: no `mirror-divergence`, no window entry, no
  `split-brain-persistent`, no replay. Session-level health (visible to the
  operator) is the correct signal for a down backup, not per-send noise.
- A code-vs-code divergence (backup actually answered, differently) ALWAYS
  counts — an answering backup is live by definition. A genuinely diverged
  live backup still escalates and still gets the corrective resend, unchanged.
- `triggerCorrectiveResend` and the failover-time `replayJournalTo`
  additionally check target liveness at fire time and skip a dead target
  (each entry was already best-effort; this stops the pointless full-journal
  loop).

Failover interaction: none adverse. Failover triggers come from PRIMARY
signals (session state, timeout budget, 5xx window) — divergence never fed
them, so gating it cannot suppress a legitimate failover. Failover TO a
currently-dead backup remains permitted (last-resort semantics unchanged —
B-056 territory untouched). Roles are read at fire time, so the gate follows
the current primary across failovers.

### `whenServerHealthy()` — "all DECLARED servers healthy"

Single-server: A healthy resolves it. Two-server: both, as today — mirror
fan-out genuinely needs both, and every existing integration test keeps its
meaning. The footgun disappears because the default config is single-server.

### B-047 — no rebinding at all

Rebinding in `failover-complete` (what the stale comment promised) recreates
the bug class with a race window (failover-requested → complete). Instead:
ONE `state-change` handler bound to BOTH sessions at construction; the
handler checks `label === this.currentPrimary` AT EVENT TIME before running
trigger logic, then emits deduped health. Current-primary evaluation is
dynamic, so failover needs no listener surgery, the trigger always watches
the actual primary, and the dead-A ping-pong disappears (A ≠ primary → no
trigger). Regression test (PRD-specified): fail over A→B, then kill B,
assert the auto trigger fires — fails on pre-change code, passes with this.

### Health dedupe

`emitHealth` compares the aggregate snapshot (primary label + both states)
against the last one actually emitted and skips exact repeats; the merged
per-session handler also removes the primary's double-emit. A declared-but-
down backup's reconnect loop still truthfully reports its distinct
transitions (connecting ↔ disconnected), but unchanged aggregates are never
re-published.

## Soak/mock fidelity plan

The harness's fake sessions gain mutable `state` + `state-change` emission
(modeling the real dead-vs-live distinction, not our assumption). `SoakOptions`
gains `backup: 'live' | 'absent' | 'dead' | 'diverging'` (default `'live'`):

- `absent` — declared single-server: no B mock, no B session. Assert heap
  delta under `leakBudgetMb`, ZERO divergence/split-brain/replay events,
  journal ≤ cap. (The B-046 memory-risk proof.)
- `dead` — B declared but never up: fake session state `'disconnected'`,
  enqueues reject like a real disconnected transport. Assert the same quiet.
- `diverging` — B live but its mock 404s PLAY: assert `split-brain-persistent`
  AND `corrective-resend` still fire.
- `live` — today's behavior; the existing two-server + scheduled-failover
  soak stays green.

`SoakReport` gains event counters (`mirrorDivergence`, `splitBrainPersistent`,
`correctiveResend`, `healthEvents`) + `journalEndSize` so all of the above is
assertable. B-047's double-failover regression lives in the adapter unit
tests (deterministic two-step sequence — a soak is the wrong instrument).

## Test matrix

- Unit (`caspar-client`, injected clock where the 30 s window matters):
  dead/absent backup → no divergence-driven replay, no split-brain-persistent,
  journal bounded (asserted after > maxEntries sends); genuinely diverged
  LIVE backup → split-brain + corrective resend fire and replay the RIGHT
  entries (asserted by line identity); journal retention/cap semantics;
  adapter with no B (primary-only send, failover refused, single health);
  B-047 double-failover (fails on pre-change code).
- Integration (`caspar-bridge`): existing failover suite green unchanged; new
  single-server boot (A-only config, one mock): `whenServerHealthy` resolves,
  load/take work, no backup in health.
- Soak (`soak-runner`): the four backup modes above.
- DOM (`apps/runtime`): StatusBar renders the no-backup state and disables
  manual failover. (The Playwright harness deliberately pins a dead bridge
  URL and drives the two-server MockRuntime — the single-server state is only
  reachable through a real bridge connection, so jsdom is the honest
  instrument; the existing e2e suite still runs in the gate.)

## Out of scope (frozen)

AMCP escape rule, B-044 intent lifecycle, reconnect-reconciliation behavior,
R-003, backup-only-ack adoption semantics (B-056).
