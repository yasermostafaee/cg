## ADDED Requirements

### Requirement: Set up SHALL ask each address as a host and a port, its defaults as placeholders

The Set up page SHALL ask the Playout's address as a `Host` and a `Port` (placeholder `8080`) and, for a CG Bridge on
a separate server, CG Bridge's as a `Host` (placeholder the Playout's host, `Found automatically` while there is
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

### Requirement: Windows Setup can install a No Playout Bridge

Bridge Setup SHALL label its standalone choice **Direct to CasparCG**. It SHALL explain that this uses the local Bridge without APASAI Playout, name CasparCG 2.5.0 Stable as tested and explain how to return to APASAI Playout in Setup. No Playout SHALL configure CasparCG host and ports with defaults 127.0.0.1, 5250 and 6251, a local control port, and the existing graphics and shared-files settings. Mode changes SHALL require an explicit installer choice. An unattended upgrade without a mode flag SHALL preserve the installed mode.

#### Scenario: Fresh No Playout installation

- **WHEN** an administrator selects No Playout in Setup and enters a CasparCG address
- **THEN** the Bridge service stores that mode and host and listens for control only on loopback

#### Scenario: Preserve the installed mode on upgrade

- **WHEN** an upgrade is run without an explicit mode
- **THEN** a legacy Playout service stays in Playout mode and a standalone service stays standalone
