# dialog-footer-fit

## Why

The owner's check of `0.11.3` (2026-10-07, `RELEASE-0114-01` Part B1, picture 1): CG Designer's "This clip is
longer than the composition" dialog drew `Cancel` outside the dialog, left of its edge. Its three labels —
`Cancel`, `Add as backdrop — follow the composition`, `Extend the composition` — are wider than the 440 px card,
and the shared footer is a `nowrap` row packed to its end, so the row overflows its START edge. Measured in
Chromium at 1100 × 700: `Cancel` 47.9 px past the card's left edge; at a 150 % root font size, `Cancel` 291.3 px
and the backdrop button 199.7 px past it.

The Runtime's modal primitive has the same row inside a frame that clips. Measured there with long labels, the
buttons stay inside the frame because they carry a `min-width` and SHRINK instead — and both labels overrun their
buttons. Same defect, second face. `B-319`.

## What changes

- **The shared footer fits (`B-319`).** Both modal primitives — the Designer's `shell/Modal` and the Runtime's
  `ui/Modal`, every size and footer variant — keep the row exactly as it is while one row holds the buttons, and
  stack them into a column of full-width buttons, in DOM order, when it does not: a button's box would leave the
  row, or a button would be squeezed narrower than its own label. A label longer than the dialog wraps inside its
  button. Fixed once, in the footer; no dialog is special-cased.
- **One fit, shared (`@cg/gesture`).** The decision is one headless hook, `useActionRowFit`, which marks the row
  `data-stacked`; each app's stylesheet draws the column. The Designer's one nested action row (`VideoImportModal`)
  uses the same row (`ModalActions`) instead of a local copy of the footer's style.
- **A shorter label (`B-319`).** The clip dialog's backdrop button reads `Add as backdrop`; its long form,
  `Add as backdrop — follow the composition`, is the button's `title`.

## Impact

- `packages/gesture` (new export `useActionRowFit` and its predicates), `apps/designer` (`shell/Modal`,
  `DurationGuardDialog`, `VideoImportModal`), `apps/runtime` (`ui/Modal`, `controls.css`).
- Visual only: no wire, schema, persisted key or refusal condition changes.
- Specs: `designer-shell` and `runtime-ui` (ADDED — the footer keeps its buttons inside the dialog);
  `designer-video-element` (MODIFIED — the backdrop choice's label and its `title`).
