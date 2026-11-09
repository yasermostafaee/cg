## MODIFIED Requirements

### Requirement: PVW marks every live plate with a labelled placeholder drawn OVER the rehearse frame

While the rehearsal is playing, PVW SHALL mark each live plate with a transparent outline and a
label. The retained page SHALL paint the authored Bars, colour or picture. The label SHALL show
Crop edges below the plate name when its resolved fit is `cover`.

#### Scenario: Authored solid colour is visible beside Bars

- **GIVEN** a template with a solid-colour plate and a Bars plate
- **WHEN** the operator plays its rehearsal
- **THEN** both backgrounds remain visible through their PVW markers

#### Scenario: The marker shows the selected crop mode

- **WHEN** the active look and channel fit resolve to `cover`
- **THEN** the marker shows Crop edges below the plate name

### Requirement: The two plate states are distinguishable WITHOUT reading the label

An assigned plate SHALL have a neutral outline and an unassigned plate SHALL have an amber outline.
Both SHALL show their plate name, and the assigned state SHALL show the applied source name.

#### Scenario: An unassigned plate is identifiable without covering its background

- **WHEN** a live plate has no applied assignment
- **THEN** the marker shows an amber outline and no source assigned

### Requirement: A placeholder can never be mistaken for the real picture

PVW SHALL identify the local composite and its live placeholders with a visible caveat on the marker
or stage stamp. Each marker SHALL provide the preview caveat in its accessible name.

#### Scenario: An authored picture fallback stays identifiable as a placeholder

- **WHEN** the retained page uses a picture as the plate fallback
- **THEN** its marker leaves that picture visible and identifies it as a preview placeholder
