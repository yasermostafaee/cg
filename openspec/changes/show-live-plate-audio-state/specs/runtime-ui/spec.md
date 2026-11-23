## ADDED Requirements

### Requirement: Live Source audio intent SHALL be legible on the frame and layer row

CG Control SHALL draw a distinct Volume On or Volume Muted icon on a PVW Live Source placeholder
whose programme audio state is known and that has no local listening control. A layer row that declares Live Sources SHALL use the same distinct icons
on its audio control according to whether any shown plate is asking for sound. The visible state and
accessible wording SHALL agree and SHALL describe intent rather than claim a measured level.

#### Scenario: A shown plate asks for sound

- **WHEN** a shown plate's recorded volume is above zero **THEN** the layer row uses Volume On
- **AND** a placeholder without local listening can state its programme audio intent

#### Scenario: Every shown plate is silent

- **WHEN** no shown plate asks for sound **THEN** the row uses Volume Muted and names audio as muted

#### Scenario: A plate is held by the active look

- **WHEN** a plate is held **THEN** its frame uses Volume Muted and states that it is not in this look

### Requirement: PVW frame and monitor audio controls share the local listening state

PVW SHALL label and operate local listening per supported live frame. When a local listening
control is available, the frame's speaker shows that preview state. Programme audio intent
continues to be shown by the Layers and on-air controls.

#### Scenario: Listen from the NDI frame or monitor toolbar

- **WHEN** an operator starts or mutes a live preview input from either surface
- **THEN** the frame and toolbar display the same local listening state
- **AND** selecting a different live input stops the previous local audition
- **AND** hiding the input, stopping rehearsal or closing Preview releases the audio
- **AND** the monitor sends no programme audio, mixer or play commands
