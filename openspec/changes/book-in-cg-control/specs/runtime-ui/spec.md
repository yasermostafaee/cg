## MODIFIED Requirements

### Requirement: The operator loads a book of pictures on a row and turns its pages

For a template field that is a page list, the CG Control Inspector SHALL offer one `Load pages… ▾` button
whose menu holds `Pictures…` and `Folder…`, and SHALL take files or a folder dropped on the book block, in
place of the list editor, sort the picked files in natural file-name order, FIT each
picture before it is sent — a picture larger than the row's channel frame on either side SHALL be
scaled to fit inside it (never upscaled, the aspect kept) and re-encoded, and one within the frame
but over the 4 MB page cap SHALL be re-encoded at its own size; a re-encoded picture SHALL be a PNG
when it is transparent and otherwise a JPEG at quality 0.92 (0.85 when that is still over the cap);
any other picture SHALL be sent exactly as picked — say in one line what fitting did
(`12 pictures were resized to fit 1920×1080`), refuse BY NAME only a picture still over the cap after
fitting or a file that is not a picture while the others load, send each picture to CG Bridge showing
progress, and stage the resulting page list like any field value. CG Bridge's own check SHALL remain
the guard. The Inspector SHALL show the page actually shown on air (`12 / 300`, under the current page's face),
an `Auto` / `Manual` row-local choice initialized from the Designer's authored mode, and one turning row —
`Previous`, a page box holding the current page that takes the operator's page
number in Latin, Persian or Arabic-Indic digits followed by ` / 300`, `Next`, `Go` — on one line,
one height. The row SHALL show the same `12 / 300`; its NEXT SHALL turn the page, and its PREV SHALL
be in the row's menu, so a book row keeps the same buttons, in the same columns, as every other row.

#### Scenario: A folder becomes the row's book

- **WHEN** the operator loads a folder of 300 pictures on a row and applies it
- **THEN** the row's page list holds 300 pages in natural order and the row reads `300 pages`

#### Scenario: Camera pictures are fitted, not refused

- **WHEN** the operator loads a 6000 × 4000 picture, a transparent 3000 × 2000 one, a 1600 × 900 one of
  4.3 MB and a small one, on a 1920 × 1080 channel
- **THEN** all four load; the first two are stored at 1620 × 1080 (a JPEG, and a PNG that keeps its
  alpha), the third as a JPEG at 1600 × 900, the fourth unchanged, and the line reads
  `2 pictures were resized to fit 1920×1080 · 1 picture was made smaller than 4 MB`

#### Scenario: Only what cannot be fitted is refused, by name

- **WHEN** one of the pictures is transparent noise that no PNG of fits in 4 MB
- **THEN** it is named — `scan.png could not be made smaller than 4 MB and was not loaded.` — and the
  others load

#### Scenario: Previous, Next and Go to move the counter

- **WHEN** the operator presses Next, then Previous, then types `۱۲` in the page box
- **THEN** the counter reads `2 / 300`, then `1 / 300`, then `12 / 300`

#### Scenario: Auto advances the live counter and Manual can interrupt it

- **WHEN** an on-air book advances from page 1 to page 2 in Auto, the operator presses Previous during its transition,
  then selects Manual
- **THEN** the Inspector and row follow the actual page through `1`, `2`, `1`; the manual turn is not lost, and no
  further dwell advances the book until Auto is selected again

#### Scenario: Next on the last live page is the terminal turn

- **WHEN** a finite book is on air on its last page and the operator presses Next
- **THEN** Next is enabled, the last page plays its authored transition out, the row stops itself, and PLAY is no
  longer marked active; on the same last page off air, Next stays disabled

#### Scenario: A book row keeps the table's shape

- **WHEN** a row carries a book
- **THEN** its buttons are the same as any loaded row's, on one line under their column headers, and
  PREV is offered in the row's menu

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

### Requirement: The Inspector's book block SHALL name the book and say, always, where its pages come from and whether they are on the row

A row's book SHALL be one block in the Inspector, on one grid, built from the console's primitives. Its heading
SHALL be the book's name — the field's Title when the author gave one, else its sequence's name
(`TemplateInfo.pageLists[].name`), else `Book` — never the field's id, which stays in the heading's tooltip; no
Inspector field heading SHALL print a field id beside its label. The block SHALL always show where the pages come
from (`Template's pictures`, `Folder "IN" · 87 pictures`, `Picked pictures · 12`, with `· N text pages` when there
are any; a folder's name isolated), whether they are on the row (`Not sent — press Update`, `On the row`), and a
strip of up to three pages that EXIST around the current one — the page before, the current page and the page
after where all three exist; on the first page the first three, on the last page the last three; a one- or
two-page book only its own pages, together in the middle at the same size — never an empty box, the current page
marked wherever it sits, and nothing in the block moving when a page turns. Each face SHALL be drawn as the air
shows it: the channel's frame shape (the row's raster) on PVW's checker, the picture placed at the sequence's own
picture fit (`TemplateInfo.pageLists[].fit`; `contain` when a template imported before it carries none), from the
console's pictures, the bridge's stored copies, or the template's own (read from the page CG Bridge stores); a
text page as its words, small; a picture that cannot be had as a wordless placeholder, never its file name. Then
the advance row (`Manual`, `Auto`) and the turning row (`Previous`, the page box with ` / count`, `Next`, `Go`, one height, one centre line, icons with
words) and the loading row — `Load pages… ▾` and `Manage pages…`, one height, one line; each control's accessible
name names the book. `Load pages… ▾` SHALL open a menu of `Pictures…` and `Folder…`, each saying in its title that
it replaces the book's pictures; files or a folder dropped on the block SHALL load the same way, the block saying
`Drop to replace the pictures` while they are held over it. It SHALL fit the Inspector at 1280×720 and at 200 %
text, in RTL.

#### Scenario: The owner's book, named and bound

- **WHEN** a book whose field `a1` has no Title of its own, on a sequence named `Sequence`, is selected, and a
  folder `IN` of three pictures is loaded, then applied
- **THEN** the heading reads `Sequence` and no `a1` is shown; the source reads `Template's pictures`, then
  `Folder "IN" · 3 pictures`; the state reads `On the row`, then `Not sent — press Update`, then `On the row`

#### Scenario: One aligned turning row

- **WHEN** the block is measured in Chrome at 1280×720
- **THEN** Previous, the page box, Next and Go share one height and one centre line, left to right, inside the
  Inspector

#### Scenario: The strip draws the template's own pages

- **WHEN** a template's book has its own pictures and its row is selected
- **THEN** the current and next faces are those pictures, read from the page CG Bridge stores

#### Scenario: No empty box on the first or the last page

- **WHEN** a four-page book is on page 1, and is turned to page 4
- **THEN** the strip reads `1 / 4`, `2`, `3`, then `2`, `3`, `4 / 4`, every face a page, the current one marked;
  the strip and the loading row keep their place in the block on every turn

#### Scenario: A one- or two-page book

- **WHEN** a one-page book, then a two-page book, is selected
- **THEN** the strip shows `1 / 1`, then `1 / 2` and `2`, each face the size of a three-page book's

#### Scenario: A portrait page as the air shows it

- **WHEN** a portrait picture is loaded on a book whose sequence fits `contain`, and on one that fits `cover`
- **THEN** in the strip and in `Manage pages…` the face is 16:9 for a 1920×1080 channel; the `contain` face shows
  the whole picture with bars beside it, and the `cover` face is filled

#### Scenario: One load button

- **WHEN** the operator presses `Load pages for Sequence`
- **THEN** a menu offers `Pictures…` and `Folder…`, and `Folder…` opens a folder picker

#### Scenario: A folder or files dropped on the block

- **WHEN** a folder `IN` of three pictures is dropped on the block, then two loose pictures
- **THEN** the source reads `Folder "IN" · 3 pictures`, then `Picked pictures · 2`, and the state
  `Not sent — press Update`

### Requirement: `Manage pages…` SHALL be the operator's tool for a book, and its edits SHALL stage

The book block's `Manage pages…` SHALL open the app's shared Modal holding a numbered grid of the book's pages, the
page on air and the page in PVW marked (`On air`, `PVW`); drag to reorder, and `Move earlier` / `Move later` on every
page as the keyboard path; `Remove` per page and the selected pages removed together; `Sort by name` (natural order —
`MRN (2)` before `MRN (10)` — text pages keeping their places); `Add pictures…` and `Add folder…` (appended, ids made
unique), files or a folder dropped on the dialog (appended, the dialog saying `Drop to add pages` while they are
held over it) and `Replace with folder…` (the pictures only, each text page keeping its place), all through the
console's fitting; each page drawn as the book block's strip draws it; `Add text page`, and a text page's words
edited in place. `Done` SHALL stage the edited book like every
Inspector edit — `Discard` and `Update` keep their meaning and nothing reaches air before Update. When the edit
removes the page on air, the dialog SHALL say which page takes its place at Update. The dialog SHALL fit at 1280×720,
at 200 % text and at 200 % browser zoom on a screen that shows the Inspector, in RTL, its footer inside it.

#### Scenario: The owner's check

- **WHEN** the operator moves page 3 earlier, removes page 1, sorts by name, adds a text page, moves it after the
  first picture, replaces the pictures with a folder, presses Done, then Discard
- **THEN** each step shows in the grid, Replace keeps the text page after the first picture, Done shows
  `Not sent — press Update`, and Discard puts the row's book back

#### Scenario: Update sends it

- **WHEN** the operator adds a text page, presses Done, then Update
- **THEN** the block reads `On the row` and the row's book has four pages

#### Scenario: The page on air

- **WHEN** a book on air on page 2 is opened, page 4 is dragged to the front, and the page on air is removed
- **THEN** page 2 is marked `On air`, still marked after the drag, and its removal reads `Page 2 is on air and is
removed; at Update, page 2 takes its place.`; after Update the row reads `2 / 3`

#### Scenario: Pictures dropped on the dialog are added

- **WHEN** a folder of `b.png` and `a.png`, then `a.png` alone, is dropped on a two-page book's dialog
- **THEN** the grid reads the two pages, then `a.png`, `b.png`, then `a.png` again, at the end

### Requirement: A book with text pages SHALL stay a book, and a load SHALL replace its pictures only

A row whose template's book holds pictures and TEXT pages SHALL be a book in CG Control (the book bar,
`Load pages…`), and the operator SHALL turn every page, text pages included. A load in the book block —
`Pictures…`, `Folder…` or a drop — SHALL replace the PICTURE pages only: each text page SHALL keep its place after the picture it followed
(those before the first picture stay first), and when the new pictures are fewer, the text pages that followed a
picture past their end SHALL move to the end, in their order.

#### Scenario: A load keeps the text page in place

- **WHEN** a book of picture 1, a text page, pictures 2 and 3 is loaded with two new pictures and applied
- **THEN** its pages are the first new picture, the text page, the second new picture, and the counter reads `1 / 3`

### Requirement: PVW's NEXT SHALL turn a book row exactly as the row's Next does

On a rehearsing row whose template has a book the operator turns, the preview bar's NEXT SHALL send
the row's own page turn (`stack.page`, `next`) — the bridge's page number moves, the row and the
Inspector say so — and PVW SHALL show the page the bridge then holds. On any other row, NEXT SHALL stay
the template's own step (`CG NEXT`'s entry point).

#### Scenario: PVW's NEXT on a loaded book

- **WHEN** a three-page book is loaded and applied, played on PVW, and PVW's NEXT is pressed twice
- **THEN** the Inspector and the row read `2 / 3`, then `3 / 3`, and PVW shows page 2, then page 3
