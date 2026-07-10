# Harden redundancy for single- and two-server operation (B-046 + B-047)

## Why

The bridge's default connection declares a backup CasparCG at
`127.0.0.1:5251/6251` that does not exist for the operator's actual setup (one
local server). Code reading during the B-044 investigation (PRD B-046, B-047)
predicted four consequences, all now confirmed against the code (full
file:line diagnosis in `design.md`):

- **Unbounded journal growth** — every `send()` appends to `InMemoryJournal`
  in all three strategies; `prune()` has zero production callers. An explicit
  memory risk for a long-running bridge process.
- **Spurious split-brain/replay churn** — on a dead backup every mirror-sync
  send records a divergence (`backupCode: -1`); every 3rd divergence in 30 s
  emits `split-brain-persistent` and replays the ENTIRE ok-journal to the dead
  backup's queue (every enqueue rejects, swallowed). Event noise is quadratic
  in sends.
- **Health churn** — the phantom B session reconnect-loops forever (~4 s
  cycles at the backoff cap), publishing ~2 unchanged `healthChanged` frames
  per cycle to every WebSocket client, indefinitely.
- **`whenServerHealthy()` footgun** — requires BOTH sessions healthy, so it
  can never resolve on the default config.

B-047 (folded in): the failover trigger listener is bound once to the INITIAL
primary; the comment claiming it is "re-bound in failover-complete" describes
code that does not exist. After a failover A→B the auto triggers still watch
A — B's death cannot trigger a failover, and worse, a dead reconnect-looping A
keeps firing the trigger and flips primary BACK onto dead A.

## What Changes

Three owner-approved decisions (rationale + tradeoffs in `design.md`):

1. **Declared single-server mode** — `servers.B` becomes OPTIONAL in
   `ConnectionConfigSchema` (`ConnectionHealth.backup` optional to match);
   `defaultConnection()` is A-only; the CLI builds B only from explicit
   `--backup-host`/`--backup-amcp-port`/`--backup-osc-port` flags; with no B
   the `RedundancyAdapter` sends primary-only under every strategy, refuses
   `failover()`, and never engages the divergence/split-brain/replay
   machinery. Only declared intent distinguishes "no backup" (quiet) from
   "backup down" (alarm).
2. **Self-bounding `InMemoryJournal`** — `maxEntries` (500) + `retentionMs`
   (300 000), constructor-tunable, enforced on append (no timers). Retention
   is 10× the divergence window, so every entry a legitimate corrective
   resend (a briefly-lagged LIVE backup) needs is retained; full-history
   cold-backup rebuild formally belongs to a persistent `CommandJournal`
   implementation (the in-memory one never truly provided it — a bridge
   restart already lost it).
3. **Liveness-gated divergence/replay** — a backup-unreachable send failure
   counts as divergence ONLY when `backupSession.state` is
   `healthy`/`degraded`; a rejected send to a
   disconnected/connecting/resyncing backup records nothing. A code-vs-code
   divergence ALWAYS counts (an answering backup is live by definition), so a
   genuinely diverged live backup still escalates and still gets the
   corrective resend. `triggerCorrectiveResend` and failover-time replay skip
   a dead target at fire time.

Plus: `whenServerHealthy()` = "all DECLARED servers healthy"; the B-047 fix
(one construction-time `state-change` handler on BOTH sessions that checks
`label === currentPrimary` at event time — no rebinding, no race, and the
dead-A ping-pong disappears); `emitHealth` dedupes against the last-emitted
aggregate (also fixing the primary's double-emit); soak-harness fidelity
(mutable fake-session state + `backup: 'live'|'absent'|'dead'|'diverging'`
modes, event/journal-size counters in `SoakReport`); the runtime StatusBar
renders a "no backup" state and disables manual failover under single-server.

## Capabilities

- `runtime-caspar-bridge` (MODIFIED — Requirement "Failover to backup per the
  redundancy strategy": optional declared backup, current-primary trigger
  binding, liveness-gated divergence/replay; ADDED — Requirement
  "Single-server operation is declared, quiet, and memory-bounded"). Neither
  requirement is owned by the held `fix-amcp-escaping-v2` /
  `reconnect-reconciliation` deltas (they own the AMCP seam, template
  resolution/retention/re-delivery, silent-downgrade, and playout-verbs
  requirements), so this change archives ordering-independent of that pair.

## Impact

- `packages/shared-ipc` (schema: optional `servers.B`, optional
  `ConnectionHealth.backup`), `packages/caspar-client` (journal, redundancy
  adapter, types, unit tests), `tools/caspar-bridge` (default config, CLI
  flags, `CasparRuntime` optional-B construction, integration tests),
  `tools/soak-runner` (harness modes, report counters, soak regressions),
  `apps/runtime` (StatusBar no-backup state + DOM test).
- Two-server redundancy stays correct: mirror-sync fan-out, real failover
  A→B, split-brain detection + corrective resend for a genuinely diverged
  LIVE backup, and the existing failover integration test all keep working —
  only assertions encoding the OLD noisy behavior are updated, preserving
  intent.
- Frozen (reference only): the AMCP escape rule, B-044 intent lifecycle,
  reconnect-reconciliation behavior, R-003, and what a backup-only ack means
  for adoption (B-056's territory).
- Validation is mock/soak-based (no hardware gate): the phantom-backup soak
  proves heap-delta-under-budget with zero split-brain/replay/divergence
  events and a capped journal.
