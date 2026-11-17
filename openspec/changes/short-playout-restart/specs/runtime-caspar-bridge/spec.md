## ADDED Requirements

### Requirement: Recover programme rows after a short Playout outage

For a Playout-linked station, Bridge SHALL automatically recover previously confirmed programme rows on the same Bridge primary after a brief AMCP outage, using a configurable window. The default SHALL be five seconds and zero SHALL disable automatic recovery.

#### Scenario: The same primary reconnects promptly with empty layers

- **GIVEN** a linked engine had confirmed one or more programme rows
- **WHEN** it reconnects inside the window and the returning engine confirms an affected layer is vacant
- **THEN** Bridge restores the eligible row on the same transport using its applied data and input bindings
- **AND** the successful row does not generate an emptied-air notice

#### Scenario: Recovery cannot safely complete

- **WHEN** the window expires, an affected row cannot be confirmed vacant, or ownership or publication has changed
- **THEN** the affected row remains available to the existing operator-confirmed recovery
- **AND** Bridge does not dispatch an automatic publication after the window expires
- **AND** a deliberate Stop or Clear, including a channel-wide action, cancels pending publication for the affected rows
