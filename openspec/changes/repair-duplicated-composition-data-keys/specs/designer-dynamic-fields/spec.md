## ADDED Requirements

### Requirement: Duplicating a composition preserves its binding ownership

Designer SHALL point copied element bindings to the corresponding elements in the duplicate.
A change to a copied field's Data key SHALL update that composition's binding and keep the
original composition's field and binding intact.

#### Scenario: Rename a copied bound title

- **GIVEN** a composition has a text element bound to a Data key
- **WHEN** the author duplicates the composition and changes the copied text's key
- **THEN** the copy exposes the new key, with the original key still bound in the original composition

### Requirement: Documents recover bindings to deleted or missing elements

Designer and CG Control SHALL drop legacy bindings to elements missing from the owning
composition. They SHALL drop a field only when this removes its last binding and the field has
no other authored consumer. Existing bindings to valid elements, document-level bindings, and
intentionally unbound fields remain available in the authored data.

#### Scenario: Use a legacy duplicated composition

- **GIVEN** a copied composition carries a stale field targeting a missing original element and a valid binding to its own text
- **WHEN** the author opens and exports the project, or the operator imports an existing VCG of that project
- **THEN** only the valid title is exposed for that copied composition
