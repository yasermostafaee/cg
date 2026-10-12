# runtime-caspar-bridge

## ADDED Requirements

### Requirement: A resident take whose page is gone SHALL go on by the ADD route

The bridge SHALL treat a `403` answered by the current primary to a resident take's tell (the `CG UPDATE` it sends
before the `CG PLAY` of a page it believes resident) as the core saying the layer holds no page. On that answer it
SHALL forget the row's resident page and SHALL complete the SAME take by the route a take uses for a row with no
resident page: the `CG ADD` with the row's fields, look and recorded timing, then the plates, then the `CG PLAY`.

The take SHALL NOT be refused for it. The bridge SHALL send no command of its own to repair the layer, and SHALL NOT
name a layer that was not on air as cleared outside CG Control. Any other failure of the tell SHALL still be reported
and SHALL NOT re-route the take. A page that is resident SHALL keep the resident route: one `CG UPDATE`, one
`CG PLAY`, no `CG ADD`.

#### Scenario: A stopped multi-frame row after the Playout cleared the channel

- **WHEN** a multi-frame row is stopped, another client sends `CLEAR <channel>`, and the operator presses Play
- **THEN** the take sends `CG UPDATE` (answered `403`), then `CG ADD` carrying the recorded look, then the plates'
  `PLAY`s, then `CG PLAY`, and the page is on air

#### Scenario: A stopped single graphic and a refused one after the clear

- **WHEN** a stopped graphic, and a stopped graphic whose take was refused while the license read `false`, are taken
  after the channel was cleared and the license reads `true`
- **THEN** each take adds its page before its `CG PLAY` and each page is on air

#### Scenario: Finding the layers gone sends nothing and names nothing that was not on air

- **WHEN** the channel is cleared while rows are on air and other rows are stopped
- **THEN** the bridge sends nothing but `INFO` reads, and the cleared-outside notice names only the layers that were
  on air

#### Scenario: A page that was not wiped keeps the resident route

- **WHEN** a stopped row whose page was not cleared is taken
- **THEN** the take sends one `CG UPDATE` and one `CG PLAY` and no `CG ADD`

#### Scenario: Back inside the Playout's window, nothing changes

- **WHEN** the license reads `false` and then `true` with no clear in between
- **THEN** no row leaves air, no resident page is forgotten, no ledger seat is dropped, no notice is raised, and the
  stopped rows take by the resident route

### Requirement: The bridge SHALL log each change of the license it holds

The bridge SHALL write one stderr line, with the time it saw it, each time the license fields a take reads change
(`licensed`, `reason`, `playoutState`, `graceUntil`, `maxChannels`), and one each time D4's `playlist` or
`cgLicensed` changes for a channel. It SHALL write nothing while they do not change. A failed read SHALL NOT count
as a change. No token and no Playout message text SHALL be logged.

#### Scenario: A license that drops and returns

- **WHEN** the license reads `true`, then `false` on three reads, then `true`
- **THEN** exactly three lines are written, one per change

#### Scenario: Unchanged reads

- **WHEN** twelve reads return the same license words
- **THEN** one line is written, for the first read

### Requirement: A run of refused session refreshes SHALL be logged once, then counted

The bridge SHALL log the first refusal of its session refresh in full, SHALL count the repeats of the same refusal
without logging each one, and SHALL log one line with the count and the last refusal's time when the run ends. The
retry, its cadence and the kept token SHALL be unchanged.

#### Scenario: Refused for a while, then accepted

- **WHEN** the Playout refuses the refresh `cg_not_licensed` six times and then accepts it
- **THEN** one refusal line is written, then one line saying it was refused six times and when the last was

## MODIFIED Requirements

### Requirement: The bridge SHALL read the CG license and SHALL refuse a take where CG is not licensed, never clearing anything for it

The bridge SHALL read `GET /api/cg/license` with its own session beside D9, at most once per 60 s while the license
it holds reads `licensed: true`, at most once per 5 s while it reads `licensed: false` (so a license the Playout
restores is held within 5 s, never refusing for a minute what the Playout already allows), and after its own
sign-in. It SHALL keep the last value when the Playout cannot be reached, and SHALL treat `404` as "not served" (no
refusal). No read SHALL be in the path of a verb. D4's `cgLicensed` SHALL be parsed per channel. Both SHALL be pushed
to every console. A take on a channel where `licensed` is `false`, or where that channel's `cgLicensed` is `false`,
SHALL be refused before anything is sent, with the Playout's `message` (or, when it gives none, `CG Control is not
licensed on CH n in the Playout — nothing was sent.`). A `CLEAR` or `STOP` of our own layers SHALL still be sent, and
nothing on air SHALL be cleared by the bridge because of a license state. When a layer of ours is found cleared while
D4 says the channel's `playlist` is `unlicensed`, its notice SHALL name the cause.

#### Scenario: CG not licensed on a channel

- **WHEN** the license reads `licensed: false` **THEN** a take on CH 2 is refused with the Playout's message
  and nothing is sent
- **AND** a `CLEAR` of our own layer on CH 2 is sent, and nothing on air is cleared by us

#### Scenario: A cap of one channel

- **WHEN** D4 reads `cgLicensed: true` on CH 1 and `false` on CH 2 **THEN** a take on CH 1 goes on air and a take
  on CH 2 is refused

#### Scenario: The Playout unreachable

- **WHEN** the Playout stops answering after the license read `licensed: false` **THEN** takes stay refused
- **AND** a licensed channel takes (the control)

#### Scenario: Cleared by the Playout's license

- **WHEN** our layer is cleared from outside while D4 says `playlist: "unlicensed"` for its channel **THEN**
  the notice names `Cleared by the Playout: its license`

#### Scenario: The Playout says licensed again

- **WHEN** the held license reads `licensed: false` and the Playout starts answering `licensed: true`
- **THEN** the bridge holds `licensed: true` within 5 s

#### Scenario: While licensed, the cadence is the minute

- **WHEN** the license reads `licensed: true` for five minutes
- **THEN** the bridge reads it five times
