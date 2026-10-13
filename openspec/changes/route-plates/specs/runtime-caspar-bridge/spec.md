# runtime-caspar-bridge

## ADDED Requirements

### Requirement: A Playout route plate SHALL be seated hidden, by LOADBG then the bare PLAY, and shown by OPACITY in one commit

A plate whose source is a Playout `route` SHALL be seated on every path — take, look switch, swap and restore — by
the one seat step: its layer hidden and muted (`OPACITY 0`, `VOLUME 0` and the fit, as `DEFER`) in one
`MIXER <ch> COMMIT` acknowledged before anything else; then `LOADBG <ch>-<L> "route://H-L"`; then the bare
`PLAY <ch>-<L>` at least 40 ms after the `LOADBG`'s reply and at most 200 ms after it left, or one fresh `LOADBG`
in its place; then, one or two ticks after the last `PLAY`, `OPACITY 1` for every plate being shown in ONE
`MIXER <ch> COMMIT`. It SHALL be a cut, never inside `BEGIN…COMMIT`. A window missed twice SHALL refuse the seat
as a refused `PLAY` does. The wire of every plate not bound to a Playout route SHALL be unchanged.

#### Scenario: Timing on the shared clock

- **WHEN** a route plate is taken **THEN** `LOADBG` → `PLAY` is at least 40 ms and at most 200 ms, the `PLAY`
  carries no transition, and the reveal follows it
- **AND** a `PLAY` that cannot follow within 200 ms is not sent: a fresh `LOADBG` replaces the first
- **AND** a plate not bound to a Playout route sends no `LOADBG` and waits for nothing (the control)

#### Scenario: Multi-box

- **WHEN** a take or a look switch shows two new route plates **THEN** one hide `COMMIT`, then two `LOADBG`/`PLAY`
  pairs, then one reveal `COMMIT`, and no `BEGIN` anywhere
- **AND** a switch between looks that share their plates sends no `PLAY` (the control)

### Requirement: A held Playout route SHALL keep playing, hidden, and SHALL come back by the reveal alone

A route plate a look does not show SHALL stay playing at `OPACITY 0`, muted, with `BLEND` normal, and `PAUSE`
SHALL never be sent to it. Showing it again SHALL be the reveal alone, with no new `PLAY`, and SHALL be refused,
all or nothing, while its input does not read `available` in the latest D10.

#### Scenario: Held, then shown again

- **WHEN** a look switch holds a route plate **THEN** its layer gets `OPACITY 0` and `VOLUME 0`, keeps its
  producer, and no `PAUSE` is ever sent
- **AND** showing it again while its input is unavailable refuses the switch and sends nothing
- **AND** when it is available, the reveal alone brings it back (the control)

### Requirement: A Playout route SHALL be sent only from the current, confirmed epoch

Every seated route SHALL record the epoch it was resolved from. After an AMCP reconnect, on an epoch change seen
in D10, and before a route plate is seated, the bridge SHALL re-read D10 within 1.5 s. A route of another or
unknown epoch SHALL never be sent: the plate stays empty and its row carries one line,
`Bed 59 · Plate 1: waiting for the Playout's input list.` It SHALL be seated again only from a fresh D10 of the
current epoch, by the restore the bridge already has. The send seam SHALL refuse any route line whose epoch is not
the current, confirmed one, and send nothing.

#### Scenario: A core restart as the Playout lives it

- **WHEN** the Playout reports a new epoch with renumbered holders and the AMCP connection drops **THEN** no route
  is re-sent from the old epoch and the row says it waits
- **AND** after the fresh D10, a take seats the new holder layer
- **AND** a core that comes back empty is put back on air at the new holder layer

#### Scenario: The Playout's API is down at the reconnect

- **WHEN** the D10 re-read fails **THEN** no route is sent, and a take waits too

#### Scenario: The same epoch

- **WHEN** the AMCP connection comes back under the same epoch **THEN** mixer state alone is re-sent, as today, and
  no waiting line is raised (the control)

#### Scenario: The seam

- **WHEN** a route line of a stale epoch reaches the send seam **THEN** it is refused and nothing is sent
- **AND** the current epoch passes (the control)

### Requirement: The bridge SHALL seat a Playout route only on a channel its input names

The bridge SHALL refuse, before any AMCP and all or nothing, a take, look switch or swap that would seat a Playout
route on a channel its `compatibleChannels` does not name, and the row SHALL say so in one line:
`Bed 59 · Plate 1: “ورودی ۴” can't be shown on CH 2.` An input the Playout marks `available: false` SHALL be
refused the same way, with its reason.

#### Scenario: Destination and availability

- **WHEN** `ورودی ۴` (channel 1 only) is taken on channel 2 **THEN** the take is refused naming the plate and the
  channel, and nothing is sent
- **AND** an unavailable input is refused with the Playout's reason
- **AND** `ورودی ۳` plays on channel 2 (the control)

### Requirement: The AMCP send seam SHALL refuse every line contract v1.3 forbids

Before any AMCP line is written, the send seam SHALL refuse, and send nothing for: a command whose target channel
is not a declared programme channel (the Playout's holder and guard channels never are); `CLEAR ALL`;
`CHANNEL_GRID`; `CLEAR <ch>`; `MIXER <ch> CLEAR`; `SWAP`; `SET … MODE`; a consumer `ADD` or `REMOVE`;
`CLEAR <ch>-<L>` outside this station's own layers, 50–99; `MIXER <ch>-<L> CLEAR` on a layer holding a seated
plate; a Playout route with no layer. A refusal SHALL be answered like a refused command and logged. The one door
that addresses an undeclared channel by design — taking our own recorded stray off air, never in 1–49 — SHALL be
exempt for that exact coordinate only.

#### Scenario: Planted forbidden commands

- **WHEN** `CLEAR 2`, `MIXER 2 CLEAR`, `SWAP`, `SET MODE`, a consumer `ADD` and `CLEAR 2-5` reach the seam
  **THEN** each is refused and nothing reaches CasparCG
- **AND** `CLEAR 2-60` on our own empty layer passes (the control)

#### Scenario: The holder channel

- **WHEN** a command targeting channel 9, the holder, reaches the seam **THEN** it is refused
- **AND** channel 2 passes (the control)

### Requirement: A Playout route SHALL never reach a backup server

A route line SHALL reach the primary only: it SHALL never be mirrored, never journaled, and never sent to a
backup promoted by a failover. While a backup is declared, a row whose seats include a Playout route SHALL say so
on the row and in its Inspector, in its channel's view: `Backup: live boxes not mirrored.` Every other plate SHALL
mirror as before.

#### Scenario: Backup

- **WHEN** a row with a route plate and a stream plate is taken with a backup declared **THEN** no route command
  reaches server B, and the row and its Inspector say the backup line
- **AND** the stream plate mirrors as today, and with no backup declared no row carries the line (the controls)

### Requirement: FIELD-FIXES-01-A SHALL hold for route plates exactly as for any other

A refused route `PLAY` on a fresh take SHALL undo only that take's layers, dropping the route it loaded; a refused
route swap SHALL leave the old working producer on its layer, untouched and still named by the ledger.

#### Scenario: Refusals

- **WHEN** a route's `PLAY` is refused on a fresh take **THEN** the page the take added and the route it loaded
  come off, and nothing else
- **AND** a refused route swap sends no `CLEAR`, and the old stream stays on air and in the ledger
