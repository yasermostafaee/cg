# runtime-ui

## ADDED Requirements

### Requirement: A state hue is never borrowed by a control that cannot be in that state

A colour that carries a STATE meaning on this surface SHALL NOT be worn by a control for which that
state cannot be true, in ANY interactive state — rest, hover, active or focus.

The rule SHALL be enforced by the treatment being SCOPED to the controls it belongs to, not by a
comment asking future code not to inherit it. Where a shared rule paints a state hue, the weights
SHALL be named tokens rather than literals, so that a reader can see whose colour they are.

#### Scenario: The maximised-panel toggle keeps its own hue while hovered

- **WHEN** the operator hovers or presses the maximised-panel toggle
- **THEN** it stays in the sky accent family and never paints the REHEARSING violet, because a
  "this row is on PVW" claim cannot be true of a panel header

#### Scenario: The rehearsing weights are legible as rehearsing

- **WHEN** a developer reads the shared `.is-on` hover and active rules
- **THEN** the colours are named as the rehearsing family, so a control inheriting them is visibly
  inheriting a state hue rather than an anonymous literal

### Requirement: The status bar's fault colours mean a fault

In the status bar, `--r-caution` and `--r-danger` SHALL mark faults only. A control that performs an
ACTION SHALL NOT wear a fault role colour, so that an alarm beside it keeps its meaning.

#### Scenario: The failover control is not coloured at rest

- **WHEN** the status bar renders with a backup configured
- **THEN** the manual failover control carries no role colour and reads as a peer of the other
  status-bar buttons, while the `NO OSC` alarm beside it remains the only amber

#### Scenario: The failover control still says why it cannot be pressed

- **WHEN** no backup is configured
- **THEN** the control is disabled and its title names the reason, unchanged by the colour decision

### Requirement: The reserved-layer tab is named for what it lists

The tab listing the declared reserved layers SHALL be named for whose layers they are — the
station's own playout system's — rather than for this console's playout.

The renderer-local identifiers behind it SHALL match that name. Wire names — IPC channel strings,
the shared contract type and the bridge surface — SHALL be left unchanged, because renaming them
churns the protocol for no user-visible gain.

#### Scenario: The tab names whose layers it lists

- **WHEN** the operator looks at the layer surfaces
- **THEN** the reserved-layer tab reads `STATION LAYERS`, and nothing in the product still calls it
  the console's playout

#### Scenario: The wire is untouched by the rename

- **WHEN** the renderer asks the bridge for reserved-layer state after the rename
- **THEN** it uses the same channel names as before, so no bridge or protocol change is implied
