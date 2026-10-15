# Every export is answered, and a book reaches CG Control or is told why (B-349, B-350, B-351, BOOK-EXPORT-01)

## Why

The owner made a book in the Designer (a Sequence, `Add folder…`, `Export (.vcg)` → `telavat.vcg`) and saw no
message. CG Control then refused the file: _"Unpack failed: End of data reached (data length = 0, asked index = 4).
Corrupted zip ?"_. The file was 0 bytes.

Measured:

- **The empty file came from a stale dev server, and the product's silence hid it.** The owner's Designer dev server
  (port 4000, running since 2026-10-14) served an `Exporter.ts` whose import list predated its body, so `preflight`
  threw on every export, a book or not. Chrome's save dialog had already created the file, EMPTY. `exportVcg` had no
  catch, so the rejection reached no one (`B-349`). A fresh dev server and the built app export the same book.
- **CG Control repeated the zip library's words** for an empty or broken file (`B-350`).
- **A book of more than ~45 MB of pictures could never reach CG Control.** An import renders the package into ONE page
  with every picture inlined as base64 and sends it to CG Bridge in ONE frame; past the bridge's 64 MiB cap the socket
  closed, and the operator read "Bridge disconnected" (measured: a 141 MB book). The Designer's own size warning said
  the `.vcg` had "no such limit" (`B-351`).

## What Changes

- **Every export ends in an answer.** The template is validated BEFORE the save dialog (an error makes no file).
  After it, a written file is named with its size; a failure is a sentence in the author's words that stays until
  dismissed, the element at fault selected, and what became of the file the dialog made: removed when it is empty and
  the browser can (checked by reading it back), else "left empty; delete it", or "not changed". The button reads
  `Exporting… N %` and both export buttons wait. The HTML export and Save / Save As answer the same way.
- **A book page that cannot be read fails the export, naming it** (it was dropped in silence); a page naming an asset
  the project does not have is a preflight error, as an image element's is.
- **One frame cap for both ends** (`WS_MAX_FRAME_BYTES`, `@cg/shared-ipc`): CG Control never sends a frame past it,
  and an import whose page would not fit is refused with its size. The Designer refuses `Export .vcg` before the save
  dialog past `TEMPLATE_MEDIA_MAX_BYTES` (45 MB of pictures and media), naming the pictures, the MB and the limit.
- **CG Control names an empty or damaged file in the operator's words**, the technical text in the log.

## Impact

- **Specs:** `designer-composition-export` (ADDED × 2), `designer-video-element` (MODIFIED × 1),
  `runtime-template-library` (ADDED × 1), `runtime-caspar-bridge` (ADDED × 1).
- **Code:** `@cg/shared-ipc` (frame cap, media limit, a `write` progress step), `@cg/vcg-format` (`verify`'s failure
  kind, `pack`'s progress), `caspar-bridge` (reads the shared cap; same value), CG Control (`WebSocketRuntime`,
  `templateDelivery`), the Designer (`Exporter`, `runDisk`, `export-file.ts`, `CompositionActionBar`, `TopToolbar`).
- **Shared config:** `turbo.json` — `@cg/runtime#test:e2e` depends on `@cg/designer#build`.
- **Not changed:** the frame cap itself; a larger book needs its pages delivered another way (owner question).
