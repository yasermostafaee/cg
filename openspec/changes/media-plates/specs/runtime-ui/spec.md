# runtime-ui

## ADDED Requirements

### Requirement: A bound clip SHALL carry a Playback control where it is bound

A `Playback` button SHALL sit beside every field that binds a clip, on its line — a look's input in Look inputs,
and a plate's default in Source defaults — and SHALL open an anchored panel (the source picker's popover) headed
by the clip's name, holding `Loop` and `When hidden` (`Pause` · `Restart` · `Keep playing`) and nothing else. A choice SHALL apply at once, station-wide, through `sources.set-media-playback`; the chosen `When hidden`
SHALL wear the console's chosen-not-on-air treatment. A live input SHALL carry no `Playback`.

#### Scenario: The panel

- **WHEN** the operator opens `Playback` beside a clip **THEN** the panel hangs from the button inside the
  viewport, is headed by the clip's name, and holds only `Loop`, `When hidden` and the three choices
- **AND** a choice is sent at once with the clip's catalogue id, and Escape closes the panel alone
- **AND** the live input beside it has no `Playback` (the control)

### Requirement: An on-air row's media plate SHALL show its transport, its remaining time and its state

On an on-air row, each plate the bridge reports as a seated clip SHALL show Play/Pause and Restart as icon buttons
with their titles, its remaining time (`−0:12`) only when the bridge publishes one, and `Paused` and `Ended` as
facts. A live-input plate, and any plate of a row that is not on air, SHALL show no transport.

#### Scenario: The owner's check

- **WHEN** a row with a clip in box 2 is on air **THEN** box 2 shows Pause, Restart and `−0:12`
- **AND** pressing Pause shows `Paused` and offers Play, and Restart reads the clip's full length again
- **AND** with no remaining time published no number is shown, and a live input shows no transport (the controls)
