## ADDED Requirements

### Requirement: PVW SHALL let the operator check one live input without changing rehearsal or air

CG Control SHALL offer `Check input` for one Playout live source from the PVW workflow and from each eligible Inputs
row in Source defaults. Both actions SHALL target one live-input card in PVW, labelled with the source's canonical
name and channel. Starting it from Source defaults SHALL leave that dialog open and SHALL NOT select, save or apply
the source, alter any dirty draft, or change the rehearsing row.

The card SHALL be separate from the rehearsal iframe and Live Source placeholders. It SHALL NOT composite the live
picture into a plate, change the retained page, trigger Play/Take/Update, or imply that the checked picture is PGM.

#### Scenario: A check started while editing defaults

- **WHEN** the operator starts `Check input` for `Studio A` from the Source defaults Inputs tab
- **THEN** the PVW input card checks `Studio A` and names its channel
- **AND** Source defaults stays open with the same draft, dirty state and saved values
- **AND** rehearsal, row bindings, active look and PGM are unchanged

#### Scenario: The check is not a plate preview

- **WHEN** a rehearsing two-box graphic has a Live Source placeholder and the operator checks one input
- **THEN** the moving picture appears only in the labelled PVW input card
- **AND** the rehearsal page and placeholder remain exactly as before

### Requirement: A live-input check SHALL be honest about its lifecycle and SHALL never leave a frozen picture

The card SHALL distinguish `connecting`, `live`, `stalled`, `unavailable`, `conflict`, `replaced`, `expired` and
`forbidden`. It SHALL show picture only for the active preview generation in `live`. On stall, stop, replacement,
expiry, loss of permission or air-priority conflict it SHALL remove the last picture and name the state; it SHALL NOT
leave a last frame that can be mistaken for a current feed.

#### Scenario: Another check replaces this one

- **WHEN** the current preview generation is replaced by another accepted check
- **THEN** the old card removes its picture and says that the check was replaced
- **AND** a late close from the old card does not change the new card

#### Scenario: The input cannot be checked

- **WHEN** the selected source is unavailable or Playout refuses it because it is in use on air
- **THEN** the card names the source and reason, shows no picture, and changes no binding or PGM state

### Requirement: Live-input sound SHALL be off at the start of every check

Every input check SHALL begin with sound off, including after reload and while the remembered PGM speaker is on.
Sound SHALL begin only after an explicit operator gesture for the current preview generation. Close, replacement,
stall, expiry, conflict, sign-out or channel change SHALL stop it immediately and reset the input speaker to off.
The input-sound choice SHALL NOT be persisted and SHALL NOT alter the PGM speaker preference.

#### Scenario: PGM sound was remembered on

- **WHEN** the PGM speaker is remembered on and a new live-input check starts
- **THEN** the input speaker is off and no input sound plays
- **AND WHEN** the operator presses the input speaker **THEN** only the checked input becomes audible
- **AND** the PGM speaker setting remains unchanged

### Requirement: The PVW INPUT meter and PGM meter SHALL remain separate truths

The live-input card SHALL show a meter labelled `PVW INPUT` and the checked source's name, driven only by the current
preview generation's officially identified input-preview levels. It SHALL fall to floor when those levels are stale
or the check ends. It SHALL never be labelled PGM or presented as an on-air per-box meter.

The existing PGM picture, `PGM` meter, loudness badge, sound preference and programme-channel data path SHALL remain
unchanged. In a one-to-four-box on-air look that PGM meter SHALL continue to describe the final programme mix even
when the Playout playlist picture is not one of the visible boxes.

#### Scenario: Four live boxes without the playlist picture

- **WHEN** four live inputs are on air, the playlist picture is absent, and the operator checks `Guest 2`
- **THEN** `PVW INPUT · Guest 2` shows only the preview channel's accepted levels
- **AND** the separate PGM meter continues to show the complete programme mix without relabelling or filtering

#### Scenario: Preview levels become stale

- **WHEN** no accepted INPUT level arrives for the stale interval
- **THEN** the INPUT bars fall to floor and the card leaves `live`
- **AND** the PGM meter keeps following its own programme stream
