# runtime-caspar-bridge

## ADDED Requirements

### Requirement: A box showing the Playout's playlist output SHALL always be at volume 0, and no command SHALL reach the playlist's layer

A plate whose source is a D10 playlist row SHALL be seated by the route pattern (hidden at `VOLUME 0`,
`LOADBG`, at least 40 ms, `PLAY`, reveal) on exactly `route://N-L`, L read from D10. Every volume the bridge
sends for it — the seat, the reveal, a reconnect's re-send, a hold and an unhold — SHALL be 0, and a raise
(ON, a fader, SOLO) SHALL be refused with `Programme sound is already on air`. The send guard SHALL refuse
every targeted command (`PLAY`, `LOAD`, `LOADBG`, `STOP`, `CLEAR`, `PAUSE`, `RESUME`, `CALL`, `MIXER`, `CG`) to
a layer outside 50–99 that the station's own configuration does not declare, and SHALL refuse any targeted
command to a playlist's layer L even then; a Playout route line with `NEXT`, `BACKGROUND` or `BUFFER` SHALL be
refused. The reveal SHALL come no sooner than two frames of the channel's rate (and never under 80 ms) after
the last route `PLAY`'s reply, so it takes effect at least one full frame after the `PLAY` did.

#### Scenario: The playlist box's wire

- **WHEN** a plate bound to CH 1's playlist output (layer 7 in D10) is taken on CH 1 **THEN** the wire carries
  `LOADBG 1-<plate> "route://1-7"` and `PLAY 1-<plate>`, with `VOLUME 0` committed before them
- **AND** no line on the wire targets `1-7`
- **AND** after an AMCP reconnect the plate's `VOLUME` re-sent is 0

#### Scenario: A raise is refused

- **WHEN** a console asks ON or a fader of 0.8 for the playlist plate **THEN** the bridge refuses it with
  `Programme sound is already on air`, and no `VOLUME` above 0 is sent
- **AND** a camera route plate on the same page is raised (the control)

#### Scenario: The guard

- **WHEN** a line `MIXER 1-7 VOLUME 1`, `PLAY 1-7 …` or `STOP 1-7` reaches the send seam **THEN** it is refused
  and nothing is sent
- **AND** a route line carrying `NEXT`, `BACKGROUND` or `BUFFER` is refused
- **AND** a line to our own layer 60 is sent (the control)

#### Scenario: The reveal's timing

- **WHEN** a route plate is revealed on a 25 fps channel **THEN** the reveal's `COMMIT` is sent at least 80 ms
  after the last route `PLAY`'s reply, and at a 24 fps rate at least 2 × 41.7 ms after it

### Requirement: The bridge SHALL read the CG license and SHALL refuse a take where CG is not licensed, never clearing anything for it

The bridge SHALL read `GET /api/cg/license` with its own session beside D9, at most once per 60 s and after
its own sign-in, SHALL keep the last value when the Playout cannot be reached, and SHALL treat `404` as "not
served" (no refusal). D4's `cgLicensed` SHALL be parsed per channel. Both SHALL be pushed to every console. A
take on a channel where `licensed` is `false`, or where that channel's `cgLicensed` is `false`, SHALL be
refused before anything is sent, with the Playout's `message` (or, when it gives none, `CG Control is not
licensed on CH n in the Playout — nothing was sent.`). A `CLEAR` or `STOP` of our own layers SHALL still be
sent, and nothing on air SHALL be cleared by the bridge because of a license state. When a layer of ours is
found cleared while D4 says the channel's `playlist` is `unlicensed`, its notice SHALL name the cause.

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

### Requirement: CG Bridge SHALL relay the programme's sound and the Playout's meters, and SHALL never put a token in a URL

CG Bridge SHALL serve `/pgm/<n>/sound` on its control port behind a short-lived ticket issued for that
channel's SOUND (a picture ticket SHALL NOT open it, nor a sound ticket the picture), readable cross-origin, as
`application/octet-stream` and with no `.wav` in its path (a download manager's browser hook captures a `.wav`
URL of type `audio/wav` and answers the page an empty `204`). It SHALL read the core's `GET /audio.wav` on
`9250 + n − 1` by the well-behaved-client rule (one request, then nothing; one upstream per channel shared by
every listener; closed 1.5 s after the last listener; a silent stream closed and redialled; an increasing
backoff), and every listener SHALL receive the core's 44-byte WAV header once and then whole 4-byte frames, a
slow listener skipping chunks rather than queueing them. CG Bridge SHALL read `GET /api/cg/meters` ONCE, with
its own session (a console's token only until it has one, reopening the stream when its own arrives), by a
streaming request with the bearer in `Authorization` (never `EventSource`, never the token in the URL),
reconnecting when the stream closes or falls silent, and only while at least one console is connected. Each
`audio` and `loudness` event SHALL be joined to this station's channel by the D10 reader's join and relayed
over the control socket only to consoles whose sign-in holds that channel.

#### Scenario: One Playout stream for three consoles

- **WHEN** a console granted CH 1, a console granted CH 2 and a console granted both are connected **THEN** the
  Playout sees one meters stream, the first two receive only their own channel's events, and the third both
- **AND** every meters request carries the bearer in `Authorization` and no query at all
- **AND WHEN** the stream closes **THEN** CG Bridge reads it again; **AND WHEN** the core is down **THEN** the
  relayed levels are the floor
- **AND WHEN** the last console leaves **THEN** the stream is released

#### Scenario: The sound relay

- **WHEN** two consoles listen to CH 1's sound **THEN** the core sees one `GET /audio.wav`, and each listener's
  stream begins with the 44-byte header followed by whole frames, even when the core's writes split a frame
- **AND** a sound ticket opens `/pgm/1/sound` only, and a picture ticket does not open it
