# Tasks — `designer-fix-02`

## 1. Refuse what cannot work (FULL)

- [x] 1.1 `B-148` groupless duplicate box composition refused at export, both copies named; `look-carrier.test.ts`
      pin changed. `live-source-repeated`, read from `platesSharingASource`; separate plates on one source
      refused alike; each copy marked.
- [x] 1.2 `B-128` separator picker images only; a saved font / video separator repaired on open, told once.
      On-air behaviour measured first (Chrome 155: a broken-image icon with a grey border in every gap);
      the repair is outside undo and leaves the project unsaved.
- [ ] 1.3 `B-106` repeater `maxItems` in the row editor and at play.
- [x] 1.4 `B-249` per-composition export writes no dangling `entryCompositionId` (omitted, not rewritten;
      `pageListsOf` pinned to "a miss is not found").

## 2. Text fit and nested playout (FULL)

- [ ] 2.1 `B-147` interim: Auto Squeeze shown as unavailable, one short reason; saved values kept.
- [ ] 2.2 `B-099` probe reported; fixed if frozen.
- [ ] 2.3 `B-030` a timed auto-out child no longer strands a content-driven parent.

## 3. Sequences (FULL)

- [x] 3.1 `B-103` every sequence's first item enters with its transition (`0ea672fa`).
- [x] 3.2 `B-105` "Hide-show" → **Cut**, pinned (`sequence-presets.test.ts`); old label swept.

## 4. Live Source authoring (FULL)

- [ ] 4.1 `B-187` automatic `live-N` name per look, marked **auto** until confirmed or renamed.

## 5. FAST

- [ ] 5.1 `B-138` a missing video shows the "missing" picture as its still frame.
- [ ] 5.2 `D-156` Alt bypasses snapping in move, nudge, resize, rotate.
- [ ] 5.3 `R-040` + `R-037` `<composition> — item N` headings, stub on collision, `<bdi>`.

## 6. Verification

- [ ] 6.1 Full gate; push; a Linux `e2e` that RAN, cited here.
