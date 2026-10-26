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

### Requirement: The Playout's playlist output SHALL be listed as an input under the Playout's own name

D10's per-channel playlist row (`pl-<code>`, a `route` producer with its `layer`, and `playlistOf`) SHALL be
parsed and listed in the Inputs tab under the name D10 gives it. Its layer SHALL be read from D10 and never
assumed. A row with `available: false` SHALL be shown disabled with its reason in words — `not-running`,
`pending-restart`, and `unlicensed`, which also says the Playout clears that channel. It SHALL be offered on
the channels its `compatibleChannels` names, by the one predicate the picker and the bridge share.

Inside the Inputs tab, every row carrying `playlistOf` SHALL precede every row without it. The partition
SHALL be stable: Playlist rows SHALL keep their D10 order among themselves, and all remaining inputs SHALL
keep their D10 order. An unavailable Playlist row SHALL remain first but disabled with its existing reason.
The separate `None` choice, Media tab, availability and compatible-channel behaviour SHALL NOT change.

The anchored SourcePicker panel shared by the Inputs and Media tabs SHALL opt into the Popover's `raised`
visual variant. That variant SHALL use only the existing raised-surface, strong-border and menu-shadow
tokens so the picker is visibly distinct from the surface beneath it. It SHALL paint no scrim and SHALL NOT
change the panel's size or placement, its source and selection behaviour, or its focus, Tab, Escape and close
contracts.

#### Scenario: The playlist output in the Inputs tab

- **WHEN** D10 lists `خروجیِ پخش: …` for CH 1 with `route` layer 7 **THEN** the Inputs tab lists it under that
  name, and binding it seats `route://1-7`
- **AND WHEN** the row is `available: false` with `unlicensed` **THEN** it is disabled and its title says the
  Playout clears that channel

#### Scenario: The playlist output leads the Inputs list

- **WHEN** D10 lists ordinary inputs before a `pl-<code>` row **THEN** the Playlist output is the first row
  inside Inputs
- **AND** multiple Playlist outputs keep their D10 order
- **AND** every remaining input keeps its prior relative order
- **AND** an unavailable Playlist output remains first and disabled with its reason

#### Scenario: Inputs and Media are visibly raised without becoming modal

- **WHEN** a SourcePicker opens on either the Inputs or Media tab
- **THEN** its panel uses the existing raised surface, strong border and menu shadow
- **AND** no scrim is painted and its size and placement are unchanged
- **AND** source selection, focus, Tab, Escape, outside-press, scroll/resize close and focus-restoration
  behaviour are unchanged
