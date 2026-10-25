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
- [x] 1.1.6 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

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
- [x] 1.2.7 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

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
- [x] 1.4.5 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

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
- [x] 1.5.6 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

## 1.6 — A book with text pages stays a book (FULL lane: the schema's rule, the bridge, the page)

- [x] 1.6.1 Cause: `sequenceItemsBinding` (`@cg/shared-schema` `elements.ts`) answered `null` for pictures mixed
      with text, so the Designer dropped the binding (`setSequenceItems`) and CG Control lost Load folder and the
      page tools; `isPageListField` also required every default item to be a picture.
- [x] 1.6.2 The ONE rule changed in the ONE place: `pages` = at least one picture, every other item a text page;
      `null` only for a composition item. `isPageListField` (via `isBookValue`), `pageListsOf`, the import's
      repair and the automatic page list all read it — they cannot disagree.
- [x] 1.6.3 The Designer: the key stays when a text page is added; the one sentence where a key disappears
      (a composition item): the specified hint kept, opening "The item list can’t be data-bound while this
      sequence has a composition item, and it is not a book in CG Control", then what the author can still do.
      ⚠ First shipped (`170897ca`) as one shorter sentence, which dropped the specified "you can still edit" half
      and failed two Designer e2e specs that pin it (golden rule 9's sweep, missed); restored in the push that
      fixed it, the two specs unchanged.
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
- [x] 1.6.9 The owner's follow-up (2026-10-21, mid-run): a book of four pictures and a text page, given a Data key,
      showed FIVE text boxes in the Preview's data form, four empty. Cause: `ListItemsEditor` knew a picture
      only in its Inspector form (`compositions` passed); the Preview uses the plain form, where a picture's
      missing text is an empty box. Before 1.6 such a book lost its key, so the form never saw it. Fixed:
      `PictureItem` (thumbnail + name) in both forms. Tests: `book-preview-list.dom.test.ts` — RED on
      `HEAD` (`['', '', 'test1']`), green; e2e `sequence-add-text.spec.ts` › 1.6 (the Preview, in Chrome).
- [x] 1.6.8 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

## 1.7 — The Designer's `Add text` shows its result (FULL lane: Designer state and undo history, the page runtime's API)

- [x] 1.7.1 Cause, proved (red in Chrome on `b1b14de3`: `2 pages` after `Add text`): the card counted and drew
      PICTURES only (`SequencePagesControl.tsx`, `pictures.length` and the first four pictures), the canvas rests a
      sequence on its first item (a sequence is time-driven; the canvas never plays), and the new, empty item sat at the
      end where nothing looked — so a click changed nothing visible. And `PageAddButtons` committed with no history
      boundary: two clicks inside `COALESCE_MS` (300 ms, `store-core.ts`) undid as one.
- [x] 1.7.2 `sequenceItemFocus` (session-only store state) + `focusSequenceItem`; ONE predicate, `shownItemIndex` /
      `shownSequenceItem` (`slices/view.ts`): the focused item while its sequence is the one selected element and the
      item exists. `Add text` / `Add composition`: `runAsSingleHistoryEntry` per click, then focus the new item.
- [x] 1.7.3 The card: `itemCountText` (a book's text pages are pages — the manager's wording too), a strip of every
      item around the one being worked on (`stripWindow`; a face picks it), the text page's box in the card, focused
      after `Add text`.
- [x] 1.7.4 The canvas: `runtime.showSequenceItem(elementId, index)` (the driver's `goTo` on one sequence); the preview's
      `sequence-item` message, re-asserted after every rebuild and on a fresh document. README + canvas README.
- [x] 1.7.5 Superseded assertion: `sequence-pages.spec.ts` — the manager counts two pictures and a text page `3 pages`
      (was `3 items`); swept by test id (`pages-manager-count`, `sequence-page-count` — 12 hits) and by the string
      (`N items` — 2 hits, one changed).
- [x] 1.7.6 Tests: e2e `sequence-add-text.spec.ts` (each click: counted, marked, focused, on the canvas; two quick
      clicks, two undos; and 1.6's Data key kept) — RED on `b1b14de3`, green; `page-items.test.ts` (count, strip,
      the predicate); `sequence-pages.test.ts` in the page runtime (`showSequenceItem` — red without it).
- [x] 1.7.7 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

## 1.3 — PVW's NEXT turns the loaded pages (FULL lane: a verb that reaches the bridge)

- [x] 1.3.1 Cause, proved: PVW's NEXT called the page's local `next()` (`RehearsalFrame.tsx`, the frame
      handle's `next`) — a step the bridge never heard of (the counter stayed `1 / 3`), onto a page whose
      picture the frame did not have, so the driver kept the page on screen.
- [x] 1.3.2 A book row's NEXT on PVW is `stack.page` (`next`), as the row's NEXT (`layerRowActions`);
      PVW follows the bridge's page. Any other row: unchanged.
- [x] 1.3.3 Test: e2e `book-pvw.spec.ts` › 1.3 — RED on the 1.1 commit (`1 / 3` after PVW's NEXT), green.
- [x] 1.3.4 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

## Delta A — the book block: no empty boxes, thumbnails as on air, one Load button (`DELTA-RUN-NEXT-VERSION-03-A`)

- [x] A.1 No empty slots (FAST lane: layout). Cause: the strip drew slots `current - 1, current, current + 1`
      whatever existed. `pagesAroundCurrent` (`bookPages.ts`): up to three pages that exist — on page 1 pages
      1–3, on the last page the last three, a one- or two-page book only its own, centred at the same size;
      the current page marked wherever it sits (accent edge + a ring drawn as a shadow). Kept still: every
      cell is a third of the strip and every face a fixed frame shape, so a turn changes only what fills the
      cells — measured from the block's own origin (a click scrolls the Inspector; that is not a jump).
- [x] A.2 Thumbnails as on air (FULL lane: `TemplateInfo.pageLists[].fit`, an IPC field). Cause: the face was a
      grid row sized by its content, so the picture's `height: 100%` never resolved and it took the frame's
      width — cropped, whatever the fit. One `PageFrame` draws every face in the strip and in `Manage pages…`:
      the row's raster as the frame's shape, PVW's checker, the picture at the sequence's own fit
      (`sequencePictureFit`, the one rule the page runtime uses too; absent = `contain`), a text page's words
      small and centred. Nothing sent to CasparCG changes.
- [x] A.3 One Load button (FULL lane: a drop is a new door into the loader that sends page bytes to CG Bridge;
      the send itself is unchanged). `Load pages… ▾` (the app's `ContextMenu`) → `Pictures…` / `Folder…`,
      each titled "Replaces the book's pictures…"; a drop on the block replaces the pictures (1.6's rule),
      saying `Drop to replace the pictures` while held; a drop on `Manage pages…` appends, saying
      `Drop to add pages`; the dialog's `Add…` / `Replace with folder…` stay. One loader for all
      (`loadPictureFiles`); a dropped folder is read through its entry, every level, keeping its path, so the
      block says `Folder "IN"` for a dropped folder as for a picked one.
- [x] A.4 Ripples (golden rule 9; two axes): by STRING (`Load pictures`, `Load a folder`, `Load folder`,
      case-insensitive) and by COMPONENT (every runtime test driving a `filechooser` or `[data-book-load]`).
      Six book specs moved onto one fixture step, `app.chooseBookPages`. The Designer named the retired
      `Load folder…` twice — its export refusal and a book's Data key hint — now `Load pages…`
      (`designer-composition-export` MODIFIED here; `designer-sequence-element` delta updated). CG Control's
      strip rule is named `pagesAroundCurrent`, apart from the Designer's `stripWindow` (a different rule).
- [x] A.5 Tests: e2e `book-thumbs.spec.ts` (first/last page and one-/two-page books — no empty box, nothing
      moves; a `contain` portrait drawn whole with bars and a `cover` one filled, sampled PIXELS, strip and
      `Manage pages…`) — red on `7eec321b` for the owner's reasons, green; e2e `book-load.spec.ts` (the menu's
      two items, `Folder…` a folder picker, one aligned row; a folder and files dropped on the block; a folder
      and a file dropped on the dialog — through Chrome's own drag input with real paths; the block at
      1280×720 and 200 % text, in RTL); unit `page-lists.test.ts` (`fit`), `bookPages.model.test.ts`.
- [x] A.6 Measured at 1280×720 and 200 % text, in RTL, in Chrome (`book-load.spec.ts`). Found there: the
      readouts were drawn `3 / 1` (the strip's counter, the page box, the row's counter in the table) — digits
      reordered around the neutral `/`. A number readout is LTR chrome: `dir="ltr"` on the caption and the
      page box, an LTR `<bdi>` in the row. Measured from the engine's glyph boxes, the instrument proved live on
      a planted bare `1 / 4` in an RTL span.
- [x] A.7 Linux `e2e` discharged on the pushed commit — run URL:
      https://github.com/yasermostafaee/cg/actions/runs/39709186385 — `5eba7f81`, completed
      `success`; the E2E job RAN (Designer 343 passed, CG Control 374 passed, 2 skipped).

## Delta B — live Auto/Manual state, terminal transition and self-stop

- [x] B.1 Reproduce and isolate: Auto advances inside the baked template runtime while CG Bridge's persisted
      `pages` index moved only on operator commands; absolute live turns therefore used a stale page.
- [x] B.2 Export each book's authored `advance`; add retained row-local `pageAdvance`,
      `stack.set-page-advance`, live configuration-only `CG UPDATE`, and Inspector Auto/Manual controls.
- [x] B.3 Add `book-page` / `POST /page-state`: current-token and live-row validation, in-range page state update,
      published counter, stale-token refusal; keep the token reusable until completion.
- [x] B.4 Send live Previous/Next as relative turns resolved by the page, queue turns during entrance/load/motion,
      keep Go to and off-air state absolute, and serve stored Auto pages at the bare hash route.
- [x] B.5 Treat a page-list sequence as an element-outro owner: STOP/OUT and final Next play its authored
      `transitionOut`; natural/final completion reports through `/complete` and reaches graceful STOP.
- [x] B.6 Replace the Designer's obsolete drift warning with the authored-default/live-override contract; update
      active specs, security route census and decision record.
- [x] B.7 Tests: runtime page reports/mode/queued turns/terminal and Stop transitions; completion adapter; HTTP route
      and security census; bridge integration; CG Control model and real-browser Inspector mode control.
- [x] B.8 Full `pnpm gate`, CG Control + Designer E2E, conventional commit and push to `dev`; Linux E2E RAN and
      passed for commit `19f789b5`: https://github.com/yasermostafaee/cg/actions/runs/40219232417
