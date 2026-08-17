# runtime-ui

## MODIFIED Requirements

### Requirement: Item state, selection and dirty state are legible at a glance

Row state SHALL be legible at a glance: the loaded, needs-attention (UNCONFIRMED), and settled
(ON AIR/READY/IDLE) states read as distinct.

Dirty state SHALL be computed by ONE predicate that compares the staged value against the applied
one. The predicate SHALL NOT accept an omitted baseline: a caller asking whether an item has
unapplied plate edits SHALL supply the applied-plate map, so that no surface can silently ask a
different question from the one its neighbour asks.

"Not assigned" SHALL have exactly ONE canonical representation inside that comparison, so that a
staged empty value and an absent applied value are reconciled in one place rather than at each
comparison site.

The row's dirty chip and the row's UPDATE verb SHALL read the SAME value, because they answer the
same question — whether this row has staged edits that have not been applied.

#### Scenario: Dirty state is visible

- **WHEN** an item has staged-but-unapplied edits (R-003) **THEN** a dirty-dot on the field and a
  `● draft` chip on the row + Inspector are shown in the dirty hue

#### Scenario: A plate changed to a different source is dirty on both surfaces

- **WHEN** the operator stages a plate onto a source different from the saved assignment
- **THEN** the row shows a draft chip AND the Inspector shows a draft chip

#### Scenario: A plate returned to its saved source is dirty on neither

- **GIVEN** a plate whose saved assignment is source A
- **WHEN** the operator stages that plate back onto A
- **THEN** neither the row nor the Inspector shows a draft chip, because the staged value equals the
  applied one

#### Scenario: A plate staged as NOT ASSIGNED is dirty on both surfaces

- **GIVEN** a plate whose saved assignment is a source
- **WHEN** the operator stages that plate as _not assigned_
- **THEN** the row shows a draft chip AND the Inspector shows a draft chip, because _not assigned_
  is a value that differs from the saved one, not the absence of an edit

#### Scenario: The row's UPDATE verb is offered for an unassignment

- **GIVEN** an on-air row whose plate has been staged as _not assigned_
- **WHEN** the operator opens the row's verb menu
- **THEN** UPDATE is ENABLED, so the un-assignment can be applied from the row

#### Scenario: The outcome does not depend on the order of the edits

- **WHEN** the three transitions above are performed in any order
- **THEN** each one's outcome is the same as when performed alone, because dirtiness is a comparison
  against the applied value and not a function of edit history

#### Scenario: A caller cannot ask the dirty question without a baseline

- **WHEN** code asks whether an item has unapplied edits
- **THEN** it must supply the applied-plate map, and omitting it is a compile error rather than a
  silently different answer
