## ADDED Requirements

### Requirement: Preset controls SHALL preserve independent preview and programme targets

An Inspector preset selection SHALL change only the row's local preview selection, both on
and off air. It SHALL NOT send a programme preset command. An off-air row preset button SHALL
remain available under its existing permission/connection gates and choose the first preset
for the next Take without changing preview. An on-air row preset or Focus action SHALL target
programme directly without changing preview. Explicit Update behavior SHALL remain unchanged.

The Inspector and PVW SHALL read the same local selection. Programme acknowledgements,
repeated programme picks, stop/play and rehearsal toggles SHALL NOT overwrite that selection.
Only authoritative row removal SHALL prune the per-row selection.

#### Scenario: Choose what first goes on air

- **WHEN** the off-air row selects a programme preset while the Inspector previews another
- **THEN** the row displays the selected first programme preset and PVW remains unchanged
- **AND** Take starts the chosen programme preset without adopting the Inspector's cue

#### Scenario: Inspector cue changes during a live programme request

- **WHEN** a row preset request is pending and the operator chooses another Inspector preset
- **THEN** the acknowledgement updates only the programme indicator
- **AND** repeated programme picks keep the Inspector and PVW on their local cue

#### Scenario: Preview is removed and restored

- **WHEN** the operator toggles a retained row off and back onto PVW
- **THEN** preview resumes with its previous selection even if programme selected another preset
