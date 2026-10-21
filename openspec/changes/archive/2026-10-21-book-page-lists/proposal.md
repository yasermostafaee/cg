# A picture sequence is a book in CG Control, whatever order it was made in (B-353, RUN-NEXT-VERSION-02 Part 1.1)

## Why

The owner exported `telavat2.vcg` (87 JPG pages, Data key `a1`) and loaded it on row 98. CG Control's Inspector
showed `FIELDS · a1` with six empty text boxes: no book bar (`1 / 87`, Previous, page box, Go) and no
`Load folder…`. An Update from those boxes would have replaced his pages with empty text.

Read in the file: `a1` is a `list` bound by `sequence-items` to a sequence of 87 picture items, its default the same
87 pictures, and it has **no `pages` mark**. `pageListsOf` required the mark, so the import recorded no page list,
the Inspector fell to the generic list editor, and `bookOf` answered `null`.

Measured — where the mark went: `a1`'s keys are, in order, `id, label, required, type, default, digits,
allowFileSource`. That is exactly the order `rebuildField` writes (`apps/designer/.../slices/fields.ts:152`), and
`setElementDataKey` writes another (`id, type, label, required, default, digits, pages`). So `a1` was last written by
`rebuildField`, which rebuilds a field from scratch and did not carry `pages`: ticking **Allow file source** (the only
writer of `allowFileSource: true`) — or editing Title, Description, Required or Digits — dropped the mark. A second
silent path exists beside it: `setSequenceItems` DROPPED the key when the items changed text ↔ pictures, so a key set
before `Add folder…` vanished (the new sequence's three samples are text, and `Add folder…` replaces them). The file
cannot say whether that drop also happened to the owner first; it can say the last writer was `rebuildField`.

`advance: 'auto'`: `addSequencePictures` has set `manual` on a sequence's first pictures since the commit that minted
the `page-<stamp>-N` ids the file carries (`c98418ff`), and the 87 ids share one stamp (one `Add folder…`, 18:54:12Z).
So the server that made the file set `manual`, and the owner set `auto` afterwards in the Inspector.

## What Changes

- **One rule, in `@cg/shared-schema`:** a `list` field bound by `sequence-items` to a sequence is a page list exactly
  when every item of the sequence — and of the field's own default — is a picture (`isPageListField`); an empty
  sequence keeps the author's mark. `pageListsOf` asks it; the stored `pages` mark records it.
- **The Designer keeps the mark equal to the rule at every door:** `rebuildField` carries it; a text ↔ pictures change
  KEEPS the key and flips the mark (only a mixed or composition list still drops it); a re-adopted orphan list and a
  list bound from the canvas take the mark and the pages. A registered scene migration (`migratePageListMarks`)
  repairs an old project on open, identity-preserving.
- **A stepped picture sequence is a book with or without a Data key** (BOOK-EXPORT Q2): the package gains a page list
  `pages-<elementId>`, labelled with the sequence's name. Made by the Designer's export and again by CG Control's
  import (`withPageLists`), never in the author's project.
- **CG Control repairs on import:** the owner's existing file, imported again without a re-export, is a book.
- **No blank text box for a picture:** a list of pictures that reaches the generic editor is named, read only, with one
  sentence, and stages nothing.
- **A book on `advance: auto` is said in the Designer's Inspector:** the page turns itself, but CG Bridge owns the page
  number and sends an absolute page per press, so CG Control's count falls behind and its Next goes back. CG Control
  still shows the book bar. A page list offers no "Allow file source" (a text-file grant) in the Designer.

## Impact

- **Specs:** `designer-sequence-element` (ADDED × 3), `runtime-template-library` (ADDED × 1), `runtime-ui` (ADDED × 1).
- **Code:** `@cg/shared-schema` (`page-lists.ts`, the migration), the Designer's fields slice, Exporter and Inspector,
  CG Control's import and list editor. No wire or persisted-key change: `pages` exists already; the auto field is an
  ordinary `list` field.
- **Owner-visible:** re-import `telavat2.vcg` as it is; restart both dev servers first.
