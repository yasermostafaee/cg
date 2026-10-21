## ADDED Requirements

### Requirement: A list of pictures is never shown as empty text boxes

When a `list` field whose items are pictures reaches the Inspector's generic list editor, the editor SHALL show each
picture's name, read only, and one sentence — "These are pictures. Import the template again to turn them." — and
SHALL stage nothing: no text box, no Add item, no From file. A page list SHALL still be edited by the book's own
editor (the book bar and Load folder…).

#### Scenario: Pictures in the generic editor

- **WHEN** a row's list field holds picture items and is not read as a page list
- **THEN** the Inspector names the pictures and says to import the template again, and Update cannot replace them

#### Scenario: The owner's book through the real import

- **WHEN** a package of `telavat2.vcg`'s shape is imported through Import a .vcg and loaded on a row
- **THEN** the Inspector shows no text box for `a1`, shows Load folder…, the book bar reads `1 / 87`, and Next,
  Previous and the page box with Go move it
