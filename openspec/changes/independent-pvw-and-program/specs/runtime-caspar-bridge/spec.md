## ADDED Requirements

### Requirement: Browser-only PVW never controls the programme producer

The independent preview entry and exit SHALL change only preview records. They SHALL NOT send CG or MIXER commands and SHALL NOT block a normal Take. Play, Stop and Clear SHALL leave the preview active while the row remains bound. The legacy rehearsal route SHALL keep its existing mute and Take interlock.

#### Scenario: Enable and disable PVW on a playing row

- **WHEN** the console enters or leaves independent PVW on a playing row
- **THEN** the Bridge does not command the programme producer and retains confirmed programme state

#### Scenario: A legacy client rehearses

- **WHEN** a legacy client enters the original rehearsal mode
- **THEN** the existing interlock and its volume behavior remain in force
- **WHEN** a field Update on that rehearsing row is pending **THEN** Bridge retains the rehearsal and leaves its volume unchanged

### Requirement: A verified resident page can move on air

Bridge SHALL advertise live Position for a confirmed, owned programme producer that supports
in-place Position on a single-primary station. For a live layout, Bridge SHALL verify the
resident page, any paired foreground, and each visible live seat. When an explicit
`stack.update` carries a position, Bridge SHALL verify those identities and the translated
geometry before sending programme changes. It SHALL send the position and fields to the same
resident page in one CG UPDATE. The corresponding FILL and CLIP move each visible input without
reloading it or changing the crop. Bridge SHALL record the applied position only after the
programme changes are confirmed.

#### Scenario: Move an eligible page on air

- **WHEN** a supported programme row receives a position and a field edit in the same Update
- **THEN** the resident page receives both and continues playing without CG ADD, CG PLAY or MIXER changes

#### Scenario: Refuse a stale or unsupported position

- **WHEN** the row has no verified supported programme producer or the position cannot be confirmed
- **THEN** the update does not publish a new applied position

#### Scenario: Move the artwork and occupied live frames together

- **GIVEN** a supported resident live layout has verified visible seats
- **WHEN** an explicit Update supplies a position within the supported raster
- **THEN** Bridge stages FILL and CLIP for the same visible seats, updates the same HTML page and
  commits the mixer change
- **AND** the current input producers, crop and frame sizes stay in force
- **WHEN** a requested position moves a visible seat entirely outside the channel raster or
  the request also changes source bindings
- **THEN** Bridge refuses the update and retains the previously applied position
