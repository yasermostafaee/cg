# runtime-caspar-bridge

## ADDED Requirements

### Requirement: An unavailable target binding SHALL be refused before an on-air source change can alter state

Before an on-air Update, live-source swap or look switch changes any state, the bridge SHALL validate the source
requested by every new or changed frame that action puts in force. An Update or live-source swap SHALL compare its
prospective binding state with the state in force and SHALL atomically refuse a new or changed unseatable source. A
look switch SHALL validate every frame
of the destination look, including a `plateId` already punched by the outgoing look; the punched plate satisfies the
destination only when that destination frame resolves to a seatable source. The bridge SHALL use its canonical
seatable predicate and `source-unavailable` / `source-unusable` result, and SHALL name `Plate N`, the source and its
reason. Refusal SHALL happen before source, mixer or page wire and SHALL leave fields, bindings, active look, pictures,
fits, geometry and the live-layer ledger unchanged. This strict destination validation SHALL NOT make an unrelated
invalid frame block a live emergency repair.

#### Scenario: Update on air is one atomic action

- **GIVEN** Plate 1 is on air on source A
- **WHEN** one Update carries text edits and changes Plate 1 to unavailable source B
- **THEN** the reply is `source-unavailable`, no AMCP is sent, the text and binding stay as before, source A remains
  on air, and the refusal names Plate 1, source B and B's reason

#### Scenario: A destination look replaces the punched Playlist plate with an unavailable source

- **GIVEN** a single-box look is on air with shared `l1` resolved to the healthy Playlist output full-screen
- **AND** a two-box destination look also contains `l1`, but resolves it to unavailable source B while its other
  plate resolves normally
- **WHEN** the operator switches to the two-box look
- **THEN** the switch is refused with `source-unavailable` before every page, mixer and producer command; the single
  look stays active, Playlist remains its unchanged full-screen picture, its fit, geometry and ledger are unchanged,
  the valid second frame is not partly applied, and the row's line names Plate 1, source B and B's reason

#### Scenario: A newly shown unavailable plate is the existing control

- **GIVEN** the shared punched plate keeps the healthy Playlist output in both looks
- **AND** the two-box destination's newly shown or held plate is unavailable
- **WHEN** the operator switches to the two-box look
- **THEN** the existing destination-plate gate refuses the switch before the page changes (the control)

#### Scenario: No partial two-box layout

- **WHEN** either requested source of a two-box destination is unavailable
- **THEN** neither target picture or target geometry is applied, the page is not told, and the previous composition
  remains whole

#### Scenario: An unrelated invalid frame does not block a live repair

- **GIVEN** a frame outside the action's destination is invalid
- **WHEN** the operator performs a live source repair on another plate
- **THEN** that unrelated frame alone does not refuse the repair (the control)

#### Scenario: The repair target itself is unavailable

- **GIVEN** a row owns live seats
- **WHEN** an emergency source swap targets a listed unavailable source
- **THEN** the swap is refused with `source-unavailable` before its override or any wire changes, and the previous
  source remains in force
