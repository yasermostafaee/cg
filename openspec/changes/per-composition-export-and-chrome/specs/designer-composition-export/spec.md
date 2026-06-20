# designer-composition-export (delta)

## ADDED Requirements

### Requirement: Export is scoped to the open composition and its nested closure

Exporting (both `.vcg` and single-file HTML) SHALL package the OPEN composition as the package root plus only its transitive nested closure — every composition reachable from the root by following `composition` instance references AND `repeater` references, at any depth — and SHALL NOT include sibling compositions unreachable from the root or their assets. The root composition's own layers SHALL be lifted to the runtime's play-entry (`scene.layers`) so the served package renders that composition (a raw, layerless project root would render a blank frame).

#### Scenario: The `.vcg` renders the open composition from its lifted layers

- **WHEN** a composition is exported to `.vcg`
- **THEN** the package's `scene.layers` is that composition's layers (the runtime play-entry) and the served output renders it, not a blank frame

#### Scenario: Nested children via composition AND repeater are packaged transitively

- **WHEN** the root composition nests a child through a `composition` instance and another through a `repeater`, each with further nested children
- **THEN** all of those compositions (and their referenced assets) are included in the package, at any nesting depth

#### Scenario: A sibling composition is excluded

- **WHEN** the scene contains another composition that the root does not reach through any `composition` or `repeater` reference
- **THEN** that sibling composition and the assets used only by it are NOT packaged (`.vcg`) or inlined (single-file HTML)

### Requirement: Per-composition export preflight scopes validation to the closure

Export preflight SHALL validate only the open composition and its nested closure, so a validation error confined to a composition outside the closure does NOT block the export of a valid root composition.

#### Scenario: A broken sibling does not block a valid root

- **WHEN** a sibling composition outside the root's closure has a validation error (for example a missing image asset) and the root composition is exported
- **THEN** the export is not blocked by the sibling's error and produces the package for the root and its closure
