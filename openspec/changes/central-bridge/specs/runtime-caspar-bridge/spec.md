## ADDED Requirements

### Requirement: The bridge SHALL get OSC by OSC SUBSCRIBE on its own port, never 6250

The bridge SHALL send `OSC SUBSCRIBE <port>` on every AMCP connection it opens, inside the handshake (after
`VERSION` and `INFO`, before the resync drain), where `<port>` is the UDP port that server's session bound;
the subscription ends with its connection, so it SHALL be sent again after every reconnect. Server A's OSC
port SHALL be the bridge's configured OSC port (default `6251`) and server B's that port plus one. The
bridge SHALL NOT bind UDP port `6250` on any address: the connection schema, the CLI and the service
configuration SHALL refuse it with a sentence that says it belongs to the Playout's engine. A core that
refuses the subscribe SHALL be reported in one log line and the session SHALL go on. OSC for a channel the
station does not serve SHALL be dropped at the transport, before any tap or consumer; while no channel is
declared every channel is served.

#### Scenario: The core's default port is held by someone else

- **WHEN** another process holds the core's default OSC port and the bridge starts against the mock
- **THEN** the bridge binds its own port, sends `OSC SUBSCRIBE <that port>` after `VERSION` and `INFO`, and
  hears the core — control: the holder of the default port still receives the core's stream

#### Scenario: The subscribe is sent again after a reconnect

- **WHEN** the core drops the bridge's connection and the bridge reconnects
- **THEN** a second `OSC SUBSCRIBE` is sent on the new connection and OSC arrives again

#### Scenario: Another channel's OSC is dropped

- **WHEN** the core reports a producer on a channel the station does not declare
- **THEN** no tap and no consumer sees it — control: the same report on a declared channel arrives

#### Scenario: 6250 is refused

- **WHEN** a connection config, a CLI flag or the service configuration names OSC port `6250`
- **THEN** it is refused with the sentence, and nothing binds `6250`

### Requirement: A failed OSC bind SHALL NOT keep AMCP down

A session whose OSC socket cannot be bound SHALL report it — one log line naming the address, the port and
the error — and SHALL dial AMCP anyway, retrying the bind at each reconnect cycle; with no bound socket it
SHALL NOT send `OSC SUBSCRIBE`.

#### Scenario: The OSC port is taken

- **WHEN** a session's OSC port is held by another socket
- **THEN** the session reports it, connects AMCP and completes its handshake, and sends no subscribe

## MODIFIED Requirements

### Requirement: Single-server operation is declared, quiet, and memory-bounded

The connection config SHALL support declaring a single server: `servers.B` is
optional (`{ A: required, B?: optional }`), and `ConnectionHealth.backup` is
correspondingly optional. The bridge's default connection SHALL be
single-server (A on `127.0.0.1:5250`, OSC on `6251`); the CLI SHALL construct a backup
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
