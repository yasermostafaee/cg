# Tasks — book-page-lists (B-353; RUN-NEXT-VERSION-02 Part 1.1)

Lane: **FULL** — what CG Control reads from a package at import (its page lists), a persisted key's meaning (`pages`),
and a scene migration that runs in the on-air page.

## 1. The cause, read from the owner's file

- [x] 1.1 `telavat2.vcg` read: `a1` = `list`, default = 87 pictures, no `pages`; bound `sequence-items`; sequence
      `advance: 'auto'`, `repeat: 1`, fade/fade. `a1`'s key order is `rebuildField`'s — its last writer.
- [x] 1.2 `advance`: the `page-mv9wduov-N` ids are `addSequencePictures`' (one stamp, 18:54:12Z), which has set `manual`
      since `c98418ff`; so `auto` was set by the owner after `Add folder…`.

## 2. One rule, in `@cg/shared-schema`

- [x] 2.1 `isPageListField`, `withPageListMark`, `pageListsOf` asks it; `migratePageListMarks` registered in
      `SCENE_MIGRATIONS`; `withAutoPageLists` + `withPageLists` for export and import.
- [x] 2.2 Tests `page-lists.test.ts` (telavat2's shape) — red against the old sources (15/15), green now. The two
      `operator-steps.test.ts` books that marked TEXT items `pages: true` now hold pictures (a book's real shape); their
      assertions are unchanged.

## 3. The Designer keeps the mark at every door

- [x] 3.1 `rebuildField` carries `pages`; `setSequenceItems` flips instead of dropping on text ↔ pictures; re-adopt and
      bind-from-canvas mark (and give a book its pages); the Exporter writes `withPageLists`.
- [x] 3.2 Tests `sequence-pages.test.ts` (every order of clicks; export with and without a key) — 8 red at HEAD, green
      now.
- [x] 3.3 Inspector: the auto-advance sentence; a page list's key shows no "Allow file source".
      `book-inspector.dom.test.ts`.

## 4. CG Control

- [x] 4.1 The import runs `withPageLists` before deriving fields, page lists and the page.
- [x] 4.2 The generic list editor names pictures read only and stages nothing.
- [x] 4.3 Tests `telavat2-book.test.ts`, `listFieldPictures.test.ts` — 3 red at HEAD, green now.
- [x] 4.4 e2e `telavat2-book.spec.ts` (87 pages through Import a .vcg: no text box, Load folder…, `1 / 87`, Next,
      Previous, Go; a keyless book) — red on a CG Control built from HEAD's import, green now (Windows, non-authoritative).
- [ ] 4.5 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_

## 5. Docs

- [x] 5.1 `B-353` filed in `docs/prd/bugs-designer.md`; registry entry.
