## ADDED Requirements

### Requirement: The bridge never clears a whole channel's mixer and never batches with BEGIN

The bridge SHALL NOT send a channel-wide `MIXER <ch> CLEAR` on any path: every `MIXER … CLEAR` it sends
SHALL name a layer (`MIXER <ch>-<layer> CLEAR`), because a channel-wide clear resets every layer's transform to
full opacity and volume — revealing and un-muting every seated, hidden plate — and wipes the Playout's own layer
gain. The bridge SHALL NOT use AMCP `BEGIN … COMMIT` batching, which is not frame-aligned on this core; its
`MIXER … DEFER` lines and their `MIXER <ch> COMMIT` SHALL go out outside any such batch.

#### Scenario: No channel-wide mixer clear exists

- **WHEN** the bridge's source is scanned for the text of every `MIXER … CLEAR` line it can build
- **THEN** the only one is the layer-scoped `MIXER <ch>-<layer> CLEAR`
- **AND** that builder still produces `MIXER 1-80 CLEAR` for a bank row (the control)

#### Scenario: No BEGIN batch exists

- **WHEN** the bridge's source is scanned for an AMCP `BEGIN` or `DISCARD` literal
- **THEN** none is found, while the same scan finds the `MIXER <ch> COMMIT` it builds (the control)

### Requirement: A look switch airs all of its new look or none of it

A look switch SHALL seat every plate its new look needs, and every fresh preset, BEFORE the page is told
anything, so that a refused plate refuses the switch with the page untouched and nothing on air changed. Each
such plate SHALL be seated through the seat step (hidden, committed, then `PLAY`), in one named place that later
work (`ROUTE-PLATES-01`'s `LOADBG` → `PLAY`) extends. On a refused required plate the bridge SHALL undo only what
the switch seated, through `mayClearAfterRefusal` — a plate whose `PLAY` landed is cleared, one whose `PLAY` was
refused seated nothing and is not — and SHALL send no page `UPDATE` and no further `MIXER COMMIT`; the row SHALL
keep its old look and carry the refusal as its `takeRefusal`, `FIELD-FIXES-01`'s one line naming the plate's
source, and the reply SHALL say `refusalOnRow`. On success the switch SHALL run as before, with each pre-seated
plate revealed in the switch's one `MIXER <ch> COMMIT`, and SHALL withdraw the row's line. A plate whose layer
already carries a producer of ours (an in-place replace) SHALL keep the in-switch path.

#### Scenario: Refused 1 → 2

- **GIVEN** a row on air on look 1, whose look-2 plate is not seated
- **WHEN** the operator switches to look 2 and CasparCG refuses that plate's `PLAY`
- **THEN** the wire carries only the plate's hide, one `MIXER <ch> COMMIT` and the refused `PLAY` — no page
  `UPDATE` and no further `MIXER COMMIT` — plate 1 receives nothing, the refused plate's layer is not cleared, and
  the row stays on look 1 with the line naming the plate's source

#### Scenario: Refused 1 → 3, plate 2 lands and plate 3 is refused

- **WHEN** a switch's pre-seat lands plate 2 and CasparCG refuses plate 3
- **THEN** plate 2 is cleared and only plate 2, and nothing else moves

#### Scenario: Every plate accepted (the control)

- **WHEN** every plate the new look needs is accepted
- **THEN** every pre-seat `PLAY` is answered before the page `UPDATE`, the new plates are revealed in the one
  commit after it, the row is on the new look, and a line a refused switch left is withdrawn

#### Scenario: Held plates

- **WHEN** every plate the new look shows is already seated and held
- **THEN** the switch sends no `PLAY` and no `OPACITY`

### Requirement: Every plate is seated hidden and revealed in its action's one commit

The bridge SHALL seat every plate hidden when its layer carries no producer of ours — on a take, a switch, a
swap or a restore: stage `MIXER <L> OPACITY 0`, `VOLUME 0` and the plate's fit as `DEFER`, send one
`MIXER <ch> COMMIT` and wait for it, and only then send the `PLAY`; a hide that did not land SHALL send no
`PLAY`. The reveal SHALL ride the action's one commit: `OPACITY 1` and the plate's volume as today's code
computes it — a parked seat muted, every other plate at its recorded intent, and never a fixed value. A take
refused at a plate SHALL stage no reveal. A `PLAY` onto a layer that already carries a producer of ours (an
in-place replace) SHALL NOT be hidden first, because hiding it would take a working picture off air before the
replace is known to land.

#### Scenario: Hidden before PLAY

- **WHEN** a take, a switch, or a swap onto a fresh layer seats a plate
- **THEN** that layer's `OPACITY 0` and `VOLUME 0` are committed before its `PLAY`, and its `OPACITY 1` follows
  it
- **AND** the page layer's own take order is unchanged (the control)

#### Scenario: An in-place replace is not hidden

- **WHEN** a swap or a restore replaces the producer on a layer that carries one of ours
- **THEN** no `OPACITY 0` precedes its `PLAY`, and a refused one leaves the working picture on air

#### Scenario: The reveal restores the desired volume

- **WHEN** a plate whose intent is 0 and a plate raised to 1 are seated
- **THEN** the first is revealed at 0 and the second at 1

### Requirement: After an AMCP reconnect the first DEFER set carries our full plate mixer state

The bridge SHALL re-send its full plate mixer state after every AMCP reconnect: once the primary's session
reaches `healthy` on a new connection, and after committing any orphaned batch, each row's plate layers in CG's
bands (layer 50 and up) — `FILL`, `CLIP`, the volume as today's code computes it and `OPACITY 1`, all `DEFER` —
followed by that row's one `MIXER <ch> COMMIT`, under the row's seat lock. It SHALL send nothing for a layer below
50, and an ordinary switch SHALL send only its own deltas. A reconnect of the backup alone is not re-sent: that
needs a per-session send the runtime does not have.

#### Scenario: The first commit after a reconnect

- **WHEN** the AMCP connection drops and is restored with two plates seated
- **THEN** the first commit after the new handshake is preceded by each plate's `FILL`, `CLIP`, `VOLUME` and
  `OPACITY`, and nothing is left staged
- **AND** an ordinary switch before it sent no `OPACITY` at all (the control)

#### Scenario: Nothing below layer 50

- **GIVEN** a plate band that straddles the floor, with plates on layers 49 and 50
- **WHEN** the connection is restored
- **THEN** layer 50 is re-sent and layer 49 receives nothing

#### Scenario: The backup's journal replay keeps the order

- **WHEN** a switch runs under `journal-replay` and the bridge fails over
- **THEN** the backup receives the switch's hide, commit, `PLAY`, page `UPDATE`, reveal and commit in exactly the
  primary's order

### Requirement: A plate layer's mixer is reset only after its CLEAR landed

The bridge SHALL send `MIXER <ch>-<L> CLEAR` on a plate layer only after that layer's `CLEAR` was acknowledged on
the primary, at every site that tears a plate down (the refusal clean-up, the end-of-apply sweep and
`teardownLiveLayers`), because a `MIXER CLEAR` on a layer that still holds a plate reveals and un-mutes it at
full frame.

#### Scenario: A refused CLEAR

- **WHEN** a row is taken out and CasparCG refuses one plate layer's `CLEAR`
- **THEN** that layer receives no `MIXER CLEAR`, while the plate whose `CLEAR` landed does (the control)
