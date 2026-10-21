# Design — book-export-answers

## 1. What the save dialog does, and why the file is settled the way it is

Chrome's `showSaveFilePicker` creates the chosen file EMPTY when the name is chosen, before the page has produced a
byte (the owner's 0-byte `telavat.vcg`). The dialog needs the press's user activation, so the package cannot be built
before it. Two consequences:

- **Validate first.** `runDisk` runs the preflight BEFORE the dialog; an error is answered as `blocked` and no file
  exists. The preflight is milliseconds (it reads the asset index, never the bytes), so the press's activation
  survives it.
- **Settle the file after a failure.** The writable is aborted (Chrome writes into a swap file until `close()`, so an
  aborted write leaves the file as it was). Then: a file that still holds bytes is the author's earlier file and is
  NEVER removed (`unchanged`); an empty one is removed with `FileSystemHandle.remove()` where the browser has it, and
  the removal is claimed only when reading the file back finds nothing (`removed`); otherwise the author is told
  `<file> was left empty; delete it`.

The removal could not be measured on a native dialog's handle on the dev host: Windows' file dialog ignores both
`WM_SETTEXT`/`BM_CLICK` and `WM_COMMAND(IDOK)` when it is not the active window, and taking focus on the owner's
desktop was ruled out. The run-time read-back makes the answer true whatever Chrome allows; the e2e proves the path
on a real OPFS handle, and the owner's check proves it on his disk.

## 2. Progress

The old steps jumped 40 → 60 → 80 % in the first second and then sat at 95 % for the whole pack. Now: reading the
media 5–30 % (per asset), packing 30–90 % (`pack`'s `onProgress`: hashing, then JSZip's own percent), writing 90–100 %
(8 MiB chunks). Measured on a 671 MB book before this change: packing ~15 s, then ~15 s more for hashing the whole
package and writing it; a save to disk no longer hashes the package (only the download route returns a hash).

**No Cancel.** The pack is one JSZip call with no point to stop at; a Cancel that waits for it to finish is not a
cancel.

## 3. The CG Control ceiling

An import renders the `.vcg` into ONE page (`produceTemplateDelivery`, every picture, clip, sound and font inlined as
base64) and sends it in ONE `templates.import` frame. Measured: 30 JPEG pages (27.7 MB) → a stored page of 39.7 MB =
their base64 (38.7 MB) + 0.92 MiB. CG Bridge's frame cap is 64 MiB (`B-038`). So:

- `WS_MAX_FRAME_BYTES` (64 MiB) lives in `@cg/shared-ipc`; the bridge builds its socket with it.
- `TEMPLATE_MEDIA_MAX_BYTES` = (64 MiB − 4 MiB allowance for the page) × 3/4 = 45 MiB of stored media.
- The Designer refuses `Export .vcg` past it, BEFORE the save dialog (a preflight error, code
  `too-large-for-cg-control`, on the heaviest element). The single-file HTML is not refused by it: it never goes
  through CG Bridge.
- CG Control measures the REAL frame (UTF-8 bytes of the serialized page and record) before keeping or sending
  anything, and refuses past the cap; and `WebSocketRuntime.#invoke` never writes any frame past it.

The cap is not raised here: a page of hundreds of MB would also have to boot in CasparCG's CEF (a 265 MB page took
4.5 s in desktop Chromium, `SINGLE_FILE_INLINE_WARN_BYTES`). A larger book needs its pages delivered as files, or
loaded by the operator (`R-100`): an owner question.

## 4. The import's sentences

`verify` now says WHY: `unreadable` (empty, cut short, not a zip), `not-a-template`, `invalid` (a template that does
not parse — perhaps a newer build's), `integrity` (bytes changed since export), `trust`. CG Control words the first
three it can honestly call so — empty → "is empty (0 bytes); the export did not finish. Export it again from the
Designer."; unreadable / not-a-template / integrity → "is damaged or not a CG template." — and keeps `failed
verification: …` for `invalid` and `trust`. The technical text goes to the browser console, the only log the page has.
