## ADDED Requirements

### Requirement: The template catalogue counts operator fields across the template

The catalogue and selected template Details SHALL count registered root and nested operator
fields. Each shared frame title SHALL count once across its preset occurrences. Fields under
distinct namespaces SHALL remain independent unless linked by shared title metadata.

#### Scenario: Select a live layout with nested titles shared across presets

- **GIVEN** a live layout exposes three independent title values through nested compositions, including title occurrences linked across presets
- **WHEN** the operator selects the template in the catalogue or in the layer template picker
- **THEN** both the catalogue row and Details count three fields
