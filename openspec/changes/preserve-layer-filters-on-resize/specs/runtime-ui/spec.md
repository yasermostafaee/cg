## ADDED Requirements

### Requirement: Layers filters survive a panel layout change

CG Control SHALL keep the current Layers search text and Hide empty choice when an operator maximizes or restores a panel in the same console session.

#### Scenario: Restore the workspace after inspecting a fullscreen panel

- **GIVEN** the operator typed a Layers search and checked Hide empty
- **WHEN** the operator maximizes a monitor or the Inspector and restores the workspace
- **THEN** the Layers search, Hide empty choice and corresponding row results are restored
