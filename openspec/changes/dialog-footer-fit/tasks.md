## 1. One fit, shared (`@cg/gesture`)

- [x] 1.1 `useActionRowFit` / `watchActionRow` / `fitActionRow`: measure the row in its ROW form; mark it
      `data-stacked` when `rowDoesNotFit` — an item's box leaves the row's content box (`spillsOut`), or an item is
      squeezed narrower than its own content; refit on resize and on content change, on the next frame
- [x] 1.2 Unit tests drive the DECISION with stated boxes (jsdom has no layout, so no geometry claim there):
      `tests/actionRowFit.test.ts`, 20 tests, the file at 100 % coverage

## 2. The Designer

- [x] 2.1 `shell/Modal`: the footer is the shared `actionRow`, watched; stacked = a column of full-width buttons in
      DOM order, labels wrapping inside their buttons; the row unchanged while it fits
- [x] 2.2 `ModalActions` for an action row nested in a footer; `VideoImportModal` uses it, and its local copy of the
      footer's row style (`footerActions`) is gone
- [x] 2.3 `DurationGuardDialog`: `Add as backdrop`, its long form `Add as backdrop — follow the composition` in the
      button's `title`; `ModalButton` takes a `title`
- [x] 2.4 e2e `dialog-footer-fit.spec.ts`: the clip dialog at 1100 × 700 and 1024 × 640 (one row, in order, the
      footer's gap, packed to the end, the `title`); at 150 % and 200 % root font size (stacked, inside, and the
      row returns at 100 %); Save before switch at 200 %, 150 % and 100 %
- [x] 2.5 The oversized clip and its door moved to `tests/e2e/fixtures/longClip.ts`, shared with
      `duration-guard.spec.ts`

## 3. The Runtime

- [x] 3.1 `ui/Modal`: the footer watched for every size and footer variant; `.cg-modal-footer[data-stacked]` in
      `controls.css` (a column; buttons full width with wrapping labels; an info line keeps the start)
- [x] 3.2 e2e `modal-geometry.spec.ts` — the confirm relabelled with long labels at 1100 × 700 (stacked, inside, no
      label overrunning its button), at 550 × 350, and back to one row with its own labels

## 4. Verification

- [x] 4.1 Positive control, Designer: the new spec run against the unmodified footer failed 3 of 4 — `Cancel` 47.9
      px past the card's left edge at 1100 × 700; `Cancel` 291.3 px and the backdrop button 199.7 px past it at
      150 %; the zoom case never resolved. Save before switch fits on the old footer too.
- [x] 4.2 Positive control, Runtime: the new test against the unmodified footer failed on BOTH labels overrunning
      their buttons while every box stayed inside the frame — which is why the fit tests for an overrun as well
- [x] 4.3 Wording sweep (golden rule 9), two axes: by string (the long label in every dash spelling, per pathspec)
      and by component (the dialog's title, handler and component; every test locator for the backdrop button)
- [x] 4.4 Linux `e2e` on GitHub Actions for a commit carrying this change (`813123a6`), RAN green:
      https://github.com/yasermostafaee/cg/actions/runs/37615205789 (job 112771815709 — Runtime 336 passed,
      Designer 303 passed, read from the job log)
