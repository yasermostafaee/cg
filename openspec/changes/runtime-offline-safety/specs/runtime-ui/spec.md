# runtime-ui Specification (delta)

## ADDED Requirements

### Requirement: Not-on-air states are loud, and test mode can never be mistaken for air

The Runtime SHALL make it impossible for the operator to believe a graphic is on air when
it is not. A single pill among several is NOT sufficient: the failure this prevents was an
amber "OFFLINE (mock)" pill sitting beside a green "PRIMARY A HEALTHY", where the
reassuring claim won.

**Disconnected.** When the bridge link is not live, the Runtime SHALL show a persistent
full-width `role="alert"` banner stating that the Runtime is not connected, that nothing
can reach air, and that commands are refused. The banner SHALL offer a retry and an
explicit way to enter test mode. On-air controls SHALL be disabled while disconnected, with
the reason surfaced — the UI SHALL mirror the bridge's refusal rather than inviting a
command it knows will be refused.

**Test mode.** Test mode SHALL be entered only by a deliberate operator action, never
automatically. While in test mode the Runtime SHALL show a persistent, visually distinct,
full-width TEST MODE banner stating that nothing is on air and no command reaches CasparCG,
and SHALL offer an explicit way to leave. Leaving or entering test mode SHALL NOT swap the
backend underneath a running session.

**Test mode SHALL NOT claim real success.** A simulated item SHALL NOT render the same
on-air badge a genuinely on-air item renders: the broadcast-red ON AIR treatment is
reserved for a graphic confirmed on air by a real server. A simulated item SHALL be badged
distinctly (e.g. "SIM ON AIR") so the claim reads as simulation at a glance. The mock SHALL
NOT report any CasparCG server as `healthy`; the server pills SHALL state that there is no
server and the state is simulated.

#### Scenario: An unreachable bridge is loud, not a pill

- **WHEN** the app boots and the bridge is unreachable **THEN** a full-width alert states
  the Runtime is not connected and that commands will not reach air, and no server is shown
  as healthy

#### Scenario: On-air controls are disabled while disconnected

- **WHEN** the link is not live **THEN** the stack row's PLAY control is disabled and the
  reason is surfaced, so the operator is not invited to issue a command that would be refused

#### Scenario: Test mode is unmistakable

- **WHEN** the operator is in test mode **THEN** a persistent full-width TEST MODE banner
  states that nothing is on air, and it is visible regardless of where the operator is
  looking in the app

#### Scenario: A simulated item is never badged as real air

- **WHEN** an item is "played" in test mode **THEN** its badge reads as simulated, visually
  distinct from the broadcast-red ON AIR badge a real on-air item carries

#### Scenario: The mock never claims a healthy server

- **WHEN** the app is in test mode **THEN** no CasparCG server is reported or shown as
  healthy — the server surface states that there is no server and the state is simulated
