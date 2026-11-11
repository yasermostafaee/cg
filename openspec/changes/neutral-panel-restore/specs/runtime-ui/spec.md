## MODIFIED Requirements

### Requirement: A state hue is never borrowed by a control that cannot be in that state

A colour that carries a STATE meaning on this surface SHALL NOT be worn by a control for which that
state cannot be true, in ANY interactive state — rest, hover, active or focus.

The rule SHALL be enforced by the treatment being SCOPED to the controls it belongs to, not by a
comment asking future code not to inherit it. Where a shared rule paints a state hue, the weights
SHALL be named tokens rather than literals, so that a reader can see whose colour they are.

#### Scenario: The panel restore button uses the standard icon treatment

- **WHEN** the operator maximizes a panel
- **THEN** the restore button has the same neutral treatment as the fullscreen button and still
  indicates the maximized state through its icon and accessible state
- **AND** clicking restore returns to the workspace

#### Scenario: The rehearsing weights are legible as rehearsing

- **WHEN** a developer reads the shared `.is-on` hover and active rules
- **THEN** the colours are named as the rehearsing family, so a control inheriting them is visibly
  inheriting a state hue rather than an anonymous literal
