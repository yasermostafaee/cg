# runtime-playout-sources

## ADDED Requirements

### Requirement: The bridge SHALL send a backup server only a clip the backup's own Playout lists, found by fingerprint

A D11 item's `source` and `fingerprint` (`2.9.1`) SHALL be parsed as optional fields — a `fingerprint` SHALL be
kept only as 64 hexadecimal characters, lower-cased — and a bound clip SHALL carry the fingerprint its last
read gave. With a server B configured, the bridge SHALL look every bound clip's fingerprint up in the BACKUP
Playout's own D11 (`GET /api/cg/media?fingerprint=<v>[,<v>…]`, at most 100 per request, at the address of the
configured Playout with server B's host), and SHALL cache each answer by fingerprint: when a clip is bound,
on the bound-media refresh, and again after server B reconnects. A returned item SHALL count only when its
own `fingerprint` equals the one asked for. A take, a swap and a restore SHALL never wait on this lookup:
they read the cache. A media `PLAY` SHALL go to server A with A's `clip` and to server B with the clip B's
Playout listed for the same fingerprint. When the clip has no fingerprint, B's Playout lists no copy, B's
Playout is older than `2.9.1` (its items carry no fingerprint), or B's list has not been read, server B SHALL
be sent nothing for that plate (neither its `PLAY` nor its transport verbs), the primary SHALL air it as
before, and the row SHALL carry one line: `Backup has no copy of <clip name>; this box stays empty on the
backup`, with the reason in brackets when it is not simply "no copy". A journal replay or a corrective
resend to server B SHALL carry B's own line and never the primary's path.

#### Scenario: The backup's own clip

- **WHEN** a plate is bound to a clip whose fingerprint server B's Playout lists at another path **THEN** the
  take sends server A `PLAY … "<A's clip>"` and server B `PLAY … "<B's clip>"`
- **AND** no line to server B ever carries A's path

#### Scenario: A clip the backup lacks

- **WHEN** server B's Playout lists no item with the clip's fingerprint **THEN** server A airs the clip and
  server B is sent nothing for that plate
- **AND** the row reads `Backup has no copy of <clip name>; this box stays empty on the backup`
- **AND** a clip the backup does list, in the same take, goes to server B with B's own path (the control)

#### Scenario: No fingerprint, and a backup older than 2.9.1

- **WHEN** the primary's D11 gives the clip no fingerprint **THEN** server B is sent nothing for it, with the
  line
- **AND WHEN** server B's Playout answers items that carry no fingerprint at all **THEN** every media plate is
  refused on server B with the line naming `its Playout is older than 2.9.1`

#### Scenario: The take does not wait

- **WHEN** server B's Playout does not answer the lookup **THEN** a take completes within its usual time, and
  server B is sent nothing for the clip

#### Scenario: A failover replay

- **WHEN** a journaled strategy replays to server B **THEN** it replays B's own `PLAY` line, and a plate
  refused on B is not replayed at all

### Requirement: An NDI input marked as a channel's own output SHALL be refused on that channel only

D10's `ownOutputOf: {casparHost, casparChannel}` SHALL be parsed as optional; its host SHALL be joined by the
same rule as D4's (a loopback host names the Playout that listed it). On the channel it names, the picker
SHALL show the input disabled with `Own output of CH n (would loop)` in its `title`, and a take, a look
switch or a swap naming it there SHALL be refused. On every other channel it SHALL be offered as before. An
input without `ownOutputOf` SHALL be offered on every channel: its absence means "unknown", and nothing SHALL
be guessed from its name.

#### Scenario: The own output of channel 2

- **WHEN** an NDI input carries `ownOutputOf` for CH 2 **THEN** a CH 2 row shows it disabled with
  `Own output of CH 2 (would loop)`, and a take naming it on CH 2 is refused with nothing sent
- **AND** on a CH 1 row it is offered and takes (the control)
- **AND** an NDI input with no `ownOutputOf` is offered on both channels (the control)

### Requirement: The Playout's playlist output SHALL be listed as an input under the Playout's own name

D10's per-channel playlist row (`pl-<code>`, a `route` producer with its `layer`, and `playlistOf`) SHALL be
parsed and listed in the Inputs tab under the name D10 gives it. Its layer SHALL be read from D10 and never
assumed. A row with `available: false` SHALL be shown disabled with its reason in words — `not-running`,
`pending-restart`, and `unlicensed`, which also says the Playout clears that channel. It SHALL be offered on
the channels its `compatibleChannels` names, by the one predicate the picker and the bridge share.

#### Scenario: The playlist output in the Inputs tab

- **WHEN** D10 lists `خروجیِ پخش: …` for CH 1 with `route` layer 7 **THEN** the Inputs tab lists it under that
  name, and binding it seats `route://1-7`
- **AND WHEN** the row is `available: false` with `unlicensed` **THEN** it is disabled and its title says the
  Playout clears that channel
