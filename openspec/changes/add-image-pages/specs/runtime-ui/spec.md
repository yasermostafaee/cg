## ADDED Requirements

### Requirement: The operator loads a book of pictures on a row and turns its pages

For a template field that is a page list, the CG Control Inspector SHALL offer `Load pictures…` and
`Load folder…` in place of the list editor, sort the picked files in natural file-name order, refuse
a file over the limits with a sentence naming the file and the limit, send each picture to CG Bridge
showing progress, and stage the resulting page list like any field value. The Inspector SHALL show
the current page (`12 / 300`) with Previous, Next and a page box that takes the operator's page
number in Latin, Persian or Arabic-Indic digits, with Go beside it on the same line. The row SHALL
show the same `12 / 300`; its NEXT SHALL turn the page, and its PREV SHALL be in the row's menu, so
a book row keeps the same buttons, in the same columns, as every other row.

#### Scenario: A folder becomes the row's book

- **WHEN** the operator loads a folder of 300 pictures on a row and applies it
- **THEN** the row's page list holds 300 pages in natural order and the row reads `300 pages`

#### Scenario: Previous, Next and Go to move the counter

- **WHEN** the operator presses Next, then Previous, then types `۱۲` in the page box
- **THEN** the counter reads `2 / 300`, then `1 / 300`, then `12 / 300`

#### Scenario: A book row keeps the table's shape

- **WHEN** a row carries a book
- **THEN** its buttons are the same as any loaded row's, on one line under their column headers, and
  PREV is offered in the row's menu
