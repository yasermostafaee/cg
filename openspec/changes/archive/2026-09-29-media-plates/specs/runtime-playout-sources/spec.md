# runtime-playout-sources

## ADDED Requirements

### Requirement: A bound clip SHALL carry its two playback settings on its bound-media reference

Every bound media reference SHALL carry `loop` (default off) and `whenHidden` (`pause` by default, or `restart` or
`continue`), station-wide: a new reference SHALL be written with the defaults, a reference bound before the settings
existed SHALL read as the defaults, and a re-read of the item from the Playout SHALL keep the settings the station
set. The catalogue SHALL carry them on the entry's `media`, and every reader SHALL read them through one function.

#### Scenario: Defaults, kept across a re-read

- **WHEN** a clip is bound **THEN** its reference carries `loop: false` and `whenHidden: 'pause'`
- **AND** after its settings are changed, a re-read of the item from the Playout keeps them
- **AND** a reference persisted without them reads as the defaults

### Requirement: One operator route SHALL set a bound clip's playback, audited with its name

`sources.set-media-playback { mediaId, loop, whenHidden }` SHALL write both settings on the clip's reference,
persist them and publish the catalogue. It SHALL be operator-class, SHALL name no channel, and SHALL be refused
under a lock that covers a channel. A `mediaId` naming no bound clip SHALL be refused with `unknown-media` and
change nothing. Every outcome SHALL be audited as `set-media-playback` with the clip's name.

#### Scenario: Set, published, audited

- **WHEN** an operator sets a bound clip to Loop on and Keep playing **THEN** the catalogue's entry carries both,
  and the audit names the clip
- **AND** a viewer is refused, and an id that names no bound clip is refused with `unknown-media`
