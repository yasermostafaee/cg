# runtime-caspar-bridge

## ADDED Requirements

### Requirement: The station declares one bank per channel

The bridge SHALL hold one fixed-layer bank per declared channel — a list keyed by channel, at most one bank per channel, each with the standard bands (beds 50–59, plates 60–79, templates 80–99) — and `#declaredChannels()` SHALL answer every bank's channel, so that the station fence, the restore fence, the orphan sweep, the playout rows, the lock scope, the permitted channels, the mode and output reads and the channel-settings store read the plural through the one predicate they already ask. `fixedLayers.banks` SHALL answer the whole list, `fixedLayers.set-banks` (station-admin, at least one bank) SHALL replace it and `fixedLayers.banks-changed` SHALL publish it; `fixedLayers.config`, `fixedLayers.set-config` and `fixedLayers.config-changed` SHALL stay as the one-bank view of the same list — `config` answers the first channel's bank, and `set-config` makes the set that one bank. The connect-time volume sweep SHALL cover every declared bank, and the post-`CLEAR` `MIXER CLEAR` SHALL follow a CLEAR inside any declared bank.

#### Scenario: Two declared banks

- **WHEN** the bridge boots with banks on channels 1 and 2 **THEN** both channels are declared, each row is published from its own channel's bank with that bank's names, `fixedLayers.config` answers channel 1's bank, and channel 3 is not declared

#### Scenario: The sweep covers every bank

- **WHEN** the bridge connects **THEN** every declared row on both channels is sent `MIXER <ch>-<layer> VOLUME 1` **AND** an undeclared channel is sent none

#### Scenario: The fence and discovery read the plural

- **WHEN** a request names channel 3 **THEN** it is refused with the station sentence **AND** the same request on channel 1 or 2 passes the fence
- **WHEN** `channels.list` is read **THEN** channels 1 and 2 are both `declared`

#### Scenario: A take and a clear on one channel touch nothing on the other

- **WHEN** a graphic is taken on channel 1 **THEN** `CG 1-99 PLAY 0` reaches the wire and nothing is written to channel 2 **AND** the same take on channel 2 writes there and nothing to channel 1
- **WHEN** channel 2's on-air row is cleared **THEN** `CLEAR 2-99` is followed by `MIXER 2-99 CLEAR`, nothing is written to channel 1, and channel 1's graphic stays on air

### Requirement: The bank file keeps a one-channel station byte-identical

The bridge SHALL write a set of ONE bank as the v1 bank object, byte for byte, and a set of two or more as `{ "banks": [ … ] }` in channel order. It SHALL read both shapes — a v1 object as a one-entry list — and SHALL fail the boot on anything else, a duplicate channel or an empty list included, as it fails today on any unreadable bank file. An empty set SHALL never be written.

#### Scenario: One bank is the v1 file

- **WHEN** a one-channel station's set is written **THEN** the file is the v1 bank object, byte for byte **AND** a v1 file reads back as a one-entry list

#### Scenario: Two banks round-trip

- **WHEN** two banks are written **THEN** the file is `{ "banks": [ … ] }` in channel order and reads back as the same two banks **AND** a v1 reader refuses that file

#### Scenario: A malformed set is a hard failure

- **WHEN** the file names the same channel twice, or an empty list **THEN** the boot fails

### Requirement: The channel set changes only where nothing of ours holds air

`fixedLayers.set-banks` SHALL be validated per channel by `validateFixedBanksChange`: an edited channel SHALL keep every single-bank rule, an added channel SHALL be validated as a fresh install, and a removed channel SHALL be refused while anything of ours on it is on air, unsettled, unverified or holding a resident producer, with `B-269`'s sentence "Something of ours is still on air on channel N — take it off air first."; absent that predicate a removal SHALL be refused (fail closed). Air on a channel that stays SHALL NOT refuse the removal of another. Items left on a removed channel SHALL leave the stack with no wire command, and a channel removed while clean SHALL leave no stray. `fixedLayers.set-config` on a station declaring several channels SHALL make the set that one bank under the same rule. The permission gate and the lock SHALL judge `set-banks` by the channels it adds, edits or removes; a bank sent back unchanged is not an act on its channel.

#### Scenario: Adding a channel

- **WHEN** `set-banks` adds channel 2 to a channel-1 station **THEN** it is accepted, the file is written as `{ banks }`, and a restart boots both channels

#### Scenario: Removing a channel that holds our air

- **WHEN** our graphic is on air on channel 1 and the set drops channel 1 **THEN** the change is refused with the sentence and nothing is sent **AND WHEN** the graphic is cleared **THEN** the same change is accepted

#### Scenario: A clean removal leaves no stray

- **WHEN** an idle channel is removed from the set **THEN** no stray is recorded and nothing is written to that channel

#### Scenario: Air elsewhere does not block a removal

- **WHEN** channel 1 holds our air and the set drops idle channel 2 **THEN** the change is accepted

### Requirement: The housekeeping bulk verbs take an optional channel

`stack.remove-all`, `stack.clear-all`, `stack.stop-all` and `stack.snapshot` SHALL accept an optional `{ channel }`. A bare call SHALL keep its meaning, and its wire output, byte for byte. With a channel, the verb SHALL act on that channel's items alone and SHALL write nothing to any other channel; `remove-all`'s on-air refusal SHALL be decided over that channel alone; the station fence SHALL refuse a channel the station does not declare, with nothing sent; and the permission check SHALL apply to that channel alone, all-or-nothing.

#### Scenario: CLEAR ALL on one channel

- **GIVEN** a graphic on air on each of channels 1 and 2
- **WHEN** CLEAR ALL names channel 2 **THEN** `CLEAR 2-99` is sent, nothing is written to channel 1, and channel 1's graphic stays on air **AND WHEN** it names channel 1 **THEN** channel 1 is cleared and nothing is written to channel 2
- **WHEN** CLEAR ALL is sent bare **THEN** both channels are cleared, as before

#### Scenario: STOP ALL and REMOVE ALL on one channel

- **WHEN** STOP ALL names channel 1 **THEN** `CG 1-99 STOP 0` is sent, nothing is written to channel 2, and channel 2's graphic stays on air **AND** the control on channel 2 stops channel 2
- **WHEN** channel 2 is idle, channel 1 is on air, and REMOVE ALL names channel 2 **THEN** channel 2's item leaves the stack and nothing is written to channel 1 **AND WHEN** it names channel 1 **THEN** it is refused, all-or-nothing, and channel 1 stays on air

#### Scenario: The snapshot of one channel

- **WHEN** the snapshot names channel 2 **THEN** it lists channel 2's items alone **AND** a bare snapshot lists both

#### Scenario: The gates judge the named channel

- **WHEN** CLEAR ALL names channel 3, which the station does not declare **THEN** it is refused with the station sentence and nothing is sent **AND** channel 2 passes and clears
- **WHEN** a principal holding channel 2 only sends CLEAR ALL on channel 2 **THEN** it passes **AND** on channel 1, or bare over a stack holding a channel-1 row, it is refused with the channel sentence

### Requirement: PANIC for one channel is its own verb

`stack.silence-channel-live-plates` SHALL take a required `{ channel }` and SHALL set to zero every live plate the bridge's ledger holds a seat for on that channel — the ledger, never a status (`B-122`) — sending only `MIXER <ch>-<layer> VOLUME 0`, and nothing to any other channel. It SHALL be `operator` class and channel-scoped: the station fence, the permission gate and a lock covering that channel SHALL judge it as they judge any other intent naming a channel. `stack.silence-all-live-plates` SHALL stay exactly as it is — `z.void()`, unscoped, `operator` class, judged by no channel check — silencing every seat on every channel (A16); it is the every-channel control.

#### Scenario: One channel silenced, the other untouched

- **GIVEN** a plate-bearing bed on air on each channel, both plates raised
- **WHEN** PANIC names channel 1 **THEN** channel 1's two plates are at zero, channel 2's are still raised, nothing is written to channel 2, and every line sent is a `VOLUME 0` **AND** channel 2's own PANIC then silences channel 2

#### Scenario: The every-channel silence still reaches both

- **WHEN** `stack.silence-all-live-plates` is sent **THEN** all four plates on both channels are at zero

#### Scenario: The gates judge the named channel

- **WHEN** PANIC names an undeclared channel **THEN** it is refused with the station sentence and nothing is silenced **AND** the declared channel silences
- **WHEN** a principal holding channel 2 only sends PANIC on channel 1 **THEN** it is refused with the channel sentence **AND** on channel 2 it passes **AND** the every-channel PANIC is not channel-checked

#### Scenario: A lock covering one of two channels

- **GIVEN** two declared channels, and a lock engaged by a principal holding channel 1 only
- **WHEN** a principal holding both channels sends PANIC, CLEAR ALL, STOP ALL or REMOVE ALL naming channel 1 **THEN** each is refused with the lock sentence **AND** each of them naming channel 2 passes

### Requirement: The demo station has a station-admin who can apply it

The development Playout (`scripts/dev-playout.ts`) SHALL offer `cg-admin-ch2` — the cumulative `station-admin`, `operator` and `viewer` roles, granted `127.0.0.1` channel 2 — and SHALL print it first in its sign-in list as the one user who can apply Station setup on the demo station. `cg-admin` SHALL keep its channel-1 grant unchanged.

#### Scenario: The demo's own station-admin

- **WHEN** `cg-admin-ch2` signs in and sends `fixedLayers.set-config` on channel 2 **THEN** it is accepted **AND** `cg-admin` sending the same is refused with the channel sentence

## MODIFIED Requirements

### Requirement: The station fence refuses a channel this station does not declare

The bridge SHALL refuse, before anything reaches CasparCG, every request that names a channel the station does not declare, with the one sentence that names the channel and says nothing was sent. The declaration SHALL be `#declaredChannels()` — every declared bank's channel (`MULTI-CHANNEL-01`), or channel 1 with no bank — and nothing else: a principal's grant and a catalogue row SHALL NOT make a channel one this station writes to. The fence SHALL apply with auth OFF as well as ON. It SHALL sit after the authentication gate and before the permission gate. It SHALL read only a channel the request names at its top level — a bulk verb or the per-channel PANIC naming one is fenced like any other — and a channel resolved from an `itemId`, a bare bulk verb's union and the every-channel PANIC SHALL NOT be read by it. `stack.restore` SHALL keep skipping a foreign retained row per item as `not-declared` rather than refusing the whole request. The routes whose channel declares or configures rather than addresses — `fixedLayers.set-config` and `channelSettings.set` — SHALL be exempt by name, and every other route naming a channel SHALL be fenced by default; `fixedLayers.set-banks` names its channels inside its list, where the fence does not read.

#### Scenario: An undeclared channel reaches nothing, with auth OFF

- **GIVEN** a bank declaring channel 2, auth OFF, and another system's html graphic on layer 20 and on reserved layer 60 of channels 1 and 2
- **WHEN** `layers.clear`, `playoutLayers.clear`, `fixedLayers.clear-layer` or `fixedLayers.load` (followed by a take) names channel 1
- **THEN** it is refused with the station sentence naming channel 1, and nothing addressing channel 1 reaches CasparCG

#### Scenario: A grant for the channel does not open it

- **GIVEN** the same station with auth ON, and a principal granted channels 1 and 2 of this host
- **WHEN** the same four doors name channel 1
- **THEN** each is refused with the station sentence, and nothing addressing channel 1 reaches CasparCG

#### Scenario: The declared channel is the positive control

- **WHEN** the same four doors name channel 2 on the same bridge
- **THEN** none is refused by the fence, and each one's command lands on channel 2

#### Scenario: After sign-in, before permission

- **WHEN** a socket that has not signed in names channel 1
- **THEN** it is told to sign in, and learns nothing about the station's channels
- **WHEN** a principal granted channel 2 only names channel 1
- **THEN** it is refused with the station sentence, not the grant sentence

#### Scenario: A request naming no channel is not read by the fence

- **WHEN** an item-scoped verb, a bare bulk verb, the every-channel PANIC, or a restore carrying a foreign slot is judged
- **THEN** the station fence does not refuse it

#### Scenario: Every route naming a channel is classified

- **WHEN** the route table's request schemas are walked for a key named `channel`
- **THEN** exactly fourteen routes carry one, eleven at the top level; exactly `fixedLayers.set-config` and `channelSettings.set` are exempt; and every other top-level channel route — the four housekeeping verbs and the per-channel PANIC among them — is refused an undeclared channel and passes the declared one

### Requirement: The console's reads that feed a CLEAR name only declared channels

The orphan sweep SHALL take its candidates only from channels this station declares, and the playout-layer state SHALL report its rows on each declared channel. A layer on a channel this station does not operate SHALL NOT be offered to the operator as clearable.

#### Scenario: Another channel's graphic is not an orphan

- **GIVEN** a bank declaring channel 2 and another system's html graphic on layer 20 of channels 1 and 2
- **WHEN** the orphan list is read
- **THEN** it lists `2-20` and nothing on channel 1

#### Scenario: The playout tab reports the declared channel

- **GIVEN** a bank declaring channel 2, reserved layer 60, and an html graphic on `1-60` and `2-60`
- **WHEN** the playout-layer state is read
- **THEN** its one row is channel 2, layer 60, reading the producer

### Requirement: A dynamic load places on the declared channel

The allocator SHALL place a dynamic row on the station's declared channel, never on a constant. On a station that declares more than one channel, a load that names no channel SHALL be refused (`no-layer`) with nothing sent: picking one declared channel would put a graphic on a channel the operator may not be looking at. A row's own load names its coordinate and is unaffected.

#### Scenario: A declared policy on a channel-2 station

- **GIVEN** a bank declaring channel 2 and a deployment-declared dynamic policy
- **WHEN** a template is loaded dynamically and taken
- **THEN** its producer is seated on channel 2, and nothing addresses channel 1

#### Scenario: Two declared channels refuse a load that names none

- **GIVEN** banks on channels 1 and 2 and the same policy
- **WHEN** a template is loaded dynamically
- **THEN** the load is refused as `no-layer` and nothing is written to either channel

### Requirement: The channel-discovery call names channels and decides nothing

The bridge SHALL answer `channels.list` with every channel any source names — the Playout's catalogue (D4) first, then the declared banks, then channel settings — and SHALL give each channel three facts kept apart: `named` (the catalogue row that joined it, or `null`), `declared` (this station operates it, by the station fence's own predicate) and, with auth ON, `permitted` (the asking principal's grant, by `grantsChannel` and its host rule). A catalogue row SHALL join a channel only when its `casparHost` is one of this bridge's configured servers. The bridge SHALL read D4 at most once every 30 seconds, with `If-None-Match`, using the signed-in principal's token only while that token is neither expired nor revoked, and SHALL NOT read it at all with auth OFF, with no usable bearer, or after the principal signed out. On any failure the catalogue SHALL be ABSENT — no alarm, no verdict, and never a gate on a verb. No channel the answer lists SHALL become one the bridge writes to by being listed; no channel index SHALL be derived or probed beyond what a source names. The bridge SHALL push each signed-in console its own answer when the catalogue, the banks, channel settings, the server list or its sign-in change it.

#### Scenario: Our channel named, the Playout's programme channel listed and not ours

- **GIVEN** a bank on channel 2, a catalogue naming channel 1 (the Playout's programme) and channel 2 on this station's host, and a principal granted both
- **WHEN** the console reads `channels.list`
- **THEN** channel 1 is named, permitted and NOT declared, from the catalogue alone; and channel 2 is named, permitted and declared, from the catalogue, the bank and channel settings — in that order

#### Scenario: Another station's row joins nothing

- **WHEN** the catalogue's only row names channel 2 on a host this bridge does not drive
- **THEN** channel 2 is listed unnamed, from the bank and settings; and when the row names this station's host, it is named

#### Scenario: Auth OFF reads no catalogue

- **WHEN** the bridge runs with auth OFF
- **THEN** it builds no catalogue reader, and the answer is the bank and settings with no names and no `permitted`

#### Scenario: At most every 30 seconds, with ETag

- **GIVEN** the sign-in's read reached the Playout
- **WHEN** a read is asked for inside 30 seconds, and again after them
- **THEN** the first is not made; the second is, carries `If-None-Match`, is answered `304`, and the names are still held

#### Scenario: An unreachable Playout is ABSENT and gates nothing

- **GIVEN** the catalogue was read
- **WHEN** the Playout stops answering and the next read fails
- **THEN** no catalogue is held, the channels are listed unnamed, and the console's verbs answer exactly as before

#### Scenario: A revoked or expired bearer is never presented

- **GIVEN** the sign-in's read carried the operator's token
- **WHEN** that token is revoked, or passes its expiry, and a read falls due
- **THEN** no request reaches the Playout and the catalogue is ABSENT; and after sign-out no request is made at all

#### Scenario: The console hears a rename

- **WHEN** the catalogue renames the station's channel and the next read lands
- **THEN** the console receives `channels.changed` carrying the new name

#### Scenario: Nothing past the lists is probed

- **GIVEN** a server running channels 1–4, a bank on 2 and a catalogue naming 1 and 2
- **WHEN** the bridge has connected, read the catalogue and run
- **THEN** channels 1, 3 and 4 receive nothing, while channel 2 is probed

#### Scenario: Two banks are two declared channels

- **GIVEN** banks on channels 1 and 2
- **WHEN** the console reads `channels.list`
- **THEN** channels 1 and 2 are both listed `declared`, each from its own bank

### Requirement: The permitted channels follow the declared bank

The bridge SHALL push `auth.state-changed` to a signed-in socket whenever the declared banks change — through `fixedLayers.set-config` or `fixedLayers.set-banks` — as it does when the server list changes, because the permitted channels are composed from both.

#### Scenario: First-run on channel 2 is operable at once

- **WHEN** a station-admin holding channels 1 and 2 signs in on a bank-less bridge and then declares
  channel 2 **THEN** the socket is pushed `permittedChannels: [2]` **AND** an operator granted
  channel 1 only is pushed `[]`

#### Scenario: First-run with two channels

- **WHEN** a station-admin holding channels 1 and 2 signs in on a bank-less bridge and declares both through `set-banks` **THEN** the socket is pushed `permittedChannels: [1, 2]` **AND** an operator granted channel 1 only is pushed `[1]`

### Requirement: The bridge runs the connection check

The bridge SHALL answer `setup.check` with one line per link — VPN or proxy, route, AMCP `VERSION`,
the Playout's keys, CORS for the console's origin, the station's ports, topology — each pass, fail,
warn, wait or skip with a sentence, and for a missing CORS entry the one line to give the Playout's
administrator. It SHALL always return its lines (`DESKTOP-APPS-01-C` C2): the lines SHALL run in
parallel, every probe SHALL connect within 3 s and every line SHALL finish within 5 s, and a line
that does not SHALL come back as its own line in the check's words ("No answer from `<host>` on port
`<port>`"), never as a timeout of the whole check. The typed address SHALL be normalised as the
console normalises it (C3), and the Playout host SHALL be resolved once to an IPv4 address that
every probe uses (C6); a host with no IPv4 address SHALL be one line. The AMCP line SHALL be, for a
refused or dropped connection: `wait`, "waiting for sign-in", before any `station-admin` has signed
in; `wait`, "waiting for the Playout to let this machine in", for 30 s after one; and after that a
failure naming this machine's IPv4 address as waiting for approval in the Playout, at
تنظیمات ← اتصال به CG Control, and that NAT, a proxy or a VPN is why it is not listed there (C7).
A check that asks for it (`awaitLetIn`, sent only by the console's one automatic re-run after a `station-admin`'s sign-in) SHALL hold its AMCP line within those 30 s (`DELTA-MULTI-CHANNEL-01-A` A2): the bridge SHALL ask CasparCG again itself, about once a second, until it answers or the 30 s end, and SHALL then answer with the line it has — a pass, or the approval — while every other line runs as in any check; the console SHALL wait for such a check the 30 s and a check's own wait on top. A check that does not ask, and any check outside those 30 s, SHALL probe AMCP once. No line SHALL name a script. A verdict about sign-in SHALL need a Playout that can sign someone in,
which is what the API line reads (`CHECK-RERUN-01`): while the API line fails — no answer, or no
signing keys — the CORS line SHALL be `skip`, "Sign-in from this console: not checked — `<reason>`",
and the AMCP line SHALL NOT wait for a sign-in but SHALL be its own result, a refusal or no answer
said plainly as a failure. That rule SHALL be applied in one place, after every line has settled,
and SHALL read the API line's reading, never the words of a line.

#### Scenario: Each failure shape has its own sentence

- **WHEN** the Playout's port refuses, the Playout drops the connection, the CORS origin is wrong, or
  the key set is empty **THEN** each prints its own sentence

#### Scenario: A black-hole Playout

- **WHEN** every probe points at an address that never answers **THEN** all seven lines come back
  within the bound, the API line saying what did not answer, the CORS line not checked, and the
  AMCP line a failure
- **WHEN** every probe points at the fakes **THEN** every network line passes

#### Scenario: AMCP before the sign-in, while the Playout decides, and after

- **WHEN** no station-admin has signed in, the API answers, and AMCP is refused **THEN** the line is
  `wait`, "waiting for sign-in", never a failure
- **WHEN** a station-admin signed in less than 30 s ago and AMCP is refused **THEN** the line still
  waits, for the Playout
- **WHEN** it is still refused after that **THEN** the line names this machine's IPv4 address as
  waiting for approval in the Playout's app, and carries no command
- **WHEN** the administrator approves this machine **THEN** the line passes

#### Scenario: One fault is said once

- **WHEN** the Playout's API does not answer **THEN** the no-answer is said once, on the API line,
  **AND** the CORS line is `skip`, "Sign-in from this console: not checked — the Playout does not
  answer."
- **WHEN** the Playout answers and publishes no signing keys **THEN** the CORS line is `skip` and
  names the missing keys as the reason
- **WHEN** the API answers with a key and the CORS origin is wrong **THEN** the CORS line is
  checked and fails on its own, with the one line to add

#### Scenario: AMCP does not wait for a sign-in that cannot happen

- **WHEN** no station-admin has signed in, the API does not answer, and AMCP is refused or silent
  **THEN** the AMCP line is a failure saying so plainly, never "waiting for sign-in"
- **WHEN** the API does not answer and AMCP answers `VERSION` **THEN** the AMCP line passes

#### Scenario: A host with no IPv4 address

- **WHEN** the Playout's host has no IPv4 address **THEN** the route line says so and the AMCP, key
  set and CORS lines are not produced

#### Scenario: A held AMCP line

- **WHEN** a check asks to hold its AMCP line within 30 s of a station-admin's sign-in and the Playout lets this machine in a moment later **THEN** the AMCP line passes, the bridge having asked CasparCG again itself, **AND** the same check not asking only waits
- **WHEN** the Playout never lets this machine in **THEN** the held line answers when the 30 s end, naming the approval
- **WHEN** no station-admin has signed in, or the 30 s have passed **THEN** a check asking to hold probes AMCP once
