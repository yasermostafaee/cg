## ADDED Requirements

### Requirement: An imported book is read as a book without a re-export

CG Control's import SHALL derive the template's field form, its page lists and its page from the package's scene after
`withPageLists`: every `list` field bound by `sequence-items` to a sequence whose items and whose default are all
pictures SHALL be a page list (marked `pages`, recorded in `TemplateInfo.pageLists`) even without a stored mark, and a
stepped picture sequence no field drives SHALL be given its page list (`pages-<elementId>`, the sequence's name). CG
Bridge reads the same record. A package already exported SHALL need only a re-import.

#### Scenario: telavat2.vcg imported as it is

- **WHEN** a package of `telavat2.vcg`'s shape (a key `a1` bound to 87 pictures, no `pages` mark, advance auto) is
  imported
- **THEN** `a1` is the template's page list, a book that stops at its ends, and the row reads `1 / 87`

#### Scenario: A book with no Data key

- **WHEN** the same book without a Data key is imported
- **THEN** the template has the page list `pages-<elementId>` labelled with the sequence's name
