## ADDED Requirements

### Requirement: Authors configure Focus and its effects on a live preset

Designer SHALL let an author choose a single-plate preset with the same source identity as the Focus destination of a plate and choose the associated Focus and Return and solo switch effects.

#### Scenario: Author and export independent Focus effects

- **WHEN** the author associates a matching one-plate destination with a plate in a multi-plate preset and chooses its effects
- **THEN** Designer SHALL preserve the choices in the project and in the exported VCG
- **AND** the regular entry effect SHALL keep its own values

#### Scenario: A source has no matching one-plate preset

- **WHEN** an author inspects a multi-plate preset with a source that has no eligible destination
- **THEN** Designer SHALL identify the source and offer creation of a matching, editable one-plate preset
- **AND** the created preset and Focus link SHALL be one undoable edit
- **AND** other existing presets and Focus selections SHALL retain their authored values

#### Scenario: Operate Focus from a Designer preset

- **WHEN** the operator selects a numbered Focus or switches to another Focus from the same preset
- **THEN** PVW and PGM SHALL use their own selection and the matching authored effect
- **AND** Return SHALL recall the exact originating preset and its input bindings

#### Scenario: Preserve older and changed layouts

- **WHEN** a preset has no authored Focus configuration or a selected destination stops matching its source
- **THEN** Control SHALL omit that numbered shortcut and retain the normal preset operations
