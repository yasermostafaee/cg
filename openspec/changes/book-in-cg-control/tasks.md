# Tasks — book-in-cg-control (RUN-NEXT-VERSION-03 Part 1)

## 1.1 — PVW draws a loaded book's pictures (FULL lane: an IPC channel, the page runtime)

- [x] 1.1.1 Cause, proved: PVW sent no `__cg.page` (`RehearsalFrame.tsx`, the payload builders), so a
      loaded picture had no address in the frame; the page drew its `<img>` with none and the browser
      painted `alt` = the file name (`scene-builder.ts` `buildImage` → `alt = element.name`); and the
      page accepts a picture address only in the page-route form (`control-payload.ts` `readPage`), which
      the console's origin cannot serve.
- [x] 1.1.2 `pages.get` (`@cg/shared-ipc`), CG Bridge `getPage` + route (`read`, no channel) + scope
      (station-wide), CG Control's bridge contract, socket and mock.
- [x] 1.1.3 The page: `alt=""` on a page picture; `CG.providePagePicture` (host pictures, `data:` only);
      a turn fills every page picture of its hash that has no source.
- [x] 1.1.4 CG Control: `pagePictures` (the bytes sent, else `pages.get`, held as Blobs; `data:` URLs for
      the frame), `bookPageOf`, PVW's page push and PLAY payload.
- [x] 1.1.5 Tests: e2e `book-pvw.spec.ts` (a real bridge; real pictures; PVW sampled) — RED on `HEAD`
      (PVW never red), green after; `sequence-pages.test.ts` (no alt; late fill; host picture; a `data:`
      address from the wire dropped); `book-pages.integration.test.ts` (read back; no-page; nothing on the
      wire); `pagePictures.dom.test.ts`; `mock-bridge-parity`.
- [ ] 1.1.6 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_

## 1.2 — A page is fitted, not refused (FULL lane: what is sent toward air)

- [x] 1.2.1 Cause: `PageListEditor.tsx` refused before sending (`PAGE_MAX_BYTES` 4 MB, `PAGE_MAX_PIXELS`,
      `PAGE_MAX_SIDE`), so camera and scanner pictures never loaded.
- [x] 1.2.2 `fitPicture` (`features/book/fitPicture.ts`): scale to the row's channel frame (never up,
      aspect kept), re-encode — PNG when transparent, else JPEG 0.92 (0.85 once more when still over);
      a picture that needs nothing is sent byte for byte. Decode and scale by `createImageBitmap`, encode
      by `convertToBlob`/`toBlob` — off the page's main thread. The bridge's check unchanged (the guard).
- [x] 1.2.3 One line (`page-fit-line`); refusals by name, the others still load; the row's channel raster
      passed to the editor.
- [x] 1.2.4 Superseded test rewritten: `book-pages.spec.ts` "a picture over the limit is refused" → "a file
      that cannot be read as a picture is refused" (the decision is fit, not refuse).
- [x] 1.2.5 Tests: e2e `book-fit.spec.ts` (6000 × 4000, transparent, heavy, small — stored sizes and types
      read back; a still-too-large one refused by name) — RED on `HEAD` (`0 pages`), green;
      `fitPicture.test.ts`.
- [x] 1.2.6 Measured in Chrome (the built app, `Load pictures…`): 80 pictures of 6000 × 4000 JPEG, 11.1 MB
      each → 23.8 s in all (≈0.3 s a picture), progress shown throughout (`Loading 1 / 80…`), the longest
      main-thread task 84 ms (one per picture) — the console stays responsive. Test mode: the bridge's
      transfer of each ~1 MB page is not in this figure.
- [ ] 1.2.7 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_

## 1.4 — The Inspector's book block: named, bound, tidy (FULL lane: a TemplateInfo field; an operator-name rule)

- [x] 1.4.1 Cause, proved: the Inspector's field heading printed the binding key beside every label that differed
      from it (`Inspector.tsx` FieldEditor, the `fieldKey` span — `Sequence pages-el-1792581663991`,
      `Target time targetTime`); the page list's controls were two components laid out separately (`PageListEditor`,
      `BookBar`), and nothing said whether a loaded folder was staged or on the row.
- [x] 1.4.2 `PageListInfo.name` / `TemplateInfo.pageLists[].name` (the sequence's name; optional, additive);
      `bookTitle` (Title → sequence name → `Book`); every Inspector field heading prints its label only, the key in
      its tooltip (swept: no other visible field id in CG Control's renderer — 112 files; 18 attribute hits, none
      visible; positive control: `HEAD`'s `Inspector.tsx:1133`).
- [x] 1.4.3 `BookBlock` (replaces `PageListEditor` + `BookBar`): facts (source, sent, count), the strip (before,
      current, after — console / bridge / authored pictures, text faces, placeholder), turning row, loading row;
      `loadPictures` (the shared pick → fit → send loop; a folder's pictures keep their folder in their name);
      `authoredPictures` (the template's own pictures from the stored page's `assetUrls`); `controls.css` `.cg-book`.
- [x] 1.4.4 Tests: e2e `book-block.spec.ts` (Chrome, 1280×720: name not id; source and sent through a real folder
      and Update; one aligned turning row inside the Inspector), `book-pvw.spec.ts` › 1.4 (the strip draws the
      template's own pictures from a real bridge); `bookFacts.test.ts`; `telavat2-book.spec.ts` now names the book
      `Sequence`, never `a1` / `pages-el-…`; schema `pageListsOf` assertions carry the name.
- [ ] 1.4.5 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_

## 1.5 — `Manage pages…` in CG Control (FULL lane: the book on the row; the bridge's page rule)

- [x] 1.5.1 `ManagePagesModal` in the shared Modal (`wide`, fixed frame): numbered grid, `On air` / `PVW` marks; drag
      to reorder + `Move earlier` / `Move later`; `Remove` per page + selected; `Sort by name` (natural, text pages keep
      places — the Designer's rule); `Add pictures…`, `Add folder…` (appended, `withUniqueIds`), `Replace with folder…`
      (pictures only); `Add text page` and in-place text editing; `Done` stages, `Cancel` drops. The sentence when the
      edit removes the page on air (`pageAfterBookChange`).
- [x] 1.5.2 The page on screen through an edit: `pageAfterBookChange` / `pageIdsOf` (`@cg/shared-ipc` `page-book.ts`),
      read by CG Bridge (`#pageIdsBefore`, `#keepPagesAfterUpdate`) and the mock (`#pagesAfterUpdate`) — one rule.
      `R-100`'s "else page 1" kept for a wholly new book; for an EDIT that removed the page on screen, the page that
      now stands in its place. The living requirement ("Next, Previous and Go to on a page list move one absolute
      page") is MODIFIED in `specs/runtime-caspar-bridge`, its old sentence replaced.
- [x] 1.5.3 Superseded assertions rewritten: bridge `book-pages.integration.test.ts` (the concurrent turn now ends on
      the new last page — its subject, "the page and the book agree", unchanged; "a new, shorter book goes to page 1"
      now uses a wholly new book), mock `bookPages.test.ts` (the same book's first two pages → its last page).
- [x] 1.5.4 Tests: e2e `manage-pages.spec.ts` (the owner's check: reorder, remove, sort, text page, Replace with folder,
      Discard, Update; the on-air mark, a drag, the removal sentence, the bridge's rule after Update; fit at 1280×720,
      200 % text, RTL, and 200 % zoom on a large screen — footer inside); `page-book.test.ts` (the rule);
      `book-pages.integration.test.ts` (reordered and removed on air); `bookPages.model.test.ts` (sort, ids, move).
- [x] 1.5.5 Found, not fixed (the shared Modal, every framed dialog): under CSS `zoom: 2` on the root the modal heights
      (`88vh`, `--r-modal-h-frame`'s `100vh`) are zoomed with the page and overflow the window. Real browser zoom at
      200 % on a 1280×720 window is a 640×360 page, below the console's 1100×700 floor (the Inspector is folded away);
      on a screen that keeps the Inspector, the dialog fits (measured, DPR 2).
- [ ] 1.5.6 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_

## 1.6 — A book with text pages stays a book (FULL lane: the schema's rule, the bridge, the page)

- [x] 1.6.1 Cause: `sequenceItemsBinding` (`@cg/shared-schema` `elements.ts`) answered `null` for pictures mixed
      with text, so the Designer dropped the binding (`setSequenceItems`) and CG Control lost Load folder and the
      page tools; `isPageListField` also required every default item to be a picture.
- [x] 1.6.2 The ONE rule changed in the ONE place: `pages` = at least one picture, every other item a text page;
      `null` only for a composition item. `isPageListField` (via `isBookValue`), `pageListsOf`, the import's
      repair and the automatic page list all read it — they cannot disagree.
- [x] 1.6.3 The Designer: the key stays when a text page is added; the one sentence where a key disappears
      (a composition item): `A sequence with a composition item has no Data key and is not a book in CG Control.`
- [x] 1.6.4 CG Control: `bookPages.ts` — `withPicturesReplaced`: a load replaces the PICTURE pages only; each text
      page keeps its place after its picture; past a shorter folder's end, at the end. The Inspector's load uses it.
- [x] 1.6.5 CG Bridge and the page: already carried a text page as text (`pageRefsOf` → no `media`; the page's
      text item) — pinned now, no change needed. No migration: `migratePageListMarks` (registered) re-marks a
      bound mixed list at open, and an older package's keyless mixed book gets its page list at import.
- [x] 1.6.6 Superseded tests rewritten: `page-lists.test.ts` ("a mixed sequence is never one"),
      `sequence-pages.test.ts` (Designer: "MIXING text and pictures cannot take a Data key", "a bound TEXT list
      that gains pictures loses its binding").
- [x] 1.6.7 Tests: e2e `telavat2-book.spec.ts` › 1.6 (a book with a text page is a book; a load keeps it in place)
      — RED on `HEAD`'s rule (no book bar), green; `page-lists.test.ts`, Designer `sequence-pages.test.ts`,
      `book-inspector.dom.test.ts`, `bookPages.model.test.ts`, page `sequence-pages.test.ts` (a turn onto a text
      page), bridge `book-pages.integration.test.ts` (accepted; no `media`).
- [ ] 1.6.8 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_

## 1.3 — PVW's NEXT turns the loaded pages (FULL lane: a verb that reaches the bridge)

- [x] 1.3.1 Cause, proved: PVW's NEXT called the page's local `next()` (`RehearsalFrame.tsx`, the frame
      handle's `next`) — a step the bridge never heard of (the counter stayed `1 / 3`), onto a page whose
      picture the frame did not have, so the driver kept the page on screen.
- [x] 1.3.2 A book row's NEXT on PVW is `stack.page` (`next`), as the row's NEXT (`layerRowActions`);
      PVW follows the bridge's page. Any other row: unchanged.
- [x] 1.3.3 Test: e2e `book-pvw.spec.ts` › 1.3 — RED on the 1.1 commit (`1 / 3` after PVW's NEXT), green.
- [ ] 1.3.4 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_
