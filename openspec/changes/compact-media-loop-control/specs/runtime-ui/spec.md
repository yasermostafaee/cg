## MODIFIED Requirements

### Requirement: A bound clip SHALL carry a Playback control where it is bound

A `Playback` button SHALL sit beside every field that binds a clip, on its line in Plate inputs or Source defaults. It SHALL open an anchored panel headed by the clip's name, holding `Loop` and `When hidden` (`Pause` · `Restart` · `Keep playing`). A choice SHALL apply at once, station-wide, through `sources.set-media-playback`. The chosen `When hidden` action SHALL use the console's selected styling. A live input SHALL carry no `Playback` control.

#### Scenario: The panel

- **WHEN** the operator opens Playback beside a clip
- **THEN** the panel hangs from the button inside the viewport, is headed by the clip's name, and holds only Loop, When hidden and the three choices
- **AND** a choice is sent at once with the clip's catalogue id, and Escape closes the panel alone
- **AND** the live input beside it has no Playback control.

#### Scenario: Read and use the Loop checkbox

- **WHEN** Inspector or Source defaults shows Playback in English, Persian or Arabic
- **THEN** the checkbox sits immediately after its label in the interface's reading direction
- **AND** clicking the label toggles the checkbox.
