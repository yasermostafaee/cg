## ADDED Requirements

### Requirement: Browser-only PVW never controls the programme producer

The independent preview entry and exit SHALL change only preview records. They SHALL NOT send CG or MIXER commands and SHALL NOT block a normal Take. Play, Stop and Clear SHALL leave the preview active while the row remains bound. The legacy rehearsal route SHALL keep its existing mute and Take interlock.

#### Scenario: Enable and disable PVW on a playing row

- **WHEN** the console enters or leaves independent PVW on a playing row
- **THEN** the Bridge does not command the programme producer and retains confirmed programme state

#### Scenario: A legacy client rehearses

- **WHEN** a legacy client enters the original rehearsal mode
- **THEN** the existing interlock and its volume behavior remain in force

### Requirement: A verified resident page can move on air

Bridge SHALL advertise live Position only for a confirmed, owned programme producer that supports in-place position updates and has no independent plate or foreground producers on a station without a configured backup. When an explicit `stack.update` carries a position, Bridge SHALL verify that capability and ownership before sending any programme change. It SHALL send the position and fields to the same resident page in one CG UPDATE and record the applied position only after confirmed delivery.

#### Scenario: Move an eligible page on air

- **WHEN** a supported programme row receives a position and a field edit in the same Update
- **THEN** the resident page receives both and continues playing without CG ADD, CG PLAY or MIXER changes

#### Scenario: Refuse a stale or unsupported position

- **WHEN** the row has no verified supported programme producer or the position cannot be confirmed
- **THEN** the update does not publish a new applied position
