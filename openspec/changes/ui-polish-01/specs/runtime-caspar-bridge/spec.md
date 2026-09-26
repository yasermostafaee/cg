## ADDED Requirements

### Requirement: The bridge reads the Playout's channel states at most every 5 seconds and publishes them beside the names

The bridge SHALL read the Playout's D4 channel list no more often than every 5 seconds — one named
constant, with `If-None-Match` — and SHALL publish each row's optional `output` (`on-air` | `off` |
`unknown`) and optional `playlist` (the Playout's word) with its name. A value it does not know
SHALL be published as unknown for `output` and verbatim for `playlist`; a failed read SHALL publish
no state at all (the row is absent), never a stale one. The bridge SHALL never infer either fact
from CasparCG's layers. Opening first-run's channel step or `Change channel…` MAY trigger one extra
read, never closer than 5 seconds to the last.

#### Scenario: The floor holds

- **WHEN** the catalogue is polled for a minute
- **THEN** no two reads are closer than 5 seconds, and a 304 keeps what the bridge holds

#### Scenario: State rides with the name

- **WHEN** the Playout reports channel 1 `on-air` / `playing` and channel 2 `off` / `stopped`
- **THEN** the published channel list carries those values beside each channel's name
