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
digits alike (`page2` before `page10`, `صفحه۲` before `صفحه۱۰`). The Items section SHALL show the
page count. The first pictures added to a sequence SHALL make it a book: transition Cut
(`none`/`none`), `advance: 'manual'`, `repeat: 1`, all of which the author can change.

#### Scenario: Twelve files become twelve pages in natural order

- **WHEN** the author adds twelve files named `page1.png` … `page12.png`, picked in any order
- **THEN** the sequence holds twelve picture items in the order 1 … 12 and the Items section reads
  `12 pages`

#### Scenario: A duplicate file is one asset

- **WHEN** two of the picked files have identical bytes
- **THEN** the project holds one asset for them and both items name it

#### Scenario: The first pictures make a book

- **WHEN** pictures are added to a sequence that has none
- **THEN** its transition is Cut, its advance manual and its repeat one pass

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
coming in SHALL exist as nodes, and the page SHALL keep at most three delivered operator pictures.

#### Scenario: The old page holds until the new one is decoded

- **WHEN** a page turn's picture takes time to decode
- **THEN** the old page stays fully on screen until the new one is ready, then the new one replaces
  it

#### Scenario: A page that cannot be shown keeps the previous one

- **WHEN** a page turn names a picture the page does not have or cannot decode
- **THEN** the previous page stays on screen
