# Pages of pictures turned with Next / Previous / Go to — a book read on air (`D-163`)

## Why

The owner (2026-10-14): _"A very important feature: changing between different pictures by pressing
**Next**. Someone reads a book on air, the viewer sees the book's text, and the operator must be able
to move between the pages. Today it can be done with a sequence and one composition per page, but
with many pages that is very hard. It must be possible to choose all the pictures, or their folder,
at once."_ He confirmed the **operator** changes the book in CG Control; the Designer's pages are only
the template's defaults.

## What Changes

- **Schema (additive, no version bump).** A sequence item gains a third kind, `image`
  (`{ kind: 'image', id, assetId?, media?, name?, dwellMs? }`): `assetId` for a page the author put
  in the template, `media` (the picture's SHA-256) for a page the operator loaded in CG Control. The
  sequence gains ONE `imageFit` for all its pictures (the image element's `fit` values). A `list`
  field gains `pages: true`, which marks it as a page list. The reserved `__cg` control payload gains
  `page: { field, index, media? }`.
- **The page (template runtime).** A picture item is drawn by the image element's own renderer
  (`buildImage`), never a second one. The driver gains **previous** and **go to page N** beside next:
  under `repeat: 1` the book does not wrap (Next on the last page and Previous on the first stay
  put); under `'infinite'` Next wraps as today and Previous mirrors it. A new page is decoded BEFORE
  it replaces the old one, so a page turn never shows a blank frame, and a page that cannot be
  decoded leaves the previous page on screen. Only the page on screen and the one coming in exist as
  nodes; operator page bytes are kept for at most three pages.
- **Designer.** `Add pictures…` on a sequence takes many files or a whole folder, imports each as a
  project asset (deduplicated by SHA-256) and adds one picture item per file in natural file-name
  order (`page2` before `page10`; Persian and Arabic-Indic digits sort as numbers), showing the count.
  The first pictures turn the sequence into a book: transition **Cut**, manual advance, one pass. A
  sequence made only of pictures may take a Data key, which seeds a page-list field.
- **CG Control and CG Bridge.** On a row whose template has a page list, the operator picks pictures
  or a folder. Each picture travels to CG Bridge on the existing authenticated socket and is stored
  under the bridge's state home, beside the template store, by content hash. The row shows
  `12 / 300` with Previous, Next and a page box. Pages survive a bridge and a console restart, are
  deleted with the row, and every console on the channel sees the same pages. A take carries the
  current page; each page turn carries exactly the page asked for.
- **Transport (§0, design.md §2).** The pictures reach CasparCG **inside the operator's own
  `CG UPDATE`**, as the `data:` image the exported page's CSP already allows — not from a new route
  on the template server, which `SECURITY.md` forbids. The cost (CasparCG logs each command in full)
  is measured and put to the owner.
- **`B-102` + `D-064`** (images inside a sequence item or a repeater row never reached air) are fixed
  first, in their own commit, because a picture item would have met the same cause.

## Impact

- `@cg/shared-schema` (elements, fields, control payload), `@cg/template-runtime` (sequence driver,
  runtime verbs), the Designer (sequence inspector, items editor, asset import, exporter asset walk),
  `@cg/shared-ipc` (template info, a media channel, a page channel, row state), CG Bridge (media
  store, page delivery, removal sweep) and CG Control (page-list editor, row page controls).
- Templates must be **re-exported and re-imported** to carry picture pages (`C-034`).
- No new AMCP command, no new port, and no new route on the template server.
