# runtime-playout-sources

## REMOVED Requirements

### Requirement: The bridge SHALL parse contract v1.3's shapes and SHALL NOT seat a `route` input before ROUTE-PLATES-01

**Reason**: `ROUTE-PLATES-01` seats a Playout route by contract v1.3's rules, and removes the one gate this
requirement named ("Not supported yet."). Replaced by "The bridge SHALL parse contract v1.3's shapes, and a
route input with a layer SHALL be bindable" below; how a route is seated is `runtime-caspar-bridge`'s.

## ADDED Requirements

### Requirement: The bridge SHALL parse contract v1.3's shapes, and a route input with a layer SHALL be bindable

The bridge SHALL keep every input of a D10 answer without `epoch`, and SHALL store an `epoch` with the list
digit for digit — a 64-bit integer SHALL never be rounded. A `route` input SHALL parse with its `channel`,
required `layer`, `videoMode`, `compatibleChannels`, `available` and `reason`, and SHALL join channels by the
same rule as D4. A `route` with a `layer` SHALL be an ordinary bindable input; one with no `layer` SHALL be
unusable. D4's `videoMode` (which may be `null`) and `pendingRestart` SHALL be parsed and published, and a
`null`, missing or unknown value SHALL never void a channel's row or its name.

#### Scenario: The two route inputs

- **WHEN** D10 lists `ورودی ۳` and `ورودی ۴` as `route` inputs **THEN** both parse; `ورودی ۳` binds, and
  `ورودی ۴` carries the Playout's own `unavailable` with its reason
- **AND** a `route` with no `layer` is unusable
- **AND** the NDI and stream inputs bind and play (the control)

#### Scenario: Old and new D10

- **WHEN** D10 carries no `epoch` **THEN** every input is kept
- **AND** a D10 with an `epoch` stores it (the control)

#### Scenario: A 64-bit epoch

- **WHEN** D10 carries `"epoch": 638954123456789013` **THEN** the catalogue's epoch reads `638954123456789013`
- **AND** the next core's `638954123456789014` reads different (a plain JSON parse rounds both to one value)

#### Scenario: A D4 channel the core does not have yet

- **WHEN** a D4 row carries `videoMode: null` and `pendingRestart: true` **THEN** the channel and its name are kept

## MODIFIED Requirements

### Requirement: An input SHALL be offered per channel by its compatible channels

An input whose `compatibleChannels` does not include the channel of the row being bound SHALL be shown disabled with
`Not available on CH n` in its `title`, never hidden. A Playout `route` whose `compatibleChannels` names none of this
station's channels SHALL be offered on none. The picker and the bridge's refusal SHALL ask the one predicate.

#### Scenario: Channel 2

- **WHEN** a channel 2 row is bound **THEN** `ورودی ۴` is disabled with `Not available on CH 2`
- **AND** on a channel 1 row it is not disabled for that reason (the control)

#### Scenario: A route that names no channel of this station

- **WHEN** a Playout route's `compatibleChannels` names none of this station's channels **THEN** it is disabled on
  every row
- **AND** a hand-made entry or a D10 stream that names no channels is offered everywhere, as before (the control)
