## ADDED Requirements

### Requirement: The channel strip lists the station's channels under the Playout's names

The channel strip SHALL list the channels the bridge's discovery answer marks `declared`, once that answer has arrived, and SHALL fall back to the fixed bank and channel settings until it has, or when it declares none. A channel the answer names but the station does not declare SHALL NOT be on the strip, whatever the principal is granted. A listed channel that a catalogue row names SHALL be labelled with that name, isolated in its own `<bdi>` with any read-only or locked suffix outside it, and SHALL carry its channel number on the tab's title. An unnamed channel SHALL keep its `CHANNEL <n>` label.

#### Scenario: The station's channel under the catalogue's name

- **GIVEN** a station on channel 2 whose catalogue names channel 2
- **WHEN** an operator of channel 2 signs in
- **THEN** the strip's one tab reads the catalogue's name, not `CHANNEL 2`, with `Channel 2` as its title

#### Scenario: The Playout's programme channel is not offered

- **GIVEN** the same station, a catalogue also naming channel 1, and a principal granted channels 1 and 2
- **WHEN** that principal signs in
- **THEN** the strip carries channel 2 under its name, and no tab for channel 1

#### Scenario: A read-only suffix stays outside the name

- **WHEN** a viewer sees the station's named channel
- **THEN** its tab reads the name followed by ` · READ ONLY`, and only the name is inside the isolate

#### Scenario: No catalogue, no change

- **WHEN** no catalogue name has arrived
- **THEN** the tab reads `CHANNEL <n>` exactly as before
