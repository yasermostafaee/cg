## ADDED Requirements

### Requirement: A per-composition export carries no project entry pointer

A per-composition export SHALL omit the project's `entryCompositionId`: the chosen composition is
flattened into the ROOT, so the root IS the entry and the pointer has nothing to say. The export
SHALL NOT copy the project's value through (it would name a composition the package does not
contain, or a nested composition a reader would take for the entry), and SHALL NOT rewrite it. A
reader that resolves an entry id SHALL treat a miss as not found, never as a positional fallback.
The project itself SHALL keep its `entryCompositionId`.

#### Scenario: Exporting the main composition writes no pointer

- **WHEN** the project's main composition `R` is exported on its own
- **THEN** the package's `template.json` has no `entryCompositionId`

#### Scenario: Exporting a composition that nests the project main writes no pointer

- **WHEN** the project's main is `C` and the exported composition `R` instances `C`
- **THEN** the export has no `entryCompositionId`, so `C` is never read as the entry

#### Scenario: A dangling entry id is not found

- **WHEN** a scene's `entryCompositionId` names no composition it contains
- **THEN** a reader of the entry composition (its page lists) reads nothing from it, rather than
  the first composition
