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
  nodes; the page keeps the addresses of at most three operator pages.
- **Designer.** `Add pictures…` / `Add folder…` take many files or a whole folder, import each as a
  project asset (deduplicated by SHA-256) and add one picture item per file in natural file-name
  order (`page2` before `page10`; Persian and Arabic-Indic digits sort as numbers). The first
  pictures turn the sequence into a book: transition **Crossfade**, manual advance, one pass. A
  sequence made only of pictures may take a Data key, which seeds a page-list field. The Inspector
  shows a book as a card (count, first thumbnails, `Manage pages…`, and adding pictures, a folder, a
  text or a composition item); the **Pages manager** shows and arranges every item (thumbnails, text
  and composition cards edited in place, drag, select and remove, sort by name, a List view). The
  Preview transport gains Previous.
- **Fade (schema, runtime, Designer).** A sequence edge may be `fade`; fade/fade together is a true
  dissolve (the two items added, never dimmed mid-way) — presets `Crossfade` and `Fade out, fade in`.
  The preset field is `transition` and the time field `duration`, withheld under Hide-show.
- **CG Control and CG Bridge.** On a row whose template has a page list, the operator picks pictures
  or a folder. Each picture travels to CG Bridge on the existing authenticated socket and is stored
  under the bridge's state home, beside the template store, by content hash. The Inspector reads
  `12 / 300` with Previous, Next and a page box; the row shows `12 / 300`, its NEXT turns the page and
  PREV is in its menu. Pages survive a bridge and a console restart, are deleted with the row, and
  every console on the channel sees the same pages. A take carries the current page; each page turn
  names exactly the page asked for, and a row's turns apply one at a time.
- **Transport (design.md §0.4).** CasparCG fetches each picture from the **template server**, by a
  read-only `GET /page/<sha256>.<ext>` — the host rule templates follow, a backup core included, no
  new port — and a page turn names the picture's address. The first build carried the picture inside
  the operator's `CG UPDATE`; measured, CasparCG 2.5.0 keeps ~2.6 MB of memory per 1 MB update for
  the life of the process, so that was overturned. `SECURITY.md` is amended for the third route.
- **`B-102` + `D-064`** (images inside a sequence item or a repeater row never reached air) are fixed
  first, in their own commit, because a picture item would have met the same cause.

## Impact

- `@cg/shared-schema` (elements, fields, control payload), `@cg/template-runtime` (sequence driver,
  runtime verbs), the Designer (sequence inspector, items editor, asset import, exporter asset walk),
  `@cg/shared-ipc` (template info, a pages channel, a page channel, row state), CG Bridge (page
  store, the template server's page route, page delivery, a per-row page queue, removal sweep),
  `@cg/single-file-export` (the template CSP: `img-src data: 'self'`) and CG Control (page-list
  editor, book bar, row page controls). `SECURITY.md` and ADR 0009 are amended for the page route.
- A book template must be **re-imported** in CG Control after this build (`C-034`): CG Control makes
  the served page at import, and only a page made by this build admits `img-src 'self'`. Templates
  without a book are unaffected.
- No new AMCP command and no new port. One new route on the template server (read-only pictures).
