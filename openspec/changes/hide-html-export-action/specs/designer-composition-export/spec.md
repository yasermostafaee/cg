## MODIFIED Requirements

### Requirement: Composition actions SHALL expose only supported delivery formats

The composition action bar SHALL expose Preview and `.vcg` export. It SHALL NOT expose the internal
single-file HTML exporter as a normal author action. The underlying HTML exporter SHALL remain
callable by internal code and automated tests.

#### Scenario: Normal author workflow

- **WHEN** an author views the composition action bar
- **THEN** Preview and Export (.vcg) are present
- **AND** Export HTML is absent

#### Scenario: Internal exporter remains available

- **WHEN** an internal test invokes the single-file HTML exporter directly
- **THEN** it produces the same result as before this UI change
