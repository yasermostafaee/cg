# A book in CG Control: seen in PVW, turned from PVW, fitted, named, bound and managed (RUN-NEXT-VERSION-03 Part 1)

## Why

The owner checked a book + countdown template in CG Control on 2026-10-21 (`dev` `c23b1ce`, browser dev
servers; screenshot `Claude outputs/evidence-book-2026-10-21/`). After `Load folder…`, PVW drew each
picture's FILE NAME instead of the picture; PVW's NEXT turned the template's own pictures but not the loaded
ones; pictures over 4 MB were refused; the Inspector named the book by its field id
(`pages-el-1792581663991`) and did not say whether the loaded pictures were bound or sent; arranging the
pages needed a tool in CG Control, not in the Designer; and a book with a text page stopped being a book.

## What Changes

- **1.1 — PVW draws a loaded book's pictures.** PVW tells its frame the page a take would show, in the
  bridge's own `__cg.page` form, and hands the page the picture through the page's own runtime
  (`CG.providePagePicture`), as it already sets placement and sound: the frame's origin has no page route.
  The pictures are the bytes this console sent, else the bridge's own copy read back once (`pages.get`).
  A page never draws its picture's name (`alt=""`), and a page drawn before its address arrived is filled
  when it does.
- **1.2 — A page is fitted, not refused** (the owner's decision). Larger than the channel → scaled to fit
  (never up); over 4 MB → re-encoded; PNG when transparent, else JPEG 0.92. One line says it
  (`12 pictures were resized to fit 1920×1080`); only what is still over the cap is refused, by name.
  The bridge's own check stays the guard.
- **1.4 — The book block.** One block on one grid: headed by the book's name (never its field id — and no
  Inspector heading prints a field id any more), always saying where its pages come from and whether they are
  on the row, a strip of the pages around the current one, a turning row and a loading row.
- **1.6 — A book with text pages stays a book** (the owner's decision). The one rule
  (`sequenceItemsBinding`): at least one picture, every other item a text page; only a composition item
  makes a sequence unbindable, and the Designer says so in one sentence. CG Control's loads replace the
  picture pages only, each text page keeping its place; a text page travels as text.
- **1.3 — PVW's NEXT turns the book.** On a book row it is the row's own page turn (`stack.page`), and
  PVW follows the bridge's page; on any other row it is the template's step, as before.

## Impact

- **Specs:** `runtime-ui` (MODIFIED, ADDED), `runtime-caspar-bridge` (ADDED), `designer-sequence-element`
  (MODIFIED).
- **Code:** `@cg/shared-ipc` (`pages.get`), CG Bridge (`getPage`, route, scope), `@cg/template-runtime`
  (`page-pictures-host`, the fill, `alt`), CG Control (`pagePictures`, `bookPageOf`, PVW's frame, the mock).
- **Wire:** one new read channel; `__cg` unchanged.
