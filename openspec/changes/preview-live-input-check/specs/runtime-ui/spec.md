## ADDED Requirements

### Requirement: PVW SHALL let the operator check one live input without changing rehearsal or air

CG Control SHALL offer `Check input` for one Playout live source from the PVW workflow and from Source defaults,
Look inputs, the row's live-source swap and Station setup → Live sources on stations without the thumbnail
capability. The actions SHALL target one input
card labelled with the source's canonical name and channel. The card SHALL appear on the source surface that
started it. It SHALL leave that surface open and SHALL NOT select, save or apply the source, alter any dirty
draft, or change the rehearsing row. Closing the source surface or leaving its channel SHALL release its check.

The card SHALL be separate from the rehearsal iframe and Live Source placeholders. It SHALL NOT composite the live
picture into a plate, change the retained page, trigger Play/Take/Update, or imply that the checked picture is PGM.

#### Scenario: A check started while editing defaults

- **WHEN** the operator starts `Check input` for `Studio A` from the Source defaults Inputs tab
- **THEN** the PVW input card in the dialog checks `Studio A` and names its channel
- **AND** Source defaults stays open with the same draft, dirty state and saved values
- **AND** rehearsal, row bindings, active look and PGM are unchanged

#### Scenario: The check is not a plate preview

- **WHEN** a rehearsing two-box graphic has a Live Source placeholder and the operator checks one input
- **THEN** the moving picture appears only in the labelled PVW input card
- **AND** the rehearsal page and placeholder remain exactly as before

#### Scenario: A check started from the other source surfaces

- **WHEN** the operator uses `Check input` beside an eligible source in Look inputs, the live-source swap or
  Station setup → Live sources
- **THEN** the live card displays that source on the initiating surface
- **AND** the existing input selection, assignments, row overrides, rehearsal and PGM are preserved
- **AND** leaving the surface clears the card and releases its lease

### Requirement: Source lists SHALL reserve the thumbnail slot before thumbnail delivery is available

CG Control SHALL display a reserved thumbnail labelled `No signal` for each source row. Eligible
sources SHALL use the thumbnail as the existing Check input action. The slot SHALL leave the
source's own status and eligibility for selection intact.

#### Scenario: A list opens on a station without thumbnail delivery

- **WHEN** the operator opens a source picker or Station setup → Live sources
- **THEN** the input rows show their `No signal` thumbnail slots without starting a check
- **AND** Station setup shows larger 16:9 slots than the pickers
- **AND** activating an eligible slot opens the corresponding explicit check without selecting the row

### Requirement: Media rows show their Playout library posters

CG Control SHALL show an available static poster for each visible Media row in a source picker.
Missing or failed posters SHALL show `No poster` and leave selection available. Showing a poster
SHALL start neither playback nor an input-check lease.

#### Scenario: Compare media by their posters

- **GIVEN** the Playout returns different posters for two Media results
- **WHEN** the operator opens the Media tab
- **THEN** each visible result shows its own poster
- **AND** selecting the row still selects the Media item

#### Scenario: A poster is unavailable

- **WHEN** the poster is missing or Bridge does not offer poster reads
- **THEN** the Media row shows `No poster` and remains selectable

### Requirement: A supported source list SHALL show independently refreshed live thumbnails

CG Control SHALL show a thumbnail in place of the Check icon for each visible eligible input when Playout
exposes authenticated read-only pictures per source. This applies to Source defaults, Look inputs, the live-source
swap and Station setup → Live sources. The view SHALL acquire bounded video-only demand on open without a click or hover. Viewing a
thumbnail SHALL leave selection, drafts, rehearsal, PGM, Playlist and the active Check lease intact. The console
SHALL release demand as rows become hidden or inaccessible.

#### Scenario: Two sources can be compared at a glance

- **GIVEN** two eligible inputs are visible and Playout supports the read-only thumbnail capability
- **WHEN** the operator opens the input list
- **THEN** both sources show their own refreshing picture simultaneously
- **AND** the operator can still select either input through the existing row action

#### Scenario: A thumbnail frame stops arriving

- **WHEN** an input stops delivering fresh frames
- **THEN** the list clears that tile's image and shows the reported signal state or an unknown state
- **AND** fresh black frames still display as valid pictures
- **AND** closing or filtering the list releases the affected demand and ignores its late frames

### Requirement: A live-input check SHALL be honest about its lifecycle and SHALL never leave a frozen picture

The card SHALL distinguish `connecting`, `live`, `stalled`, `unavailable`, `conflict`, `replaced`, `expired` and
`forbidden`. It SHALL show picture only for the active preview generation in `live`. On stall, stop, replacement,
expiry, loss of permission or air-priority conflict it SHALL remove the last picture and name the state; it SHALL NOT
leave a last frame that can be mistaken for a current feed.
The card SHALL show an empty frame when it has no current picture and reserve a source signal label for
authoritative source-signal evidence.

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
- **THEN** the INPUT bars fall to floor independently of the picture
- **AND** the PGM meter keeps following its own programme stream

### Requirement: PVW shows each compatible source inside its assigned plate

On a compatible station CG Control SHALL request silent, independently identified snapshots
for the current applied plate bindings. It SHALL paint accepted pictures within the retained
rehearsal page and release those subscriptions when the view ends.

#### Scenario: A rehearsal contains two different compatible pictures

- **GIVEN** a rehearsed template with two plates, an authored foreground shape and a plate mask
- **WHEN** the acting operator receives fresh snapshots for both assigned sources
- **THEN** each plate shows its own picture, preserving its fit, foreground paint order and mask
- **AND** the console leaves the explicit Check lease and programme untouched

#### Scenario: An assigned receiver loses its picture or leaves rehearsal

- **WHEN** the receiver reports absent or the selected plate no longer needs a snapshot
- **THEN** PVW removes that picture, leaving the plate's authored fallback
- **AND** ending rehearsal releases its independent subscriptions
