# designer-playout-lifecycle (D-113 delta)

## ADDED Requirements

### Requirement: Clearing the out-point reverts an out-point-dependent mode to manual

Clearing a composition's out-point while its mode is `auto-out` or `loop-cycle` SHALL set the mode to
`manual` in the SAME store action (one atomic undo step). Those modes require an out-point (an exit
segment to start the animated outro from), so without this the composition would claim an animated
exit with no marker to start from. The revert SHALL apply for EVERY path that clears the
out-point (the inspector Clear button, a drag-off, a marker delete), because all route through the
single clear action. When the mode is already `manual`, clearing the out-point SHALL leave the
playout unchanged (no spurious write). The invariant is ONE-DIRECTIONAL: re-adding an out-point SHALL
NOT auto-restore the prior mode.

#### Scenario: Clearing the out-point in auto-out reverts to manual

- **WHEN** the operator clears the out-point while the composition's mode is `auto-out`
- **THEN** the mode becomes `manual` in the same atomic action (the rest of the playout — holdMs,
  repeat — is preserved), and one undo restores both the out-point and the prior mode together

#### Scenario: Clearing the out-point in loop-cycle reverts to manual

- **WHEN** the operator clears the out-point while the mode is `loop-cycle`
- **THEN** the mode becomes `manual`

#### Scenario: Clearing the out-point in manual changes nothing

- **WHEN** the operator clears the out-point while the mode is already `manual`
- **THEN** the playout is left unchanged (no mode write)

#### Scenario: Re-adding an out-point does not restore the prior mode

- **WHEN** the operator clears the out-point (reverting to manual) and later re-adds an out-point
- **THEN** the mode stays `manual` (the prior `auto-out` / `loop-cycle` is NOT auto-restored)
