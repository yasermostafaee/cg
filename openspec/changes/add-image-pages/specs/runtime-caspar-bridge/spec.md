## ADDED Requirements

### Requirement: The bridge holds a row's pages and delivers them inside the operator's own command

CG Bridge SHALL store pictures sent by a console with `media.put` (PNG, JPEG or WebP; at most 4 MB
and 3840 × 2160 pixels each) under its state home beside the template store, one file per picture
named by its SHA-256. A row's page list SHALL be an ordinary field value of picture items naming
those hashes; the bridge SHALL refuse a page list that names a picture it does not hold, or more than
500 pages. Pictures SHALL reach CasparCG only inside a `CG UPDATE` or `CG ADD` the operator caused,
as `data:` images in the `__cg.page` member — never from a new route on the template server and never
from a console PC.

#### Scenario: A picture is stored once

- **WHEN** two consoles send the same picture
- **THEN** the bridge stores one file and answers the same SHA-256 to both

#### Scenario: A picture over the limit is refused in the operator's words

- **WHEN** a console sends a picture larger than 4 MB or 3840 × 2160 pixels, or a page list of more
  than 500 pages
- **THEN** the bridge refuses it with a sentence naming the limit, and stores nothing

#### Scenario: Pages survive a restart and leave with their row

- **WHEN** CG Bridge restarts, and later the row is removed
- **THEN** the row still has its pages and its page number after the restart, and once it is
  removed every picture no other row names is deleted

### Requirement: Next, Previous and Go to on a page list move one absolute page

`stack.page { itemId, field, to }` with `to` = `next`, `previous` or a page number SHALL move the
row's page for that page list: under a non-wrapping list Next on the last page and Previous on the
first stay put; under a wrapping list they wrap. On a row that owns live layers it SHALL send exactly
one `CG UPDATE` carrying `__cg.page` with the new index and that page's picture; on any other row it
SHALL change state only and send nothing. A take SHALL carry each page list's current page. Changing
the pages of an on-air row SHALL keep the current page number when it still exists, else go to
page 1 and say so.

#### Scenario: A page turn on air sends one command with one picture

- **WHEN** the operator presses Next on an on-air book row at page 12 of 300
- **THEN** the bridge sends one `CG UPDATE` whose `__cg.page` names index 12 (page 13) and carries
  page 13's picture, and the row reads `13 / 300`

#### Scenario: A page turn on a row that is not on air sends nothing

- **WHEN** the operator presses Next on a book row that does not own live layers
- **THEN** the row's page number changes and no command reaches CasparCG

#### Scenario: Another console sees the same pages

- **WHEN** one console loads a book on a row
- **THEN** a second console on the same channel shows the same page count and page number
