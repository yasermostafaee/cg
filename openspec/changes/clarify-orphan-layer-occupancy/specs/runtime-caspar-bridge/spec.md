## ADDED Requirements

### Requirement: Layer-addressed Clear settles the affected row after primary acknowledgement

When the current primary acknowledges a bank or orphan Clear, the Bridge SHALL retire any
eligible row's cached producer on that exact coordinate, settle it to idle and publish the
result. The row SHALL keep its binding and late OSC for the erased producer SHALL NOT restore
its on-air claim. A newer row intent or an acknowledgement from only the backup SHALL NOT
cause this reconciliation. Both commands SHALL retain their existing dispatch guards.

#### Scenario: A Clear acknowledgement precedes the last producer frame

- **WHEN** the current primary acknowledges the layer-addressed Clear of a bound row, or a row
  adopts the orphan while its Clear is pending **THEN** the Bridge publishes idle for that row
  even if the engine reports one final producer frame before it erases the layer.
