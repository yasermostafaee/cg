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
