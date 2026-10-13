# designer-multibox-arrangements

## ADDED Requirements

### Requirement: A removed look's composition is offered back, and a new look never reuses its name

Removing a look SHALL keep its composition in the project (unchanged) and SHALL raise a notice
naming that composition and the door that brings it back. The Looks panel SHALL list every
composition that is not currently a look and can be nested without a cycle, each with a **Make it a
look** action that instances it full-frame in the group's home document and registers it — the
authored sub-scene, plates and all. The default name of a NEW look SHALL avoid every existing
composition name as well as every existing look id.

#### Scenario: the panels agree after a removal

- **WHEN** the author removes `look-1`
- **THEN** the Looks panel lists `look-1` under "Compositions that can become a look" with
  **Make it a look**, and the Compositions panel still lists `look-1`
- **AND** a notice says the composition stays and can be made a look again

#### Scenario: re-adopting restores the authored look

- **WHEN** the author presses **Make it a look** on `look-1`
- **THEN** a look is registered on that composition, its plates render on the canvas, and no new
  composition is created

#### Scenario: a new look after a removal takes a fresh name

- **WHEN** looks `look-1`…`look-3` were removed (their compositions kept) and the author presses
  `+ Look`
- **THEN** the new look and its composition are named `look-4`, and the new composition has no
  layers — it neither reuses nor adopts an orphan

#### Scenario: removing a look never deletes a composition

- **WHEN** a look is removed
- **THEN** the composition count is unchanged and Undo restores the look
