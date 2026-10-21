## ADDED Requirements

### Requirement: A picture sequence's Data key is a page list whatever order the author worked in

A `list` field bound by `sequence-items` to a sequence SHALL be a page list exactly when every item of the sequence,
and every item of the field's default, is a picture; an empty sequence SHALL keep the field's stored mark. The rule
SHALL be one predicate in `@cg/shared-schema` (`isPageListField`), and the Designer SHALL keep the stored `pages` mark
equal to it after every edit: a field-meta edit (Title, Description, Required, Digits, Allow file source) SHALL keep
the mark; a change of the items from text to pictures or back SHALL keep the Data key and flip the mark (only a list
that mixes text and pictures, or holds a composition item, loses its key); a list re-adopted by a Data key or bound
from the canvas SHALL take the mark, and a book given an empty list SHALL take its pages as the default. Opening a
project SHALL repair a mark that disagrees with the rule (a registered scene migration, identity-preserving).

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

#### Scenario: Pictures replaced by text

- **WHEN** a keyed picture sequence's items are replaced by text items
- **THEN** the key is kept as a text list, without the page-list mark

#### Scenario: An old project with a lost mark opens repaired and clean

- **WHEN** a project whose book field lacks the mark (the owner's `telavat2` shape) is opened
- **THEN** the field carries the mark and the project reads as saved

### Requirement: A stepped picture sequence exports as a book without a Data key

The `.vcg` export SHALL give every sequence of the package's root (or entry composition) that holds only pictures, that
the operator steps, and whose items no field drives, a page list: id `pages-<elementId>`, the sequence's name as its
label, the pictures as its default, and a `sequence-items` binding. The author's project SHALL NOT gain the field. A
sequence the operator does not step SHALL NOT get one.

#### Scenario: A keyless book exports with its page list

- **WHEN** a composition holding a picture sequence with no Data key is exported
- **THEN** the package's `template.json` has a field `pages-<elementId>`, labelled with the sequence's name, marked a
  page list, bound to the sequence's items

#### Scenario: A lost mark is exported marked

- **WHEN** a book whose key field lacks the mark is exported
- **THEN** the package's field carries `pages: true`

### Requirement: A book on advance auto is said in the Inspector

The Designer's Inspector SHALL show one sentence under **advance** when a sequence holds only pictures, is stepped by
the operator, and is set to `auto`: that the book turns itself every dwell while CG Control counts only the operator's
turns, so its page number falls behind and its Next goes to the page after the last one it sent; and that advance
manual is the setting for a book the operator turns. A page list's Data key SHALL NOT offer "Allow file source"; it
SHALL say that operators turn and load its pages in CG Control (Load folder…).

#### Scenario: Auto is said, manual is not

- **WHEN** a book's advance is `auto`
- **THEN** the sentence shows, naming the dwell; with `manual`, or for a sequence that runs by itself, or for text, it
  does not

#### Scenario: A book's key offers no text-file grant

- **WHEN** a book's Data key section is open
- **THEN** there is no "Allow file source" control, and a line names Load folder…
