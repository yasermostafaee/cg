## ADDED Requirements

### Requirement: The operator loads a book of pictures on a row and turns its pages

For a template field that is a page list, the CG Control Inspector SHALL offer `Load pictures…` and
`Load folder…` in place of the list editor, sort the picked files in natural file-name order, refuse
a file over the limits with a sentence naming the file and the limit, send each picture to CG Bridge
showing progress, and stage the resulting page list like any field value. The row SHALL show the
page count and, once taken, the current page (`12 / 300`) with Previous, Next and a page box that
takes the operator's page number in Latin, Persian or Arabic-Indic digits.

#### Scenario: A folder becomes the row's book

- **WHEN** the operator loads a folder of 300 pictures on a row and applies it
- **THEN** the row's page list holds 300 pages in natural order and the row reads `300 pages`

#### Scenario: Previous, Next and Go to move the counter

- **WHEN** the operator presses Next, then Previous, then types `۱۲` in the page box
- **THEN** the counter reads `2 / 300`, then `1 / 300`, then `12 / 300`
