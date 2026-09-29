# runtime-caspar-bridge

## ADDED Requirements

### Requirement: A media clip SHALL follow its own When hidden when a look hides its plate

A clip whose `whenHidden` is `pause` or `continue` SHALL be held — seated, muted and hidden — when a look does not
show its plate, and a clip whose `whenHidden` is `restart` SHALL be torn down as every clip was before. Hiding a
held clip SHALL be `OPACITY 0` and its mute, staged with its park into the switch's one `MIXER <ch> COMMIT`; a
`pause` clip SHALL then be sent `PAUSE` right after that commit; a `continue` clip SHALL be sent nothing more.
Showing it again SHALL be its reveal (`OPACITY 1`) and its declared volume in the switch's one commit, with a
`RESUME` sent just before that commit for a clip the hide paused; a clip the OPERATOR paused SHALL stay paused.
No `CLEAR` SHALL reach a held clip, and a switch refused after a `RESUME` SHALL pause the clip again.

#### Scenario: Pause — two boxes to one, and back

- **WHEN** a two-box look showing a clip in box 2 is switched to a one-box look **THEN** the clip's layer gets
  `OPACITY 0` and `VOLUME 0` in the switch's committed batch, then `PAUSE`, and no `CLEAR`
- **AND** switching back sends `RESUME` and the clip's declared volume on the same layer, before the commit that
  reveals it, and no `PLAY`
- **AND** the clip's reported time stood still while it was hidden

#### Scenario: Restart — the control

- **WHEN** the clip's `whenHidden` is `restart` **THEN** hiding it sends `CLEAR` and `MIXER CLEAR` for its layer,
  and switching back sends a fresh `PLAY` of the clip

#### Scenario: Continue

- **WHEN** the clip's `whenHidden` is `continue` **THEN** hiding it sends `OPACITY 0` and the mute only, with no
  `PAUSE` and no `CLEAR`, and showing it sends only the reveal
- **AND** the same switch with `pause` sends the `PAUSE` (the control)

#### Scenario: An operator's pause survives a look

- **WHEN** the operator paused the clip and a look hides it and shows it again **THEN** no `RESUME` is sent and it
  stays paused

### Requirement: A clip SHALL play with LOOP when its Loop is on, and SHALL freeze on its last frame when it is not

A clip SHALL be played with the bare `LOOP` flag when its `loop` is on, and without it when it is off. A change of
`loop` SHALL reach every seated clip of that media at once with `CALL <ch>-<L> LOOP 1|0`; a change of `whenHidden`
SHALL send nothing. Nothing SHALL be sent at the end of a clip that is not looping: 2.5.0's ffmpeg producer holds
its last frame, and the plate stays seated.

#### Scenario: Loop on and off

- **WHEN** a clip with Loop on is taken **THEN** its `PLAY` ends with `LOOP`
- **AND** with Loop off its `PLAY` carries no `LOOP` (the control)

#### Scenario: A Loop change on air

- **WHEN** the operator turns Loop on for a clip already playing **THEN** `CALL <ch>-<L> LOOP 1` is sent to its
  layer, and turning it off sends `CALL <ch>-<L> LOOP 0`
- **AND** a `whenHidden` change alone sends nothing

#### Scenario: The freeze at the end

- **WHEN** a clip that is not looping reaches its end **THEN** nothing is sent to its layer, its producer is still
  the clip, and its state reads ended with no time left
- **AND** the same clip looping is never ended — past its end it has wrapped round (the control)

### Requirement: The bridge SHALL offer Play, Pause and Restart for a media plate of an on-air row

`stack.media-plate-transport` SHALL send `PAUSE` for `pause`, `RESUME` for `play`, and `CALL <ch>-<L> SEEK 0`
then `RESUME` for `restart` (a clip a look hid and paused is rewound and stays paused for the look that shows it).
It SHALL be refused with nothing sent for a plate whose seat is not a clip, a plate that is not seated, and a row
that is not on air. It SHALL be operator-class, scoped to the row's channel, refused under the lock, and every
outcome SHALL be audited as `media-transport` with the clip's name.

#### Scenario: The three presses

- **WHEN** the operator presses Pause, Play and Restart on an on-air clip **THEN** `PAUSE`, `RESUME`, and
  `CALL <ch>-<L> SEEK 0` then `RESUME` are sent, each audited with the clip's name

#### Scenario: Refused, nothing sent

- **WHEN** the press is for a live-input plate, a plate not seated, or a row not on air **THEN** it is refused
  with `not-media`, `not-seated` or `not-on-air`, and nothing reaches the wire
- **AND** a viewer, an operator without the row's channel, and a locked console are refused by the gate
- **AND** an operator with the channel's grant on the on-air row is accepted and the `PAUSE` is sent (the
  control)

### Requirement: The bridge SHALL publish each seated clip's remaining time from OSC only

`liveLayers.media-state` SHALL list every seated clip — its row, plate, channel and layer, its remaining time,
whether it is paused, ended and looping — and SHALL be pushed when what a console shows would change: a whole
second, a pause, an end. The remaining time SHALL come from the server's `file/time` report on the primary, fresh
within the OSC window, and SHALL be absent whenever there is none; it SHALL never be estimated.

#### Scenario: With and without the server's report

- **WHEN** the server reports the clip's time **THEN** its remaining time is published and pushed as it changes
- **AND** with no report the clip is still listed and carries no remaining time (the control)

### Requirement: A held clip SHALL keep its band layer exactly as a held live input does

A held clip SHALL stay in the ledger and SHALL occupy its band layer, so a seat that needs a layer the band no
longer has SHALL be refused with `live-source-no-layer` exactly as it is while a live input is held; a clip set to
`restart` SHALL free its layer when a look hides it.

#### Scenario: A full band

- **WHEN** a two-layer band holds a hidden clip and a second row needs a layer **THEN** its take is refused with
  `live-source-no-layer`, and the same with a held live input
- **AND** with the clip set to `restart` the second row is taken (the control)

### Requirement: The send seam SHALL let PAUSE, RESUME and CALL reach only a seated clip of ours

The AMCP send seam SHALL refuse, and send nothing for, a `PAUSE`, `RESUME` or `CALL` addressed to any coordinate
where the ledger holds no media clip of ours — a live input, a Playout route, an empty layer, or a whole channel.
The ledger SHALL name a clip before anything is sent to pause it.

#### Scenario: Only a clip is paused

- **WHEN** a `PAUSE`, `RESUME` or `CALL` is addressed to a layer carrying a live input, or to a channel **THEN** it
  is refused with nothing sent
- **AND** the same lines to a seated clip's own layer are sent (the control)

#### Scenario: A preset clip

- **WHEN** a take seats a `pause` clip that only a look nobody is showing binds **THEN** it is seated hidden, and
  paused after the take's commit
- **AND** the look that shows it resumes it, with no second `PLAY`

### Requirement: A live-input plate's hold, release and wire SHALL be byte-identical to before

Every line a take, a hold and a release send for a live-input plate SHALL be exactly what they were before this
change: no `OPACITY`, `PAUSE`, `RESUME` or `CALL` for a live input that is not a Playout route.

#### Scenario: Measured against the tree before the change

- **WHEN** two live inputs are taken in a two-box look, switched to one box and back **THEN** every plate-layer
  line equals the recording made against the tree before this change

## MODIFIED Requirements

### Requirement: After an AMCP reconnect the first DEFER set carries our full plate mixer state

The bridge SHALL re-send its full plate mixer state after every AMCP reconnect: once the primary's session
reaches `healthy` on a new connection, and after committing any orphaned batch, each row's plate layers in CG's
bands (layer 50 and up) — `FILL`, `CLIP`, the volume as today's code computes it and the opacity as today's code
computes it (`OPACITY 1` for a plate on screen, `OPACITY 0` for a held Playout route or a held clip), all
`DEFER` — followed by that row's one `MIXER <ch> COMMIT`, under the row's seat lock. It SHALL send nothing for a
layer below 50, and an ordinary switch SHALL send only its own deltas. A reconnect is mixer state only: no clip is
re-played, paused or resumed by it. A reconnect of the backup alone is not re-sent: that needs a per-session send
the runtime does not have.

#### Scenario: The first commit after a reconnect

- **WHEN** the AMCP connection drops and is restored with two plates seated
- **THEN** the first commit after the new handshake is preceded by each plate's `FILL`, `CLIP`, `VOLUME` and
  `OPACITY`, and nothing is left staged
- **AND** an ordinary switch before it sent no `OPACITY` at all (the control)

#### Scenario: A held clip stays hidden

- **WHEN** the connection drops and is restored while a clip is held and paused
- **THEN** its layer is re-sent `OPACITY 0` and muted, it is neither re-played nor resumed, and the plate on
  screen is re-sent `OPACITY 1` (the control)

#### Scenario: Nothing below layer 50

- **GIVEN** a plate band that straddles the floor, with plates on layers 49 and 50
- **WHEN** the connection is restored
- **THEN** layer 50 is re-sent and layer 49 receives nothing

#### Scenario: The backup's journal replay keeps the order

- **WHEN** a switch runs under `journal-replay` and the bridge fails over
- **THEN** the backup receives the switch's hide, commit, `PLAY`, page `UPDATE`, reveal and commit in exactly the
  primary's order
