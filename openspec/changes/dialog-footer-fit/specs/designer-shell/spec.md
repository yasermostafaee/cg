## ADDED Requirements

### Requirement: A dialog's footer keeps every button inside the dialog

The Designer's shared dialog footer SHALL keep every one of its buttons inside the dialog's box at every window
size and text scale the Designer supports. While one row holds the buttons, the footer SHALL be that row — packed
to its end, in DOM order, with the footer's gap — and when one row does not, it SHALL stack them into a column of
full-width buttons in the same order, the primary last. A button whose label is wider than the dialog SHALL wrap
the label inside itself rather than overflow. The rule belongs to the shared footer, so it holds for every dialog
built on it, including an action row nested in a footer, and no dialog is special-cased.

A label MAY be shortened so that its row fits, with its long form kept as the button's `title`.

#### Scenario: The clip dialog's three buttons fit one row at the smallest window

- **WHEN** the clip dialog opens at 1100 × 700 or at 1024 × 640, at the default text size
- **THEN** `Cancel`, `Add as backdrop` and `Extend the composition` sit in one row inside the dialog, in that
  order, packed to its end, and the backdrop button's `title` is `Add as backdrop — follow the composition`

#### Scenario: A large text scale stacks the buttons inside the dialog

- **WHEN** the root font size becomes 150 % or 200 % while the clip dialog is open
- **THEN** every button lies inside the dialog, one per line at the footer's full width, in DOM order
- **AND** the one row returns when the text scale returns to the default

#### Scenario: Every three-button dialog keeps its buttons inside

- **WHEN** the Save before switch dialog opens at a 200 % root font size, and the size then changes to 150 % and
  to the default
- **THEN** every button lies inside the dialog at each size, and at the default size they sit in one row
