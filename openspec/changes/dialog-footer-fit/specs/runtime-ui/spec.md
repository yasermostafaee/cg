## ADDED Requirements

### Requirement: A dialog's action row keeps every button and label inside the dialog

Every Runtime dialog's footer SHALL keep each of its buttons, and each button's label, inside the dialog at every
window size the console supports, for every dialog size and footer variant. While one row holds the footer it
SHALL be that row, unchanged. When a button would leave the row, or would be squeezed narrower than its own label,
the footer SHALL stack into a column: every button the footer's full width, in DOM order with `Cancel` first, and
a label longer than the dialog wrapping inside its button. An info line beside the buttons SHALL keep its place
at the start. The rule belongs to the primitive's footer, so no dialog is special-cased.

#### Scenario: Short labels keep the one row

- **WHEN** the confirm dialog opens at 1100 × 700 with its own labels
- **THEN** its buttons sit in one row inside the frame, as before

#### Scenario: Long labels stack inside the frame

- **WHEN** the confirm's buttons carry labels longer than the dialog is wide
- **THEN** every button and every label lies inside the frame, the buttons stacked at the footer's full width with
  `Cancel` above the destructive action
- **AND** they stay inside at 550 × 350, and the one row returns when the labels are short again
