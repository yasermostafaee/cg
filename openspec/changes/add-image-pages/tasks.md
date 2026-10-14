# Tasks — `add-image-pages` (`D-163`, `R-100`)

## 0. Measure before building (`IMAGE-PAGES-01` §0)

- [x] 0.1 `B-102` reproduced (4 red jsdom tests) and fixed first, with `D-064`, in `eb00cf7e`.
- [x] 0.2 How Next travels today, cited (design.md §0.2); Previous / Go to use `__cg.page`.
- [x] 0.3 The console → bridge file path, cited (design.md §0.3); reused as `pages.put`.
- [x] 0.4 How templates are served, cited. Inline delivery built first, measured on the owner's
      CasparCG and OVERTURNED (CasparCG keeps every `CG UPDATE`'s bytes); pictures are served by the
      template server's page route (design.md §0.4, `81a404d8`).
- [x] 0.5 Golden rule 10 decided (design.md §0.5): the gate is "the template is on its layer".

## 1. Schema

- [x] 1.1 `SequenceImageItemSchema` (exactly one of `assetId` / `media`), `imageFit`, `ListField.pages`.
- [x] 1.2 `CgControl.page` with a defensive reader (only `/page/<sha256>.<ext>` for that very hash).
- [x] 1.3 Tests: an old sequence parses unchanged; the one-source refinement; the control reader.

## 2. The page (template runtime)

- [x] 2.1 Picture items drawn by `buildImage`; `src` from `assetUrls` or the address a turn named.
- [x] 2.2 Decode before swap; a missing or undecodable picture keeps the previous page.
- [x] 2.3 `previous()` and `goTo()` (latest-wins; before start sets the starting page); no wrap
      under a finite repeat, mirror under `'infinite'`.
- [x] 2.4 `runtime.previous()`, `runtime.goTo()`, and `__cg.page` read on `update()` and `play()`.
- [x] 2.5 Addresses of three pages kept; nodes only for the current and incoming page.
- [x] 2.6 Tests for every scenario of the sequence spec delta.

## 3. Designer

- [x] 3.1 `naturalCompare` in `@cg/text-shaping` (all three digit sets), tested.
- [x] 3.2 `Add pictures…` and `Add folder…`; book defaults on the first pictures; page count.
- [x] 3.3 Picture items: the Inspector's card and the Pages manager (thumbnails, drag, step, select
      and remove, sort by name, List view) — `05318820`, after the owner's report of 88 rows.
- [x] 3.4 `imageFit` control; a picture-only sequence may take a Data key (seeds a page list).
- [x] 3.5 The exporters carry each picture item's asset; round-trip test.
- [x] 3.6 Preview transport: Previous beside Next; all six commands inside the panel (`fb0dd349`).
- [x] 3.7 The pages render on the canvas and in Preview with the Assets panel closed (`ffaf3d37`).
- [x] 3.8 The grid and the Inspector card add every kind (pictures, folder, text, composition); text
      and composition cards edited in place (`8dd48f40`).
- [x] 3.9 Tooltips on every control, drawn above dialogs (`73850bd7`).
- [x] 3.10 `fade` edge, a true Crossfade dissolve, presets, `transition time` (in seconds) named and withheld under
      Hide-show; a new book crossfades (`6803bbfe`).

## 4. CG Control and CG Bridge

- [x] 4.1 `TemplateInfo.pageLists` recorded at import.
- [x] 4.2 `pages.put` channel; the bridge's page store (header check, limits, atomic write).
- [x] 4.3 Page list validation on `stack.update`; row state `pages`, persisted and synced.
- [x] 4.4 `stack.page` (next / previous / page number); state only with nothing on the layer; one
      `CG UPDATE` naming the page's address otherwise; a row's turns queue (`4bba4daf`).
- [x] 4.5 The take carries the current page; a page-list change keeps the page or goes to 1.
- [x] 4.6 Removal and start-up sweep of unreferenced pictures.
- [x] 4.7 Console: page-list editor (Load pictures / Load folder, natural order, refusals, progress).
- [x] 4.8 Console: the book bar (`12 / 300`, Previous, Next, page box and Go on one line); the row's
      `12 / 300`, NEXT turns the page, PREV in the row's menu (`99fc12ec`).
- [x] 4.9 Tests: upload, the page route (served, refused around it), restart persistence, removal,
      refusal sentence, ten presses at once.
- [x] 4.10 The template server's `GET /page/<sha256>.<ext>`; CSP `img-src data: 'self'`;
      `SECURITY.md` amended; the route-set guard pins three routes (`81a404d8`).

## 5. Verification

- [x] 5.1 Designer e2e: twelve files and a folder → pages in natural order; the Pages manager; the
      pages render on canvas and Preview; the preview's six commands inside the panel.
- [x] 5.2 CG Control e2e: load pages on a row, Next, Previous, Go to; a refusal; the book row keeps
      the table's shape and the page box sits beside Go.
- [x] 5.3 On the owner's CasparCG (`127.0.0.1`): 300 pages of 1920×1080 PNG, paged to 300 and back
      twice — main process 826.0 → 827.6 MB then 775.8, renderer flat; **0 blank frames** in 3,159
      recorded on-air frames at Cut, and at Crossfade 0 blank and no darker frame in 2,484
      (design.md §0.4).
- [ ] 5.4 Full gate; push; a Linux `e2e` that RAN, cited here by run URL.
