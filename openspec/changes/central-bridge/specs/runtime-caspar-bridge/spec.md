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

### Requirement: The restore's report SHALL be standing bridge state, for every console

The bridge SHALL hold the report of its restore — every row it could not bring back, with its reason
and its naming (`B-108`, `B-233`), and every row it brought back on a different row — as standing
state: answered by `stack.restore-report` (`null` when there is nothing to say), pushed on
`stack.restore-report-changed`, and dismissed for every console by `stack.dismiss-restore-report`,
one half (`skipped` or `migrated`) at a time. The benign skip (a row the live bridge already holds)
SHALL NOT enter it. A dismissal naming a `channel` SHALL remove only that channel's rows (a skip by
its retained slot, a migration by the row it came from; a row naming no channel goes with any
dismissal), and a dismissal that removes nothing SHALL answer `ok: false`. A console SHALL read the
report on every connect, so a console that connects after the bridge's start still sees it.

#### Scenario: Two consoles see one report, and one dismissal clears it for both

- **GIVEN** the bridge started with a row whose template it no longer holds
- **WHEN** two consoles connect **THEN** both read the row in the report, with its reason
- **AND WHEN** one dismisses it **THEN** the other is pushed an empty report, and a second dismissal
  answers `ok: false`

#### Scenario: A dismissal for one channel leaves another channel's rows

- **WHEN** the report holds a row on channel 1 and one on channel 2, and a dismissal names channel 1
  **THEN** only channel 2's row remains

### Requirement: CG Bridge SHALL never run with authentication off

A bridge started as CG Bridge (`requireAuth`, which the service configuration sets) SHALL refuse to
start when no Playout is configured, with a sentence naming what is missing and where it is set, and
SHALL leave nothing listening. Every console connection then signs in: a socket with no valid token —
never signed in, expired or revoked — SHALL be answered only on the open doors (`bridge.capabilities`,
`auth.*`, and until CG Control signs in to the Playout itself, the narrowed `setup.check`) and SHALL be
pushed nothing (the amendment to `playout-auth-signin`'s expiry requirement, 2026-09-30).

#### Scenario: No Playout, no start

- **WHEN** CG Bridge starts with no Playout configured **THEN** the start fails with the sentence and
  nothing listens — control: with a Playout it starts, and refuses an unsigned socket's read

#### Scenario: An expired token is refused like none

- **WHEN** a socket's token expires or is revoked **THEN** its reads are refused as its intents are, and
  it is pushed nothing — control: a console whose token is still valid is answered and pushed as before

### Requirement: A console on another release line than CG Bridge SHALL send nothing

`bridge.capabilities` SHALL carry the bridge's release version (`bridgeVersion`, the number
`tools/release` stamps), answered to any socket. At every connect a console SHALL compare it with its
own by release line — major.minor equal, the patch free — and a bridge that names none SHALL be read as
another release. On another release line the console SHALL show ONE line naming both versions, that
nothing is sent and the remedy, and SHALL refuse every request but `bridge.capabilities` and `auth.*`
before a frame is written. Every other request SHALL wait for that answer before it is decided, so a press
in the first round trip is judged like any other; an answer that never comes leaves nothing known and
refuses nothing. The channel list (`B-153`) SHALL stay as it is, beside it: it answers whether this bridge
routes what the page calls, and reports without refusing.

#### Scenario: Another release line sends nothing

- **WHEN** a console `0.10.0` connects to a bridge `0.9.1` **THEN** it shows the one line and a take is
  refused before any frame is written — control: the capabilities question went out and was answered

#### Scenario: A press before the answer waits for it

- **WHEN** a take is pressed after a console `0.10.0` connects to a bridge `0.9.1` and before the
  capabilities answer lands **THEN** it waits for the answer and is refused with no frame written —
  control: the same slow answer from a `0.10.0` bridge, and the take goes out after it

#### Scenario: A patch difference is the same release

- **WHEN** a console `0.10.0` connects to a bridge `0.10.3` **THEN** nothing is shown and a take goes out

#### Scenario: A bridge that names no release

- **WHEN** a bridge answers without `bridgeVersion` **THEN** the console reads it as a release older than
  `0.10` and sends nothing

### Requirement: A console SHALL be told only the channels its sign-in holds

CG Bridge SHALL tell each socket only the state of the channels its principal's grant holds, judged by
the predicate the request gate asks (`grantsChannel` over the configured hosts). Every push and every
read of what is ON a channel — the stack, the per-slot state, the live-layer ledger and its media clock,
the playout layers, orphans, layers cleared outside, owned occupancy, the restart notice (its rows and its
seats), the restore report, strays, rehearse, the programme return and the audit rows — SHALL be narrowed
to the entries on held channels, and an entry naming no channel SHALL be told to every console.
Configuration and the station's own health — the banks, channel settings, the template library, the
source catalogue and assignments, delimiters, the server list and its health, the lock and the pending
update — SHALL be told whole, because a console needs all of it to draw and scope its own channel. One
table SHALL classify every route and every publish channel; a test SHALL fail on an unclassified or a
stale entry; and an unclassified one SHALL tell a scoped socket nothing. A dismissal of the restart notice
or of the restore report SHALL reach only what its console was told. A channel shown READ ONLY because
the sign-in does not hold it SHALL say so in place of its rows. With authentication off, and for a `*`
grant, nothing SHALL be narrowed.

#### Scenario: Each console is told its own channels

- **WHEN** a graphic is on air on channel 1 and on channel 2, and consoles signed in for channel 1, for
  channel 2 and for both read the stack and the per-slot state and are pushed their changes **THEN** the
  channel-1 console is told only channel 1's and the channel-2 console only channel 2's — control: the
  console holding both is told both, and every console reads both banks

#### Scenario: A dismissal reaches only the dismisser's rows

- **WHEN** the core restarts under rows on channels 1 and 2 and the channel-1 console dismisses the
  restart notice **THEN** channel 2's row stays in the notice for the channel-2 console, and nothing goes
  back on air on either channel

#### Scenario: A channel the sign-in does not hold

- **WHEN** a console shows the bank's channel READ ONLY because its sign-in does not hold it **THEN** the
  Layers view says `This channel is not in your sign-in.` and draws no rows — control: a sign-in holding
  the channel sees its rows

### Requirement: An audit row SHALL name the console machine beside the user

Every audited action a console caused SHALL record, beside the actor, the console machine it came from
(`consoleAddress`): the peer address of that console's own socket, with an IPv4-mapped IPv6 address
reduced to its IPv4 form. It SHALL be read from the acting socket's session and never from the request,
so a console cannot name another machine; an action no console caused, and every row written before,
SHALL carry none; and a peer address longer than a row may carry SHALL be recorded as none rather than
shortened. The Log SHALL keep the user in the sentence and show the machine on the actor's hover (golden
rule 11: a technical fact rides the `title`).

#### Scenario: A take names the console machine

- **WHEN** a signed-in console at `192.168.21.50` takes a row **THEN** the row's actor is the user and its
  `consoleAddress` is `192.168.21.50` — control: an action the bridge takes by itself carries none

#### Scenario: The Log shows the machine on hover

- **WHEN** the Log shows a row with a console machine **THEN** the actor cell reads the user and its title
  reads `From 192.168.21.50` — control: a row without one has no title

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

### Requirement: Live connection is never silently downgraded

A connection chosen as live SHALL NOT be silently replaced by the mock. A
mid-session loss of the bridge SHALL surface as a visible disconnected state with
rejected commands, never as on-air or mock activity. On reconnect the renderer
SHALL read the bridge's standing state (its restore report, its strays) and
re-pull the full snapshot (stack / health / lock), and SHALL deliver NOTHING of
its own — no template, no stack (`CENTRAL-BRIDGE-01`, `B-294`: the bridge keeps
both, and restores its stack itself at start).

#### Scenario: Bridge drops mid-session

- **WHEN** the WebSocket to a previously-connected bridge drops **THEN**
  `WebSocketRuntime` enters a visible DISCONNECTED/reconnecting state and
  take / update / out are rejected with a clear error (NOT shown as on-air, NOT
  routed to a mock)
- **AND** on reconnect the renderer reads the bridge's restore report and strays,
  then re-pulls a full snapshot (stack / health / lock) to resync

#### Scenario: Command issued while disconnected

- **WHEN** the operator issues take / update / out while the bridge is down
  (disconnected/reconnecting) **THEN** the command is rejected with a visible
  error and is never shown optimistically as on-air

#### Scenario: A reconnect delivers nothing

- **WHEN** the link reconnects to a console holding templates and a stack in its
  display copies **THEN** it sends no `templates.import` and no stack restore —
  control: the resync ran to its snapshot re-pull

### Requirement: Every template mutation is recorded, and a lock refuses an overwrite

The bridge SHALL write an audit row for every change to its template catalogue: `import` for an operator's import and `template-remove` for every removal outcome. A `templates.import` marked `redelivery` SHALL be refused before the lock, auth and permission gates with its own sentence, SHALL change nothing, and SHALL write no row (`CENTRAL-BRIDGE-01`, `B-294`: a console re-delivers nothing; `template-redeliver` has no writer and stays in the audit schema only so older logs parse). While the lock reaches the requesting console, an import SHALL be refused with the lock sentence and SHALL leave the held copy unchanged.

#### Scenario: A re-delivery changes nothing and writes no row

- **WHEN** a frame marked `redelivery` would register a missing template, and another would replace a held one
- **THEN** both are refused with the re-delivery sentence, the catalogue is unchanged, and no row is written
- **AND** the operator's import and removal around them each write their row

#### Scenario: A locked console cannot overwrite a template

- **GIVEN** the lock is engaged
- **WHEN** an operator's import would replace a held template's HTML
- **THEN** it is refused with the lock sentence and the held HTML is unchanged
- **AND** a frame marked `redelivery` is refused with its own sentence, not the lock's

### Requirement: Reconnect machinery is refused but not recorded as a press

The bridge SHALL route no `stack.restore` (`CENTRAL-BRIDGE-01`: it restores its own stack at start), and SHALL refuse a `templates.import` marked `redelivery` before the lock, auth and permission gates with its own sentence, writing no `refused` audit row for either. A refused press SHALL still write its `refused` row.

#### Scenario: A viewer's retired reconnect frames leave no refused row

- **WHEN** a signed-in viewer's console sends `stack.restore` and a re-delivery, then presses TAKE
- **THEN** the first finds no route, the second is refused with the re-delivery sentence, the TAKE is refused for the role, and the only `refused` row is the TAKE's

### Requirement: The bridge serves retained template HTML over HTTP

The bridge SHALL run a small HTTP server (separate from the control WebSocket) that serves each stored
template version at `/template/<key>`, returning the stored HTML as `200 text/html; charset=utf-8` with
`Cache-Control: no-store`, and `404` (also `no-store`) for a key no stored version has. A version stored
from `CENTRAL-BRIDGE-01` on SHALL be served at `<templateId>~<versionId>` — its content's id — for as long
as it is stored; a version stored before keeps the key it was given, and no later version SHALL ever be
given that key (`B-293`: CasparCG's CEF keeps pages on disk, so a URL that changed its page could air the
cached old one — the Playout team's rule 12). A take's `CG ADD` SHALL use the key of the version the row's
own channel lists. Removing a version SHALL stop serving its key. The server holds template HTML only — it
exposes no control surface, and its route set is unchanged.

The served HTML SHALL be self-contained: the runtime, scene, images, AND the bundled app fonts
(Vazirmatn / Exo 2) are inlined (base64), so CasparCG fetches nothing else — Persian text renders with the
correct face and intact shaping.

#### Scenario: A known template serves its stored HTML, never stored by the client

- **WHEN** a listed template's URL `/template/<templateId>~<versionId>` is fetched **THEN** the server
  returns `200 text/html; charset=utf-8` with exactly the stored HTML and `Cache-Control: no-store`

#### Scenario: An unknown key is 404

- **WHEN** `/template/<key>` is fetched for a key no stored version has **THEN** the server returns `404`
  with `Cache-Control: no-store`

#### Scenario: A re-import is served at a new path

- **WHEN** a template id is re-imported with new content and no row holds its previous version **THEN**
  the new version is served at its own `<templateId>~<versionId>` path and the next take names it, and the
  previous path answers `404` — never the new page

#### Scenario: A held version keeps its path beside the new one

- **WHEN** a template is re-imported while a row still holds the previous version **THEN** the previous
  version is served at its own path byte for byte, and the new version at `<templateId>~<versionId>`

#### Scenario: A version stored before keeps its path, and no later version takes it

- **GIVEN** a version stored before `CENTRAL-BRIDGE-01`, served at the bare template id
- **WHEN** a new version replaces it and it is collected **THEN** the new version is served at its own
  qualified path, and the bare path answers `404`

#### Scenario: The served page is self-contained including fonts

- **WHEN** the served HTML is inspected **THEN** it contains the bundled Persian `@font-face` faces inlined
  as base64 `data:` URIs and references no external `/fonts/…`, `https:` or `<link>` resource

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

### Requirement: On-air verbs are refused while the server is not connected

The bridge SHALL refuse the playout verbs that must reach the wire — `take`, `update`,
`out` — while **no declared server is reachable**, returning the machine-readable refusal
`{ accepted: false, errorCode: 'disconnected' }` rather than attempting the send.

The predicate SHALL be "**no declared session is REACHABLE**", NOT "no declared session is
`healthy`" and NOT "the current primary is not healthy". A session is REACHABLE when its AMCP
command axis is believed up — `healthy`, OR `degraded` (OSC-silent past the threshold but the
AMCP socket still open). The predicate SHALL reuse the caspar-client's own liveness notion
(`isLiveState`: `healthy` OR `degraded`) rather than re-deriving the state list in the bridge —
a second local copy is exactly how the predicate came to test `!== 'healthy'` and call a working
AMCP link dead.

Two distinctions are load-bearing:

- **OSC silence is not unreachability (B-100).** OSC is the CONFIRMATION channel; AMCP is the
  COMMAND channel. A command reaches CasparCG over AMCP whether or not OSC is flowing. Refusing
  every verb because confirmation is unavailable would turn a monitoring fault into a total
  playout outage — B-094's wrong-OSC-port install would go off air entirely though its AMCP link
  is perfect. Honesty under silence is preserved by the surfaces that already exist — an on-air
  row demotes to `unverified` ("WAS ON AIR", muted) the moment the primary leaves `healthy`
  (B-086), and the health surface renders `⚠ NO OSC` (B-094) — NOT by refusing the command. The
  operator is WARNED, not BLOCKED.
- **A dead primary with a live backup is reachable (B-056).** In a mirror pair whose PRIMARY's
  AMCP link is dead while the BACKUP is healthy (auto-failover off — the human-in-the-loop
  scenario), every send still lands backup-only on a real, rendering CasparCG: a graphic
  genuinely IS on air there. Refusing in that window would break the redundancy contract AND lie
  in the opposite direction (denying air that exists). The gate closes only when the command can
  reach NO server at all.

This requirement's own verb list (`take`, `update`, `out`) is NOT the predicate's full reach. The
SAME predicate SHALL govern every site that asks "can a command reach a server?" — five in all:
these three, the graceful stop (whose own requirement already scopes its refusal to "no declared
server is reachable, exactly as the other on-air-affecting commands are", and which therefore
inherits the corrected meaning without restating it), and the load path below. A `degraded` server
SHALL accept the graceful stop for the same reason it accepts a take: being unable to take a
graphic OFF air through a working command link is the more dangerous failure, because the graphic
stays on air.

The SAME reachability predicate SHALL gate the load path's adopt-CLEAR / pre-roll-ADD pairing. A
load SHALL evaluate reachability ONCE and issue the destructive adopt-`CLEAR` only on a path where
the constructive pre-roll `CG ADD` will also be attempted — so a reachable server (`healthy` OR
`degraded`) is NEVER left cleared-and-empty (a BLACK layer on air), and with no server reachable
neither is sent (the load still rests the item at `loaded`, B-082). Evaluating the predicate twice
with an await between the CLEAR and the ADD is forbidden: a session slipping state in that gap is
what reopens the CLEAR-then-nothing window.

The refusal SHALL happen **before any intent is applied to the Reconciler**. This is the
load-bearing detail: an intent applied optimistically and only then failed is what produces a
transient — and, joined with stale OSC, a persistent — false ON AIR. A command that cannot reach
CasparCG SHALL leave the item's status exactly as it was.

The refusal SHALL NOT be a deferral. A command issued while no server is reachable SHALL NOT be
queued for later delivery: the operator's intent would be stranded (nothing re-sends it: since
`CENTRAL-BRIDGE-01` a console delivers nothing on reconnect, and the bridge restores only its
own stack, sending nothing by itself), which recreates the same false belief one step
later. Refuse, and say so.

This mirrors the existing on-air block (a counted, reasoned `{ ok, reason }` refusal that the UI
surfaces verbatim). It introduces no AMCP verb and sends nothing to the wire.

#### Scenario: PLAY while no server is reachable is refused, not optimistically shown

- **WHEN** the operator takes an item while no declared server is reachable **THEN** the
  bridge refuses with `errorCode: 'disconnected'`, no `take` intent is recorded, the item's
  status is unchanged, and the item is never shown as playing or on air

#### Scenario: Update and out are refused the same way

- **WHEN** the operator updates or outs an item while no declared server is reachable
  **THEN** each is refused with `errorCode: 'disconnected'` and no intent is applied

#### Scenario: A degraded server (OSC-silent, AMCP up) is reachable — verbs are ACCEPTED

- **WHEN** the only declared server is `degraded` (OSC silent past the threshold while its AMCP
  socket still works) and the operator takes an item **THEN** the take is ACCEPTED and the
  `CG PLAY` reaches the wire — refusing over a working command link would deny air that a real
  CasparCG can render, and honesty is already carried by the `unverified` display and the
  `⚠ NO OSC` health surface, not by refusal

#### Scenario: A graceful stop on a degraded server is ACCEPTED — the operator can still get off air

- **WHEN** an item is on air on a `degraded` server (OSC silent, AMCP socket working) and the
  operator issues the graceful stop **THEN** it is ACCEPTED, the stop verb reaches the wire, and
  the producer is left resident — refusing it would strand a live graphic on air with no way to
  remove it through a link that carries the command perfectly well, which is a worse failure than
  a refused take

#### Scenario: A load onto a degraded server is never left black

- **WHEN** an item is loaded onto a layer of a `degraded` server that holds a resident producer
  **THEN** the adopt-`CLEAR` and the pre-roll `CG ADD` both reach the wire, paired in that order —
  the layer ends holding a live producer, never the BLACK an unpaired CLEAR (CLEAR-then-nothing)
  would leave on air

#### Scenario: A dead primary with a healthy backup is NOT refused (B-056)

- **WHEN** the primary's AMCP link is down but a declared backup is healthy **THEN** the
  verbs are still accepted and land backup-only, exactly as the redundancy strategy
  specifies — the command reaches a real, rendering server, so refusing it would deny air
  that genuinely exists

#### Scenario: A refused command is not deferred

- **WHEN** a command is refused because no server is reachable **THEN** it is NOT
  queued or replayed on reconnect — the operator is told it did not happen and must reissue
  it deliberately

#### Scenario: The gate lifts when a server is reachable again

- **WHEN** a declared session reaches `healthy` (or is `degraded` — reachable) **THEN** the verbs
  are accepted again and behave exactly as before, with no change to the producer-state rules that
  choose them

### Requirement: An installed station advertises its first-run phase and declares no channel until one is chosen

The bridge SHALL, when started with `--first-run`, advertise `setup: target` on
`bridge.capabilities` while no Playout is configured and `setup: channel` while no channel is
declared, and SHALL start with no fixed bank rather than the built-in default when no bank file
exists. Until that bank is written it SHALL declare NO channel (`DESKTOP-APPS-01-D` j): the
station fence, the restore door and the permitted channels all answer none. Without `--first-run`
it SHALL behave as before.

#### Scenario: The phases

- **WHEN** an installed station has no Playout **THEN** it advertises `target` **AND WHEN** it has a
  Playout and no bank **THEN** it advertises `channel` **AND WHEN** a bank is declared **THEN** it
  advertises nothing

#### Scenario: A remembered item is not adopted before the channel is declared

- **WHEN** a first-run bridge with no bank starts on a stack file holding an on-air item on
  channel 1 (`CENTRAL-BRIDGE-01`: the bridge restores its own stack; a console re-delivers nothing)
  **THEN** the restore skips it as `not-declared`, records it as a stray, and sends nothing to
  channel 1

## REMOVED Requirements

### Requirement: The browser re-delivers retained templates on reconnect

**Reason**: `CENTRAL-BRIDGE-01` (`B-294`) — a console re-delivers nothing. The bridge persists its
template library and its stack and restores the stack itself at start, so a restarted bridge needs
nothing from a console; with several consoles on one bridge, a re-delivered copy was a claim on the
truth that a stale console could win. "A post-restart load needs no manual re-import" still holds,
from the bridge's own store ("A console's template library is a display copy, and an import or a
removal needs CG Bridge", `runtime-template-library`).
