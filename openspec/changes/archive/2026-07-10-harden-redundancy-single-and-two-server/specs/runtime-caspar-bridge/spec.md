# runtime-caspar-bridge (redundancy hardening — B-046 + B-047)

## MODIFIED Requirements

### Requirement: Failover to backup per the redundancy strategy

The bridge SHALL run one `ServerSession` per DECLARED server under the
`@cg/caspar-client` `RedundancyAdapter`: always A (primary), and B (backup)
only when the connection config declares it. Each session is built from its
own connection config (AMCP host/port + OSC bind).

WHEN a backup is declared and the active (primary) server fails — per the
redundancy strategy's triggers (primary-session disconnect/degraded, the
command-timeout budget, or a 5xx burst) — the adapter SHALL switch to the
backup, and subsequent commands SHALL continue to the new primary. The
operator SHALL also be able to switch manually via the `connections.failover`
channel (`adapter.failover('manual')`). WHEN no backup is declared, manual
failover SHALL be refused (`ok: false`) and auto-failover SHALL never fire.

The failover triggers SHALL key off the CURRENT primary at event time: the
adapter binds its state-change handling to both sessions at construction and
evaluates `label === currentPrimary` when each event fires (no listener
rebinding). After a failover A→B, the death of B SHALL fire the auto trigger,
and state changes of the demoted A SHALL NOT.

Backup divergence accounting SHALL be gated on backup liveness: a
backup-unreachable send failure counts as a mirror divergence ONLY while the
backup session believes itself live (`healthy`/`degraded`); a rejected send
to a disconnected/connecting/resyncing backup records nothing. A divergence
between two answered ack codes SHALL always count. The corrective resend and
any failover-time journal replay SHALL skip a target session that is not
live at fire time. A genuinely diverged LIVE backup SHALL still escalate to
`split-brain-persistent` and receive the corrective resend.

`connections.health` SHALL reflect the **real** current primary, every
declared session's live state (no backup entry when none is declared), and
the last failover event. Aggregated health SHALL be published only when the
aggregate actually changed (no repeat publishes of an unchanged snapshot).
The Reconciler SHALL remain the source of truth across a switch: it consumes
OSC from the **current primary** (declared sessions receive mirrored commands
and OSC interest is registered on each), so the new primary's OSC re-confirms
state after failover.

The browser side and the `@cg/shared-ipc` wire SHALL remain unchanged, and
the bridge SHALL stay bound to `127.0.0.1` by default.

#### Scenario: Auto-failover on primary failure

- **WHEN** a backup is declared and the primary server fails (its session
  drops/degrades) **THEN** the `RedundancyAdapter` switches to the backup per
  the configured strategy, commands continue to the new primary, and
  `connections.health` reports the new current primary plus a `lastFailover`
  event

#### Scenario: Manual failover via the channel

- **WHEN** the operator invokes `connections.failover` with a backup declared
  **THEN** the adapter performs a real `manual` switch to the backup, and
  `connections.health` reflects the new current primary with a `lastFailover`
  of reason `manual`
- **WHEN** the operator invokes `connections.failover` with NO backup
  declared **THEN** the call is refused (`ok: false`) and the primary is
  unchanged

#### Scenario: Stack state survives the switch

- **WHEN** failover completes **THEN** the Reconciler keeps the stack state
  and re-confirms it from the new primary's OSC (no reset to a mock), with
  the bridge still loopback-bound and the browser/wire unchanged

#### Scenario: Triggers follow the current primary (B-047)

- **WHEN** a failover A→B has completed and B subsequently dies **THEN** the
  auto-failover trigger fires (keyed off B, the current primary)
- **AND WHEN** the demoted A's reconnect loop keeps changing state **THEN**
  no auto-failover fires off A's transitions (primary never ping-pongs back
  onto a dead server)

#### Scenario: Dead backup is quiet; live diverged backup is not

- **WHEN** a declared backup is down (session not live) and the operator
  drives playout **THEN** sends succeed on the primary with NO
  `mirror-divergence`, NO `split-brain-persistent`, and NO corrective resend
  (the backup's down state remains visible via health)
- **WHEN** a declared backup is LIVE and its ack codes genuinely diverge past
  the budget **THEN** `split-brain-persistent` fires and the corrective
  resend replays the retained ok-journal entries to the backup

## ADDED Requirements

### Requirement: Single-server operation is declared, quiet, and memory-bounded

The connection config SHALL support declaring a single server: `servers.B` is
optional (`{ A: required, B?: optional }`), and `ConnectionHealth.backup` is
correspondingly optional. The bridge's default connection SHALL be
single-server (A on `127.0.0.1:5250/6250`); the CLI SHALL construct a backup
only from explicit `--backup-host` / `--backup-amcp-port` / `--backup-osc-port`
flags. Declared intent — not runtime detection — distinguishes "no backup"
(quiet) from "backup down" (alarmed via health).

Under a single-server config the redundancy machinery SHALL be inert: no
backup session is constructed (no reconnect loop, no health churn), `send()`
targets the primary only under every strategy, and no divergence, split-brain,
or corrective-resend event can be emitted. `whenServerHealthy()` SHALL resolve
when all DECLARED servers are healthy (single-server: A alone; two-server:
both). The operator UI SHALL render the absence of a backup as an explicit
"no backup" state and disable manual failover.

The command journal SHALL be memory-bounded in every configuration: the
in-memory `CommandJournal` enforces a maximum entry count and a resolved-entry
retention age on append (defaults 500 entries / 300 000 ms, tunable). The
retention window SHALL be at least 10× the divergence window so a corrective
resend for a briefly-lagged live backup never needs an evicted entry;
full-history cold-backup rebuild is explicitly the province of a persistent
`CommandJournal` implementation.

#### Scenario: Default single-server boot is quiet

- **WHEN** the bridge boots with the default (A-only) connection against one
  CasparCG **THEN** `whenServerHealthy()` resolves on A alone, playout works,
  `connections.health` carries no backup entry, and no divergence /
  split-brain / corrective-resend events are emitted over a sustained run

#### Scenario: Journal stays bounded

- **WHEN** more commands are sent than the journal's entry cap (in any
  configuration, including a healthy two-server pair) **THEN** the journal
  holds at most the cap and heap growth over a sustained soak stays under the
  leak budget

#### Scenario: Bounded journal still serves the legitimate replay

- **WHEN** a LIVE backup briefly lags and diverges past the budget within the
  divergence window **THEN** the corrective resend replays every ok entry the
  backup missed (retention ≥ 10× the divergence window guarantees they are
  retained)

#### Scenario: Operator UI shows the single-server state

- **WHEN** the runtime UI receives health with no backup **THEN** the status
  bar renders an explicit "no backup" indication (not a phantom backup card)
  and the manual failover control is disabled
