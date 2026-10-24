## ADDED Requirements

### Requirement: The Preview's data form SHALL show a book's pictures as pictures

The Designer's list editor SHALL show a picture item as its thumbnail and its file name, never a box to
type in, wherever it shows a sequence's items — the Inspector, the Pages manager's List view, and the
Preview's data form for a bound list; only a text item SHALL take text. A picture keeps its dwell, its
move and its remove controls.

#### Scenario: A book with a text page, keyed, in the Preview

- **WHEN** a book of two pictures and a text page is given a Data key and the Preview is opened
- **THEN** the data form shows the two pictures by name and one text box, the text page's

## MODIFIED Requirements

### Requirement: A picture sequence's Data key is a page list whatever order the author worked in

A `list` field bound by `sequence-items` to a sequence SHALL be a page list exactly when the sequence is a BOOK — at
least one item a picture, every other item a TEXT page (`RUN-NEXT-VERSION-03` 1.6, the owner's decision: a book with
text pages is still a book) — and the field's default reads as one too; an empty sequence SHALL keep the field's stored
mark. The rule SHALL be one predicate in `@cg/shared-schema` (`isPageListField`, over `sequenceItemsBinding`), and the
Designer SHALL keep the stored `pages` mark equal to it after every edit: a field-meta edit (Title, Description,
Required, Digits, Allow file source) SHALL keep the mark; a change of the items from text to pictures or back, or a
text page added to a book, SHALL keep the Data key and set the mark the items call for (only a list that holds a
composition item loses its key, and the Data / Dynamic section SHALL say so in one sentence); a list re-adopted by a
Data key or bound from the canvas SHALL take the mark, and a book given an empty list SHALL take its pages as the
default. Opening a project SHALL repair a mark that disagrees with the rule (a registered scene migration,
identity-preserving).

#### Scenario: The key set before Add folder… survives as a page list

- **WHEN** an author gives a new sequence a Data key and then adds a folder of pictures (which replace the untouched
  samples)
- **THEN** the key is still there, its field is marked a page list, and its default is the pictures

#### Scenario: Allow file source does not unmake a book

- **WHEN** a picture sequence's Data key field has "Allow file source", Title, Description, Required or Digits edited
- **THEN** the field is still marked a page list

#### Scenario: Pages managed after the key stay a page list

- **WHEN** pages are removed or reordered in the Pages manager, or the sequence's Advance is changed, after the key was
  set
- **THEN** the field is still a page list and its default follows the pages

#### Scenario: A text page added to a book keeps the key

- **WHEN** a keyed book of two pictures gains a text page
- **THEN** the key is kept, the field is still marked a page list, and its default holds the three pages

#### Scenario: Pictures replaced by text

- **WHEN** a keyed picture sequence's items are replaced by text items
- **THEN** the key is kept as a text list, without the page-list mark

#### Scenario: A composition item loses the key, and says so

- **WHEN** a keyed book gains a composition item
- **THEN** the key and its field are removed, and the section reads `A sequence with a composition item has no Data key
and is not a book in CG Control.`

#### Scenario: An old project with a lost mark opens repaired and clean

- **WHEN** a project whose book field lacks the mark (the owner's `telavat2` shape) is opened
- **THEN** the field carries the mark and the project reads as saved

### Requirement: A stepped picture sequence exports as a book without a Data key

The `.vcg` export SHALL give every sequence of the package's root (or entry composition) that is a book (at least one
picture, every other item a text page), that the operator steps, and whose items no field drives, a page list: id
`pages-<elementId>`, the sequence's name as its label, its pages as its default, and a `sequence-items` binding. The
author's project SHALL NOT gain the field. A sequence the operator does not step SHALL NOT get one. CG Control's import
SHALL apply the same rule, so a package exported before it reads as a book without a re-export.

#### Scenario: A keyless book exports with its page list

- **WHEN** a composition holding a picture sequence with no Data key is exported
- **THEN** the package's `template.json` has a field `pages-<elementId>`, labelled with the sequence's name, marked a
  page list, bound to the sequence's items

#### Scenario: A keyless book with a text page

- **WHEN** a stepped sequence of two pictures and a text page, with no Data key, is exported
- **THEN** the package has its page list, the text page among its pages

#### Scenario: A lost mark is exported marked

- **WHEN** a book whose key field lacks the mark is exported
- **THEN** the package's field carries `pages: true`

### Requirement: A book's authored advance mode SHALL be its initial CG Control mode

The Designer's Inspector SHALL show one sentence under **advance** when a sequence is a book (pictures, with or without
text pages), is stepped by the operator, and is set to `auto`: Auto is the book's initial mode, CG Control follows the
page actually shown on air, and the operator can switch that row between Auto and Manual. The exported page-list
metadata SHALL carry the authored `advance` mode. A page list's Data key SHALL NOT offer "Allow file source"; it SHALL
say that operators turn and load its pages in CG Control (Load pages…).

#### Scenario: Auto is the initial mode, not a drift warning

- **WHEN** a book's advance is `auto`
- **THEN** the sentence says Auto is the initial mode and CG Control follows and can switch it; with `manual`, or for a
  sequence that runs by itself, or for text, it does not show

#### Scenario: A book's key offers no text-file grant

- **WHEN** a book's Data key section is open
- **THEN** there is no "Allow file source" control, and a line names Load pages…

### Requirement: Add many pictures at once, in natural order

The Designer SHALL offer `Add pictures…` (many files) and `Add folder…` on a sequence. Each file
SHALL be imported through the existing asset import (deduplicated by SHA-256) and become one picture
item, in natural file-name order: digit runs compare as numbers in Latin, Persian and Arabic-Indic
digits alike (`page2` before `page10`, `صفحه۲` before `صفحه۱۰`). For a sequence holding pictures,
the Inspector's Items section SHALL be a card — the count (`N pages` for a book, its text pages
counted; `N items` once it holds a composition item — the Pages manager's wording too), a strip of a
few items as faces (a picture's thumbnail, a text page's words) around the item the author is working
on, that item's text box when it is a text page, `Manage pages…`, and the add row `Add pictures…`,
`Add folder…`, `Add text`, `Add composition` — and SHALL NOT list the pages one row each; the pages
are seen and arranged in the Pages manager. `Add text` and `Add composition` SHALL each show their
result: the new item becomes the item the author is working on — marked in the strip, a text page's
box taking the focus — and each click SHALL be one undo step. A strip face SHALL pick the item to work
on. The canvas SHALL show the item being worked on while its sequence is the one selected element;
otherwise the sequence rests on its first item. Every button SHALL say what it does in its tooltip,
drawn above any dialog. The first pictures added to a sequence SHALL make it a book: transition
Crossfade (`fade`/`fade`, simultaneous), `advance: 'manual'`, `repeat: 1`, all of which the author can
change.

#### Scenario: Twelve files become twelve pages in natural order

- **WHEN** the author adds twelve files named `page1.png` … `page12.png`, picked in any order
- **THEN** the sequence holds twelve picture items in the order 1 … 12, the Inspector reads
  `12 pages` with no row per page, and the Pages manager lists them 1 … 12

#### Scenario: The pages render where the author works

- **WHEN** pictures are added with the Assets panel closed
- **THEN** the canvas and Preview draw the pictures themselves, not the missing-image placeholder

#### Scenario: A duplicate file is one asset

- **WHEN** two of the picked files have identical bytes
- **THEN** the project holds one asset for them and both items name it

#### Scenario: The first pictures make a book

- **WHEN** pictures are added to a sequence that has none
- **THEN** its transition is Crossfade, its advance manual and its repeat one pass

#### Scenario: Each Add text shows its result

- **WHEN** the author presses `Add text` on a book of two pictures, types a line, then presses it again
- **THEN** the count reads `3 pages`, then `4 pages`; each time the new page is marked in the strip and
  its text box has the focus; the canvas draws the typed line, then the new, empty page — never page 1

#### Scenario: One undo step per click

- **WHEN** the author presses `Add text` twice at once, then Undo, then Undo again
- **THEN** each Undo takes one page, and with the sequence no longer selected the canvas is back on page 1

#### Scenario: A book keeps its Data key when a text page is added

- **WHEN** a book whose Data key is set gains a text page
- **THEN** the key stays (`RUN-NEXT-VERSION-03` 1.6)
