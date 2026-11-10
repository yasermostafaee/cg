## ADDED Requirements

### Requirement: Browser-only PVW never controls the programme producer

The independent preview entry and exit SHALL change only preview records. They SHALL NOT send CG or MIXER commands and SHALL NOT block a normal Take. Play, Stop and Clear SHALL leave the preview active while the row remains bound. The legacy rehearsal route SHALL keep its existing mute and Take interlock.

#### Scenario: Enable and disable PVW on a playing row

- **WHEN** the console enters or leaves independent PVW on a playing row
- **THEN** the Bridge does not command the programme producer and retains confirmed programme state

#### Scenario: A legacy client rehearses

- **WHEN** a legacy client enters the original rehearsal mode
- **THEN** the existing interlock and its volume behavior remain in force
