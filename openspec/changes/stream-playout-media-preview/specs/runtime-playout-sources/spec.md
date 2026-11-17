## MODIFIED Requirements

### Requirement: The media picker SHALL offer an inline preview in its Grid view

The Media tab SHALL offer Grid and List views. The selected grid item's preview
controls SHALL operate inside its card. Playing, pausing, seeking, stopping and
listening SHALL control the local preview. Select SHALL commit the staged binding.

When Playout offers a verified file or proxy preview, the player SHALL use native
video playback through the authenticated Bridge relay. It SHALL start muted and
offer explicit listening. It SHALL retain the poster during proxy preparation and
after Stop, and identify the serving Engine. Stop SHALL reset the local position.
Closing or covering the dialog SHALL pause playback and release its preview lease.

An unsupported Bridge channel or Playout media capability SHALL use the existing
sampled player and identify its sampled playback.

#### Scenario: Preview a streamed video in the media grid

- **WHEN** the operator opens a compatible video preview in Grid
- **THEN** the same card decodes the streamed video and exposes local playback controls
- **AND WHEN** the operator pauses, seeks or enables listening
- **THEN** the native player's local position and mute state follow those controls
- **AND WHEN** the operator stops the preview
- **THEN** its local position returns to zero and its poster remains visible
- **AND** the calling field retains its binding until Select

#### Scenario: Close a streamed preview

- **WHEN** the operator closes the picker while a file preview is open
- **THEN** the player releases the preview session
- **AND** preview actions issue no take or programme-update commands

#### Scenario: Preview against an older capability

- **WHEN** the Bridge or Playout reports the streamed media capability as unsupported
- **THEN** the existing sampled player offers Play, Pause, Stop and seek
- **AND** confirming a source continues through Select
