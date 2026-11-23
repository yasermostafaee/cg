## MODIFIED Requirements

### Requirement: The media picker SHALL offer an inline preview in its Grid view

The Media tab SHALL offer Grid and List views. The selected grid item's preview
controls SHALL operate inside its card. Playing, pausing, seeking, stopping and
listening SHALL control the local preview. Select SHALL commit the staged binding.
One explicit row Preview/Play action SHALL start or resume playback in either view,
including when media preparation completes later. Selecting a row alone SHALL NOT
start playback or request proxy preparation. Resuming an existing player SHALL retain
its seek and listening state.

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

#### Scenario: One explicit Play survives slow preparation

- **WHEN** the operator presses a media row's Preview action once in Grid or List
- **AND** the media request first waits and then reports a preparing proxy
- **THEN** the ready native video starts and its playback clock advances without another click
- **AND** its initial sound is muted and the calling field's binding remains unchanged

#### Scenario: Another clip is played while the proxy encoder is busy

- **GIVEN** the operator has previewed a clip without closing the picker
- **WHEN** the operator presses Play once for another clip and Playout returns the documented capacity response
- **THEN** the picker shows that capacity is pending and keeps the Play request for that clip
- **AND** the Bridge waits before requesting preparation again, rereading the existing media manifest first
- **AND** the video starts when ready without another click
- **AND** a terminal preparation refusal remains visible and does not start another preparation automatically

#### Scenario: Cancel a pending explicit preview

- **WHEN** the operator pauses, stops, covers the picker, replaces its preview source or changes tabs before preparation completes
- **THEN** the cancelled request does not start a late player
- **AND** a released or superseded response closes its own lease
- **AND** reopening the Media tab does not restore a cancelled audition

#### Scenario: Preview against an older capability

- **WHEN** the Bridge or Playout reports the streamed media capability as unsupported
- **THEN** the existing sampled player offers Play, Pause, Stop and seek
- **AND** confirming a source continues through Select

### Requirement: Assigned media plates play on explicit request in PVW

PVW SHALL offer the existing read-only media preview transport inside a frame whose assigned clip
supports playback. Each frame starts idle and muted.

#### Scenario: Two preview frames use the same clip

- **WHEN** the operator opens PVW or starts the layout's rehearsal
- **THEN** neither clip plays until its frame's own Play control is pressed
- **WHEN** the operator presses Play or Pause on one frame
- **THEN** only that frame changes playback state
- **AND** an available local audio channel has its own mute control
- **AND** leaving the preset or stopping PVW closes that frame's stream without a programme write
