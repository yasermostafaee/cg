# Tasks — `add-image-pages` (`D-163`)

## 0. Measure before building (`IMAGE-PAGES-01` §0)

- [x] 0.1 `B-102` reproduced (4 red jsdom tests) and fixed first, with `D-064`, in `eb00cf7e`.
- [x] 0.2 How Next travels today, cited (design.md §0.2); Previous / Go to use `__cg.page`.
- [x] 0.3 The console → bridge file path, cited (design.md §0.3); reused as `media.put`.
- [x] 0.4 How templates are served, cited; the template origin's route set is a security boundary,
      so pictures travel inline. Measured on the owner's CasparCG (design.md §0.4).
- [x] 0.5 Golden rule 10 decided (design.md §0.5).

## 1. Schema

- [ ] 1.1 `SequenceImageItemSchema` (exactly one of `assetId` / `media`), `imageFit`, `ListField.pages`.
- [ ] 1.2 `CgControl.page` with a defensive reader (`data:image/png|jpeg|webp` only).
- [ ] 1.3 Tests: an old sequence parses unchanged; the one-source refinement; the control reader.

## 2. The page (template runtime)

- [ ] 2.1 Picture items drawn by `buildImage`; `src` from `assetUrls` or the media cache.
- [ ] 2.2 Decode before swap; a missing or undecodable picture keeps the previous page.
- [ ] 2.3 `previous()` and `goTo()` (latest-wins; before start sets the starting page); no wrap
      under a finite repeat, mirror under `'infinite'`.
- [ ] 2.4 `runtime.previous()`, `runtime.goTo()`, and `__cg.page` read on `update()` and `play()`.
- [ ] 2.5 Media cache of three; nodes only for the current and incoming page.
- [ ] 2.6 Tests for every scenario of the sequence spec delta.

## 3. Designer

- [ ] 3.1 `naturalCompare` in `@cg/text-shaping` (all three digit sets), tested.
- [ ] 3.2 `Add pictures…` and `Add folder…`; book defaults on the first pictures; page count.
- [ ] 3.3 Picture items in the items editor (name shown; reorder and remove as today).
- [ ] 3.4 `imageFit` control; a picture-only sequence may take a Data key (seeds a page list).
- [ ] 3.5 The exporters carry each picture item's asset; round-trip test.
- [ ] 3.6 Preview transport: Previous beside Next.

## 4. CG Control and CG Bridge

- [ ] 4.1 `TemplateInfo.pageLists` recorded at import.
- [ ] 4.2 `media.put` channel; the bridge's row-media store (header check, limits, atomic write).
- [ ] 4.3 Page list validation on `stack.update`; row state `pages`, persisted and synced.
- [ ] 4.4 `stack.page` (next / previous / page number); state only off air; one `CG UPDATE` on air.
- [ ] 4.5 The take carries the current page; an on-air page-list change keeps the page or goes to 1.
- [ ] 4.6 Removal and start-up sweep of unreferenced pictures.
- [ ] 4.7 Console: page-list editor (Load pictures / Load folder, natural order, refusals, progress).
- [ ] 4.8 Console: the row's `12 / 300`, Previous, Next and page box.
- [ ] 4.9 Tests: upload, serve inline, restart persistence, removal, refusal sentence, second console.

## 5. Verification

- [ ] 5.1 Designer e2e: twelve files and a folder → pages in natural order.
- [ ] 5.2 CG Control e2e: load pages on a row, Next, Previous, Go to.
- [ ] 5.3 On the owner's CasparCG: 300 pages, no blank frame at the chosen transition, process
      memory flat across all 300 and back (numbers in the report).
- [ ] 5.4 Full gate; push; a Linux `e2e` that RAN, cited here by run URL.
