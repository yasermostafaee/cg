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
declared every channel is served. A question about the occupancy of a channel whose OSC is dropped (Change
channel… asks about the new channel before declaring it) SHALL be answered by the core with `INFO <ch>`,
never by the tap.

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

#### Scenario: An undeclared channel's occupancy comes from the core

- **WHEN** the occupancy of a channel the station does not declare is asked while another is declared
- **THEN** the bridge sends `INFO <that channel>` and answers from the reply — control: a declared
  channel is answered from the tap

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

### Requirement: The bridge SHALL keep its own stack, and restore it at start

The bridge SHALL persist its stack — every row's retained intent (`RetainedStackItem`: its state, its
slot, its fields and every per-row intent the operator set), and its strays — to its own file on every
change, written atomically, and SHALL restore that file at start through the same `restore()` a
console's re-delivery used, BEFORE its control socket listens. No console SHALL re-deliver a stack or a
template. An unusable file SHALL be said and the bridge started with an empty stack, the file kept.
At close the stack SHALL be written whatever is pending.

#### Scenario: A restart keeps the stack with no console's help

- **WHEN** a bridge with rows on air is stopped and a new bridge starts on the same file
- **THEN** the new bridge holds the same rows, in order, before any console connects

#### Scenario: An unusable file

- **WHEN** the stack file is not a stack
- **THEN** the bridge says so, starts with an empty stack, and leaves the file as it was

### Requirement: The first connection after start SHALL be judged from the core's own INFO, and nothing SHALL be re-sent by itself

At the first connection after the bridge starts, the bridge SHALL read `INFO <ch>` for every declared
channel on that connection, inside its handshake — before it is declared healthy, so no command can
overtake the reading — and SHALL decide every restored row and every ledger entry from that picture: a
layer holding our page SHALL be adopted with nothing sent; a restored row or a ledger seat whose layer
is empty SHALL leave ON AIR with the restart notice, and NOTHING SHALL be sent for it — no `CG ADD`, no
`PLAY`, no `CLEAR`; a row restored `loaded` over an empty layer SHALL stay `loaded`, not resident, so its
next take re-ADDs it. A read that fails SHALL leave the decision to the OSC sample, as on every later
connection. An occupied layer in 50–99 that no entry holds SHALL be listed on the leftover strip.

#### Scenario: A layer emptied while the bridge was down

- **GIVEN** a bridge stopped with two rows on air, and the core then lost one of the two pages
- **WHEN** a bridge starts on the same stack file
- **THEN** it reads `INFO` for the channel, the emptied row leaves ON AIR and the restart notice names
  it, and nothing is sent for it — control: the row whose page still plays stays ON AIR, adopted

#### Scenario: The start check sees what a deaf OSC tap cannot

- **WHEN** the core sends the bridge no OSC but answers `INFO`, and our page still plays on a
  restored row's layer
- **THEN** the row is adopted ON AIR from `INFO`, and nothing is sent

## MODIFIED Requirements

### Requirement: A restore refuses to decide rather than act on absent evidence

When the occupancy tap has never been heard from, the bridge SHALL refuse to decide a restored
item's fate rather than guess it in either direction. Restoring retained stack intent decides per
item whether the item's layer still holds its producer; with no occupancy evidence that question
has no answer. (`CENTRAL-BRIDGE-01`: at the first connection after start the evidence is the core's
own `INFO`; this requirement governs a restore decided without it — a core that answers neither.)

In that state the bridge SHALL send NOTHING for the affected items — no clear, and in particular
no re-add, because a re-add carries no play-on-load and would replace a playing producer with a
non-playing one, taking a live graphic off air. The items SHALL remain on the stack, visible, and
SHALL be published in the honest unverifiable state rather than as a confident on-air claim.

The refusal SHALL be recoverable: refused items remain pending, and the bridge SHALL decide them
for real once the tap begins receiving OSC, so a tap that comes up shortly after the link becomes
healthy cannot strand those rows permanently.

The reconnect reconciliation that resets still-on-air items whose layers have gone silent SHALL
be subject to the same rule — it MUST NOT reset an item on the strength of silence from a tap that
has never been heard from, because that would report a live graphic as idle over a healthy link.

A refusal SHALL be recorded where an operator or engineer can find it, naming what was not done
and why; an install in this state appears healthy on its command link, so the cause is not
otherwise discoverable.

#### Scenario: A blind tap over a live layer sends nothing

- **GIVEN** an item is restored onto a layer that genuinely holds a live producer
- **WHEN** the occupancy tap has never received OSC
- **THEN** no command is sent for that item — neither a clear nor a re-add — and the live
  producer is untouched

#### Scenario: The undecided row stays visible and honest

- **WHEN** a restore refuses to decide
- **THEN** the item remains on the stack and is published as unverifiable, never as a confident
  on-air claim

#### Scenario: The refusal resolves once OSC arrives

- **GIVEN** a restore refused to decide because the tap had heard nothing
- **WHEN** OSC begins arriving
- **THEN** the pending items are decided normally — adopted if their layer is occupied; if it is
  genuinely silent, nothing is sent and an item restored ON AIR leaves ON AIR with the restart notice

#### Scenario: Reconnect reconciliation does not reset on unheard silence

- **GIVEN** an item is on air and the link is healthy
- **WHEN** the occupancy tap has never received OSC
- **THEN** the item is not reset to idle on the strength of that silence

#### Scenario: Deciding normally when the tap is heard

- **WHEN** the tap is receiving OSC
- **THEN** an occupied layer is adopted with nothing sent, and a silent layer has nothing sent either:
  an item restored ON AIR leaves ON AIR with the restart notice, an item restored `loaded` stays
  `loaded`

### Requirement: The bridge resets the mixer of a layer it has just emptied

The bridge SHALL send `MIXER <ch>-<layer> CLEAR` after its own `CLEAR` of a layer when, and only when, the `CLEAR` landed on the current primary and the layer is inside the declared bank. It SHALL NOT send it after a `CLEAR` that did not land, on a layer outside the declared bank, or on a declared playout layer.

#### Scenario: A producer that does not come through our take is audible after our clear

- **GIVEN** a row of ours on air whose layer carries a mute the bridge has no record of, then cleared
  by the bridge (`CENTRAL-BRIDGE-01`: the restore's muted re-ADD that used to leave one is gone)
- **WHEN** another client plays a producer on that layer
- **THEN** reading `MIXER <ch>-<layer> VOLUME` answers `1`

#### Scenario: The reset follows our clear, inside our band only

- **WHEN** the bridge clears a row on a declared bank layer
- **THEN** `MIXER <ch>-<layer> CLEAR` follows the `CLEAR` on the wire
- **AND WHEN** it clears an orphan outside the declared bank, or a `CLEAR` is refused **THEN** no mixer reset is sent

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
