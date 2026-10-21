## MODIFIED Requirements

### Requirement: Row COUNT is stamped at each fresh play

At each fresh `play()` the runtime SHALL tear down the previous rows and
stamp from the CURRENT effective items — the bound list field's effective
value when bound (a retained `update()` delivered before play included) else
the authored items — clamped by the row limit. Each stamped row is
wired through the same subtree factory the static tree uses and attached to
the hosting scope's cascade, so rows enter the run like authored children.
`B-106`: the row limit SHALL be read through ONE function,
`repeaterRowLimit` (`@cg/shared-schema`), by the build-time stamp, the
driver's restamp and the Designer's row editor alike, and every stamp — the
canvas that never plays, a longer list sent before play, the take — SHALL
show at most that many rows. A `maxItems` that is not a number of at least 1
(a hand-edited `0`, a negative, `NaN`, `null`, which an exported page never
re-parses) SHALL mean no limit, as the Designer's "0 = unlimited" says; a
fraction SHALL be floored.

#### Scenario: Pre-play update() count is honored

- **WHEN** `play()` runs
- **THEN** rows are stamped from the CURRENT effective items (a retained
  `update()` delivered before play is honored — 8 items ⇒ 8 rows), clamped
  by `maxItems` when set

#### Scenario: Every stamp shows at most maxItems rows

- **WHEN** a repeater with `maxItems: 3` is constructed on the canvas, sent a
  list of 8 before play, and then played
- **THEN** 3 rows show on the canvas and 3 at the take

#### Scenario: A hand-edited limit is read one way everywhere

- **WHEN** an exported page carries `maxItems` of `0`, `-1`, `NaN` or `null`
  over 3 authored rows
- **THEN** the build-time stamp and the driver both show 3 rows; `2.5` shows 2

### Requirement: Columned items editing

The shared items editor SHALL render one column per child field
(`columns: {key, label}[]` derived from the child composition's fields) in
BOTH the inspector and the preview field form; editing a cell updates that
row's rendered values, and unknown item fields are preserved (the existing
editor invariant). `B-106`: in the inspector the editor SHALL know the row
limit — `Add item` is withheld once the rows reach it, the reason ("At most N
rows (max items). Raise max items to add more.") on its row, and a row past
the limit (authored before the limit was lowered) SHALL read "not shown",
titled with why, and stay editable.

#### Scenario: A cell edit updates the row

- **WHEN** a row cell is edited in the items editor (inspector or preview
  field form — columns derived from the child's fields)
- **THEN** that row's rendered values update; unknown item fields are
  preserved (existing editor invariant)

#### Scenario: The inspector refuses a row past the limit

- **WHEN** a repeater with `maxItems: 3` already has 3 rows
- **THEN** `Add item` is withheld with its reason, and pressing it adds nothing

#### Scenario: Rows past the limit are flagged

- **WHEN** a repeater has 4 rows and `maxItems` is lowered to 2
- **THEN** rows 3 and 4 read "not shown", with the reason as their title
