## ADDED Requirements

### Requirement: PVW SHALL draw a book's loaded pictures, never their names

PVW SHALL tell each rehearsing frame the page a take of its row would show — the template's first page
list, at the page the bridge holds the row on, clamped to the book PVW is rehearsing (staged over
applied) — in the bridge's own `__cg.page` form, on PLAY and whenever the page or its picture changes.
For an operator picture it SHALL first hand the page that picture through the page's own runtime
(`CG.providePagePicture`): the bytes this console sent, else the bridge's copy read back once by its
hash (`pages.get`). A picture neither holds SHALL be drawn as a placeholder with no words. The page
SHALL never paint a picture's file name, and a page drawn before its picture's address arrived SHALL
be filled when it arrives.

#### Scenario: A loaded folder in PVW

- **WHEN** the operator loads three pictures on a row that is on PVW and played
- **THEN** PVW draws the first picture's pixels, its `<img>` has an empty `alt`, and no file name is
  painted

#### Scenario: PVW follows a turn

- **WHEN** the book is applied and turned with Next, then Go to page 3
- **THEN** PVW draws page 2's picture, then page 3's

#### Scenario: After a reload

- **WHEN** the console is reloaded and the row is played on PVW again
- **THEN** PVW draws the page from CG Bridge's stored copy
