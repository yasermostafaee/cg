## ADDED Requirements

### Requirement: Playout topology monitors use channel-scoped verified return mappings

CG Bridge SHALL discover Playout links for a declared channel only after authorizing that
logical channel. A reserve SHALL receive a return relay only after its catalogue verifies the
reciprocal channel link and its own physical output. Discovery SHALL use read-only requests.
Picture and sound SHALL each use a ticket for the selected mapping. If a mapping expires or
changes, the previous mapping's ticket SHALL open no replacement stream.

#### Scenario: A linked reserve changes its physical channel

- **WHEN** the reserve confirms a new physical output number or withdraws the previous link
- **THEN** CG Bridge closes viewers of the former mapping
- **AND** a ticket for the former mapping opens no stream

#### Scenario: A discovered engine belongs to another channel

- **WHEN** an engine is discovered on the network but has no verified link to the selected channel
- **THEN** its programme picture and sound are not added to that channel's return relays
