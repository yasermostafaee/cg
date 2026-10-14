## ADDED Requirements

### Requirement: Picture items in a sequence

A sequence item SHALL also be a PICTURE item `{ kind: 'image', id, assetId?, media?, name?, dwellMs? }`
carrying exactly one of `assetId` (a page the author put in the template, a project asset) or
`media` (the SHA-256 of a page the operator loaded, held by CG Bridge). A sequence SHALL carry one
`imageFit` for all its pictures, with the image element's `fit` values and default `contain`. A
picture item SHALL be drawn by the image element's own renderer, never a second one. The widening is
additive: every sequence authored before it parses unchanged, with no schema-version bump.

#### Scenario: An old sequence parses unchanged

- **WHEN** a sequence authored before picture items is parsed
- **THEN** it parses to the same value, with no `imageFit` and no picture item injected

#### Scenario: A picture item round-trips through export and import

- **WHEN** a sequence holding picture items is exported as a `.vcg` and unpacked
- **THEN** its items and `imageFit` come back unchanged and the package carries each picture's asset

#### Scenario: A picture item needs exactly one source

- **WHEN** a picture item names both `assetId` and `media`, or neither
- **THEN** the schema refuses it

### Requirement: Add many pictures at once, in natural order

The Designer SHALL offer `Add pictures…` (many files) and `Add folder…` on a sequence. Each file
SHALL be imported through the existing asset import (deduplicated by SHA-256) and become one picture
item, in natural file-name order: digit runs compare as numbers in Latin, Persian and Arabic-Indic
digits alike (`page2` before `page10`, `صفحه۲` before `صفحه۱۰`). For a sequence holding pictures,
the Inspector's Items section SHALL be a card — the page count, the first pages as thumbnails,
`Manage pages…`, and the add row `Add pictures…`, `Add folder…`, `Add text`, `Add composition` — and
SHALL NOT list the pages one row each; the pages are seen and arranged in the Pages manager. Every
button SHALL say what it does in its tooltip, drawn above any dialog. The first pictures added to a
sequence SHALL make it a book: transition Crossfade (`fade`/`fade`, simultaneous), `advance:
'manual'`, `repeat: 1`, all of which the author can change.

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

### Requirement: Fade and crossfade between items

A sequence edge SHALL also be `fade`: no motion, the item's opacity eased in (IN) or out (OUT) over
`transitionMs` through the shared ease-in-out curve. IN and OUT both `fade` under `simultaneous` SHALL
be a DISSOLVE that adds the two items (`plus-lighter` in an isolated box) so the picture never dims
mid-way, and SHALL leave the item at rest with no opacity, blend or isolation of its own; under
`sequential` the current item fades out, then the next fades in. The Inspector SHALL offer the
presets `Crossfade` (fade/fade simultaneous) and `Fade out, fade in` (fade/fade sequential), name the
preset field `transition` and the time field `duration`, and withhold `duration` — shown, disabled,
saying why — when Hide-show leaves nothing to time.

#### Scenario: A crossfade never dims the page

- **WHEN** a book of opaque pages crossfades from one page to the next
- **THEN** every frame shows the pages mixed at full brightness — no darker frame between them, no
  blank frame — and at rest the page carries no fade styling

#### Scenario: Hide-show has no duration to set

- **WHEN** the author picks Hide-show
- **THEN** the `duration` field is disabled and its tooltip says Hide-show swaps at once

### Requirement: The Pages manager

The Pages manager SHALL show every item of the sequence as a numbered card in reading order — a
picture as a thumbnail scaled down once and kept for the session (never every page decoded at full
size) with its file name, a text item as its text box (typed in the sequence's Digits), a composition
item as its composition picker. It SHALL add pictures, a folder, a text item or a composition item in
the grid itself; move an item by dragging it (the selected items move together) and by an earlier /
later button on each card; remove one item, or a selection made by clicking a thumbnail or a card's
number (Shift-click selects a run); sort the pictures in natural file-name order, a text or
composition item keeping its place; and offer the sequence's item editor as a List view. Each change
SHALL be one edit, applied at once and undoable; Done SHALL only close.

#### Scenario: Drag, step, remove a selection, sort

- **WHEN** the author drags page 4 before page 1, moves page 1 one step later, selects two pages and
  removes them, then sorts by name
- **THEN** the cards follow each change in that order, the count reads the pages left, and the sort
  restores natural file-name order

#### Scenario: Every kind is added where the author is

- **WHEN** the author adds a text item from the Inspector's card, types its text in the grid, and
  adds a composition item in the grid
- **THEN** the sequence holds them in that order, the composition card shows the first composition,
  the List view shows the same text, and every add button carries a tooltip

### Requirement: Previous and Go to beside Next

The page runtime SHALL implement `previous()` and `goTo(index)` beside `next()`. Under a finite
`repeat`, Previous on the first item SHALL stay on it and Next on the last item SHALL stay on it (the
book does not wrap); under `'infinite'`, Next SHALL wrap as today and Previous SHALL mirror it.
`goTo` SHALL be absolute and latest-wins: a request arriving during a transition SHALL be applied
when the transition ends, never dropped; before a run starts it SHALL set the item the run starts on.
A bridge-driven page turn SHALL arrive as the `__cg.page` member of a `CG UPDATE`
(`{ field, index, media? }`), which an older page ignores.

#### Scenario: The book does not wrap

- **WHEN** a sequence with `repeat: 1` shows its last page and Next arrives, or its first page and
  Previous arrives
- **THEN** the same page stays on screen

#### Scenario: An infinite sequence wraps both ways

- **WHEN** a sequence with `repeat: 'infinite'` shows its first item and Previous arrives
- **THEN** it moves to the last item

#### Scenario: Go to during a transition is not lost

- **WHEN** `goTo` arrives while a transition is running
- **THEN** the sequence moves to that page as soon as the transition ends

### Requirement: A page turn never shows a blank frame

A picture SHALL be decoded before it replaces the page on screen. A picture whose bytes are missing
or cannot be decoded SHALL leave the previous page on screen. Only the page on screen and the page
coming in SHALL exist as nodes. An operator page SHALL arrive as an ADDRESS on the template's own
origin (`/page/<sha256>.<ext>`) — never as bytes — and the page SHALL keep at most three of them; any
other value in `__cg.page.media` SHALL be dropped.

#### Scenario: The old page holds until the new one is decoded

- **WHEN** a page turn's picture takes time to decode
- **THEN** the old page stays fully on screen until the new one is ready, then the new one replaces
  it

#### Scenario: A page that cannot be shown keeps the previous one

- **WHEN** a page turn names a picture the page does not have or cannot decode
- **THEN** the previous page stays on screen
