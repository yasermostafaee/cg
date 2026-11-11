## ADDED Requirements

### Requirement: Set up SHALL ask each address as a host and a port, its defaults as placeholders

The Set up page SHALL ask the APASAI Playout Engine address as a `Host` and a `Port` (placeholder `8080`)
and, for a CG Bridge on a separate server, CG Bridge's as a `Host` (placeholder the Playout's host, `Found automatically` while there is
none) and a `Port` (placeholder `5280`), with the same fields and the same rule as Station setup's Connection card.
An empty field SHALL be saved as its default, and a whole address pasted into a `Host` SHALL fill both of its fields.

#### Scenario: The host alone

- **WHEN** `192.0.2.20` is typed into the Playout's `Host` and `Connect` is pressed where CG Bridge answers
  **THEN** `http://192.0.2.20:8080` is saved

#### Scenario: A pasted address

- **WHEN** `http://192.0.2.20:8081/` is pasted into the Playout's `Host` **THEN** `Host` reads `192.0.2.20` and
  `Port` reads `8081`

#### Scenario: A port alone for CG Bridge

- **WHEN** only CG Bridge's `Port` is typed, `5281` **THEN** CG Bridge is saved as the Playout's host on `5281`

### Requirement: Windows Setup presents the APASAI Playout Engine and preserves standalone maintenance

Fresh interactive CG Bridge Setup SHALL present the `APASAI Playout Engine` page and rail entry.
Its separate-server option SHALL read `CG Bridge and APASAI Playout Engine run on separate servers`.
The separate-server form SHALL name the engine address `APASAI Playout Engine address` and the
AMCP endpoint `APASAI Playout Engine (AMCP) host`. Fresh interactive Setup SHALL offer no standalone mode control.

Opening Setup with a stored standalone configuration SHALL show its CasparCG maintenance page,
with the existing host, AMCP port, OSC port and shared-files folder available for editing.
It SHALL explain that CG Control runs on the same computer as CG Bridge and identify CasparCG 2.5.0
Stable as tested. Standalone defaults SHALL remain `127.0.0.1`, `5250` and `6251`.
The graphics and local control settings SHALL retain their standalone behavior.

The unattended installer SHALL accept explicit `/MODE=standalone` and `/MODE=playout`.
An upgrade without a mode argument SHALL preserve the installed mode, including for earlier
Playout configurations that omitted the mode.

#### Scenario: Fresh interactive Setup

- **WHEN** an administrator opens CG Bridge Setup without a stored standalone configuration or an explicit mode
- **THEN** its server page presents the APASAI Playout Engine connection and the separate-server option

#### Scenario: Explicit unattended standalone installation

- **WHEN** an administrator supplies `/MODE=standalone` to the unattended installer with a CasparCG address
- **THEN** the Bridge service stores that mode and host and listens for control only on loopback

#### Scenario: Maintain an installed standalone service

- **WHEN** an administrator opens Setup without a mode argument on an installed standalone service
- **THEN** Setup shows the saved CasparCG host and ports and preserves standalone mode on upgrade

#### Scenario: Preserve Playout on upgrade

- **WHEN** an upgrade is run without a mode argument on an installed Playout service
- **THEN** the service stays in Playout mode
