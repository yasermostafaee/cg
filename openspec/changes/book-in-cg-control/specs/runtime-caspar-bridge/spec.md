## MODIFIED Requirements

### Requirement: Next, Previous and Go to SHALL move from the page actually shown

`stack.page { itemId, field, to }` with `to` = `next`, `previous` or a page number SHALL move the
row's page for that page list. A row that owns live seats SHALL send Next/Previous as one relative
`CG UPDATE`, so the page resolves it from what it actually shows even when Auto advanced after the bridge's last
snapshot; Go to SHALL remain absolute. Relative turns arriving during an entrance, decode or transition SHALL queue
in order and none SHALL be lost. A row with no live seats SHALL resolve and store an absolute page and send nothing.
Under a wrapping list Next/Previous wrap. Under a non-wrapping list Previous on the first page stays put; Next on the
last off-air page stays put, while Next on the last live page is the terminal turn described below. A take SHALL carry
the current absolute page and advance mode of the template's first page list. Changing the pages of a row SHALL keep the row on the page it was on, wherever the edit
moved it; when the edit removed that page and the new book still shares pages with the old one, on
the page that now stands in its place (the one that followed it, or the new last page); and for a book
sharing no page with the old one, on the same page number when it has it, else page 1 — one rule,
`pageAfterBookChange` in `@cg/shared-ipc`, read by CG Bridge and the offline mock alike. The page is
told in the same command as the new book; the row's counter reads the page it is on.

#### Scenario: A page turn on air sends one relative command naming one picture

- **WHEN** the operator presses Next on an on-air book row at page 12 of 300
- **THEN** the bridge sends one `CG UPDATE` whose `__cg.page` names `turn: next` and page 13's address — not its
  bytes — and the live page report makes the row read `13 / 300`

#### Scenario: Ten presses at once turn ten pages

- **WHEN** ten Next presses reach the bridge at once on an on-air book at page 1 of 12
- **THEN** the answers read pages 2 to 11 in order, and the page receives ten relative Next turns and reaches page 11

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

### Requirement: A live book SHALL report its page and terminal end through its current take token

The page runtime SHALL report every page it actually begins showing as `{ take, field, index }` to
`POST /page-state` on its own origin. CG Bridge SHALL accept a non-negative in-range index only when the token names
the row's current live take; it SHALL update and publish the row's page without spending that token. An unknown, stale,
off-air or malformed report SHALL be a `404` with no side effect. Auto and Manual SHALL therefore share one live
counter. A finite book that naturally advances past its final page, or receives live Next there, SHALL play the final
page's authored `transitionOut`, report completion through the existing take-token `/complete` channel, and land on
the same graceful STOP path as a self-ending graphic. Operator STOP/OUT SHALL play the same page transition but SHALL
NOT emit a second natural-completion report. The page server SHALL serve an already-stored picture at
`GET /page/<sha256>` as well as its extension-bearing compatibility path, so an Auto turn can fetch a page whose URL
was not carried by an operator command.

#### Scenario: Auto progress is accepted without spending completion

- **WHEN** a current take reports pages 2 and 3, then naturally ends
- **THEN** both page reports update the row, the same token remains valid, and its one completion report gracefully
  stops the row

#### Scenario: A stale page report changes nothing

- **WHEN** a previous take reports page 9 after the row was re-taken
- **THEN** the route answers `404` and the current row's page is unchanged

#### Scenario: Stop and terminal Next use the authored page exit

- **WHEN** the operator presses STOP on any page, or Next on the last live page, of a book whose transition out is Fade
- **THEN** the visible page fades out before the row settles; terminal Next then self-stops once, while operator STOP
  sends no completion report

### Requirement: CG Control SHALL set a row's book advance mode

`stack.set-page-advance { itemId, field, mode }` SHALL store a row-local `auto` or `manual` override, publish and retain
it, and use the template's authored mode when no override exists. A row that owns live seats SHALL receive exactly one
configuration-only `CG UPDATE`; a row with no live seats SHALL receive no command, and its next take SHALL carry the
choice. The verb SHALL never seat, play, unmute or fill content.

#### Scenario: Manual interrupts an Auto book without a playout verb

- **WHEN** the operator changes an on-air Auto book to Manual
- **THEN** one `CG UPDATE` carries only the mode change, the current page stays visible, and no `PLAY`, `ADD`, fill or
  volume command is sent

### Requirement: A book's text page SHALL travel as text

A page list value MAY hold TEXT pages (`{ id, text }`) among its pictures (`RUN-NEXT-VERSION-03` 1.6). CG Bridge SHALL
accept it (a text page names no picture to hold), count it as a page, and a turn onto it SHALL carry the page and no
picture address; the page draws the text in the sequence's own style.

#### Scenario: A turn onto a text page

- **WHEN** a book of a picture, a text page and a picture is taken and turned to page 2
- **THEN** one `CG UPDATE` carries `"page":{"field":"pages","turn":"next"}` and no `media`, and the next turn names the
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
