## ADDED Requirements

### Requirement: Live Source audio intent SHALL be legible on the frame and layer row

CG Control SHALL draw a distinct Volume On or Volume Muted icon on every PVW Live Source placeholder
whose audio state is known. A layer row that declares Live Sources SHALL use the same distinct icons
on its audio control according to whether any shown plate is asking for sound. The visible state and
accessible wording SHALL agree and SHALL describe intent rather than claim a measured level.

#### Scenario: A shown plate asks for sound

- **WHEN** a shown plate's recorded volume is above zero **THEN** its frame and row use Volume On and
  name audio as on

#### Scenario: Every shown plate is silent

- **WHEN** no shown plate asks for sound **THEN** the row uses Volume Muted and names audio as muted

#### Scenario: A plate is held by the active look

- **WHEN** a plate is held **THEN** its frame uses Volume Muted and states that it is not in this look
