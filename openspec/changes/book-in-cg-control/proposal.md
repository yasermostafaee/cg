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

## Impact

- **Specs:** `runtime-ui`, `runtime-caspar-bridge` (ADDED).
- **Code:** `@cg/shared-ipc` (`pages.get`), CG Bridge (`getPage`, route, scope), `@cg/template-runtime`
  (`page-pictures-host`, the fill, `alt`), CG Control (`pagePictures`, `bookPageOf`, PVW's frame, the mock).
- **Wire:** one new read channel; `__cg` unchanged.
