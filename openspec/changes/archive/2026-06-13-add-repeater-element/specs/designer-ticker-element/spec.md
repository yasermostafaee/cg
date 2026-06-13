# designer-ticker-element

## MODIFIED Requirements

### Requirement: Export parity and GDD representation

The single-file HTML export SHALL carry the ticker with behaviour identical to
the preview (same runtime source; the duration supplier needs no boot-option
wiring). The GDD SHALL represent a `list` field as a typed array property with
an object `items` schema declaring the known keys; a `list` field bound
`repeater-items` (D-030) SHALL instead derive that item schema from the
referenced child composition's fields — each child field mapped through the
standard field→GDD property rules (gddType, min/max/pattern/default) with the
child's required fields as the item schema's `required` (the `id` reconcile
key stays declared) — while every other `list` field keeps the generic open
item shape. Export preflight SHALL warn (not block) that third-party GDD
clients may not render an array editor, and that `.vcg` exports ship no font
bytes (ticker durations measured against fallback fonts are silently wrong).

#### Scenario: Preview equals export

- **WHEN** the same scene plays in the Designer preview and as the exported
  single-file HTML
- **THEN** the ticker's crawl, pass duration, wrap, and RTL behaviour are
  identical

#### Scenario: Preflight warns about list-field portability

- **WHEN** a scene with a ticker bound to a `list` field is exported as
  single-file HTML
- **THEN** the export succeeds and the warnings include the third-party
  list-editor limitation

#### Scenario: A repeater-bound list derives its item schema from the child

- **WHEN** a `list` field bound `repeater-items` is exported and the
  referenced child composition declares fields (e.g. a text `name` and a
  number `score` with min/max)
- **THEN** the GDD array's item schema declares those keys with the child
  fields' types, constraints, defaults, and required flags — not the
  generic `{id, text}` shape — while a ticker/sequence-bound list is
  unchanged
