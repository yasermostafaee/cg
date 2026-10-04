## ADDED Requirements

### Requirement: A dialog's action button declares a ROLE, and the role decides its treatment

Every action in a Runtime dialog's footer SHALL declare one of exactly three roles, and the
role SHALL determine the button's treatment. A dialog SHALL NOT choose a button's colour or
variant directly, and a caller that cannot use the shared action component SHALL resolve its
variant from the same table rather than re-picking one.

The three roles and what each ASSERTS:

- `primary` — **this is the action the dialog exists to perform**, and pressing it COMMITS
  something. Exactly one action per dialog may claim it, and a dialog that commits nothing
  has none.
- `destructive` — **this removes something or takes it off air.** It carries the loudest
  resting treatment in the palette, because a confirm dialog is the one place a destructive
  control should read destructive before it is pressed.
- `cancel` — **this leaves without committing.** It is a peer of the action beside it and is
  never borderless: neutral must not mean invisible.

#### Scenario: One role resolves to one treatment across every dialog

- **WHEN** two different dialogs each render an action of the same role **THEN** both buttons
  carry the same treatment, and neither dialog specifies a colour of its own

#### Scenario: A caller that cannot use the shared component resolves from the same table

- **WHEN** an action must render its own busy or error state and therefore cannot be the
  shared action component **THEN** it resolves its variant from the shared role table, and
  the result matches what the component would have produced for that role

### Requirement: A footer button that dismisses and commits nothing is `cancel`

A dialog's footer action whose only effect is to close the dialog SHALL declare the `cancel`
role, whatever word it is labelled with. It SHALL NOT declare `primary`.

This holds for a read-only dialog, which has no primary action at all, and equally for a
dialog that COMMITS AS YOU GO — where each change reaches the bridge on its own control, so
that by the time the footer is reached there is nothing left to commit. The rule is about
what the button DOES, not what it is called: a dialog may still label such a button `Done`.

A dialog whose footer action DOES commit something SHALL keep the `primary` role. The rule
withholds the primary treatment from dismissals; it does not neutralise real actions.

#### Scenario: A dismiss-only footer does not wear the primary treatment

- **WHEN** a dialog's footer action's only effect is to close the dialog **THEN** it carries
  the `cancel` role and the neutral treatment, and pressing it closes the dialog and does
  nothing else

#### Scenario: A committing action keeps its primary treatment

- **WHEN** a dialog's footer action sends a change to the bridge **THEN** it carries the
  `primary` role, even where a sibling dialog built from the same component does not

### Requirement: A dialog's WIDTH follows whether its content must be compared across rows

Every Runtime dialog SHALL take one of exactly two widths. A dialog SHALL be `wide` if and
only if its content puts several values per row that the operator reads DOWN A COLUMN,
comparing one row against another; every other dialog SHALL be `prose`.

The criterion is the comparison, not the markup. A dialog that lists one item and one action
per row — read one row at a time and never compared column-wise — is `prose` however many
rows it has, and it may stack those rows into a column at prose width. A dialog whose columns
must stay aligned across rows cannot do that, because the alignment IS what the operator is
reading.

#### Scenario: A per-row comparison table is wide

- **WHEN** a dialog lists rows carrying several aligned values the operator compares down a
  column **THEN** it renders at the wide width

#### Scenario: A list read one row at a time is prose

- **WHEN** a dialog lists items with one name and one action each, read individually rather
  than compared **THEN** it renders at the prose width, and stacking its rows into a column
  is not a reason to widen it
