## MODIFIED Requirements

### Requirement: Next, Previous and Go to on a page list move one absolute page

`stack.page { itemId, field, to }` with `to` = `next`, `previous` or a page number SHALL move the
row's page for that page list: under a non-wrapping list Next on the last page and Previous on the
first stay put; under a wrapping list they wrap. A row's turns, and an update on a row with a book,
SHALL be applied one at a time in the order received, each from the page the one before it left.
When the row's template is on its layer (pre-rolled or on air) a turn SHALL send exactly one
`CG UPDATE` carrying `__cg.page` with the new index and that page's address; on any other row it
SHALL change state only and send nothing. A take SHALL carry the current page of the template's first
page list. Changing the pages of a row SHALL keep the row on the page it was on, wherever the edit
moved it; when the edit removed that page and the new book still shares pages with the old one, on
the page that now stands in its place (the one that followed it, or the new last page); and for a book
sharing no page with the old one, on the same page number when it has it, else page 1 — one rule,
`pageAfterBookChange` in `@cg/shared-ipc`, read by CG Bridge and the offline mock alike. The page is
told in the same command as the new book; the row's counter reads the page it is on.

#### Scenario: A page turn on air sends one command naming one picture

- **WHEN** the operator presses Next on an on-air book row at page 12 of 300
- **THEN** the bridge sends one `CG UPDATE` whose `__cg.page` names index 12 (page 13) and page 13's
  address — not its bytes — and the row reads `13 / 300`

#### Scenario: Ten presses at once turn ten pages

- **WHEN** ten Next presses reach the bridge at once on an on-air book at page 1 of 12
- **THEN** the answers read pages 2 to 11 in order, and the page is told indexes 1 to 10 in order

#### Scenario: A page turn on a row with nothing on its layer sends nothing

- **WHEN** the operator presses Next on a book row whose template is not on its layer
- **THEN** the row's page number changes and no command reaches CasparCG; the next take opens on it

#### Scenario: Another console sees the same pages

- **WHEN** one console loads a book on a row
- **THEN** a second console on the same channel shows the same page count and page number

#### Scenario: Reordered on air, the page on screen stays

- **WHEN** a book on air on page 3 is reordered so that page comes first
- **THEN** the row is on page 1 and the same `CG UPDATE` names that page's picture

#### Scenario: Removed on air, the page that followed takes its place

- **WHEN** that page is then removed from the book
- **THEN** the row is on the page that followed it

#### Scenario: A wholly new book keeps the page number it still has

- **WHEN** a book on page 3 is replaced by a book sharing none of its pages, first of five pages, then of two
- **THEN** the row is on page 3, then on page 1

## ADDED Requirements

### Requirement: A book's text page SHALL travel as text

A page list value MAY hold TEXT pages (`{ id, text }`) among its pictures (`RUN-NEXT-VERSION-03` 1.6). CG Bridge SHALL
accept it (a text page names no picture to hold), count it as a page, and a turn onto it SHALL carry the page and no
picture address; the page draws the text in the sequence's own style.

#### Scenario: A turn onto a text page

- **WHEN** a book of a picture, a text page and a picture is taken and turned to page 2
- **THEN** one `CG UPDATE` carries `"page":{"field":"pages","index":1}` and no `media`, and the next turn names the
  third page's picture

### Requirement: A stored page picture SHALL be read back by its hash

`pages.get` SHALL answer the bytes and type CG Bridge stores for a page picture's SHA-256 — the file
its template server serves CasparCG for that hash — or `no-page` when it holds none. It SHALL be a
read: judged by the `read` permission, acting on no channel, sending nothing to CasparCG, and not
keeping a picture alive (only a row naming it does).

#### Scenario: Read back

- **WHEN** a picture is stored and then read back by its hash
- **THEN** the answer is the same bytes, as `image/png`, and nothing reaches CasparCG

#### Scenario: Not held

- **WHEN** a hash the bridge does not hold is asked for
- **THEN** the answer is `no-page`
