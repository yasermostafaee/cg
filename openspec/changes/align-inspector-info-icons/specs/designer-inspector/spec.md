## ADDED Requirements

### Requirement: Playout contextual help SHALL occupy one aligned column

Every visible contextual-help action in the Playout Inspector SHALL be the final direct item of its
row and SHALL use a fixed-width final grid column.

#### Scenario: Loop-cycle Playout settings

- **WHEN** Template settings, Operator defaults, Delay, Out point, Content start and Hold loop help
  actions are visible
- **THEN** their icons form one right-edge column
- **AND** labels, values and authoring buttons remain in their own columns
