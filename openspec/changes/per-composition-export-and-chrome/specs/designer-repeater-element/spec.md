# designer-repeater-element (delta)

## MODIFIED Requirements

### Requirement: Cycle guarding

The author-time guard SHALL block selecting or nesting a composition that would create a cycle, treating BOTH `composition` instance references AND `repeater` references as edges of the composition-reference graph, so a repeater-mediated cycle (A is nested in B while A reaches B through a `repeater`) is refused as well as the classic self/ancestor `composition` cycle; and the runtime's depth/visited guard SHALL render an empty box if a cyclic reference is forced.

#### Scenario: A cyclic choice is blocked; a forced cycle renders empty

- **WHEN** the chosen composition would create a cycle (self/ancestor) through a `composition` instance reference
- **THEN** the guard blocks the selection, and the runtime's depth/visited guard renders an empty box if forced

#### Scenario: A repeater-mediated cycle is blocked

- **WHEN** nesting composition A into composition B would close a loop because A already reaches B through a `repeater` reference
- **THEN** the author-time guard refuses it (the `repeater` edge participates in cycle detection), exactly as a `composition`-instance cycle is refused
