# Tasks — book-export-answers (BOOK-EXPORT-01; B-349, B-350, B-351)

Lane: **FULL** — the export path, the import path, a shared frame cap (`@cg/shared-ipc`, CG Bridge).

## 1. The cause, measured red first

- [x] 1.1 Reproduced on the owner's dev server (port 4000, running since 2026-10-14 13:36), in a separate Chrome profile:
      the save dialog's file stays 0 bytes, `ReferenceError: collectAudioElements is not defined` in
      `Exporter.preflight`, no catch. An EMPTY composition does the same. The server's `Exporter.ts` has an import list
      older than its body; a fresh dev server (port 4398) and the built app export the same 30-page book (29 MB).
- [x] 1.2 Fixtures of the owner's kind through the real buttons in a normal Chrome (built app): 30 JPEG (28 MB, 1.5 s),
      30 PNG (134 MB, 7.7 s), 400 JPEG (370 MB, 22 s, renderer 909 MB), 150 PNG (671 MB, 38 s, 1.5 GB), 400 PNG
      (1.8 GB, 106 s, 3.8 GB) all export. One `NotReadableError` in seven 671 MB runs, not reproduced in a later 4 / 4:
      not fixed by guess; it would now be answered with its cause.
- [x] 1.3 Imported into a CG Control on a real CG Bridge of its own (auth off, ephemeral ports, dead AMCP): 29 MB imports;
      141 MB closes the socket — "Bridge disconnected — command rejected" (`B-351`).

## 2. Every export answers (B-349)

- [x] 2.1 `runDisk` validates BEFORE the save dialog (`blocked`, no file), and answers every later throw as `failed`
      with the cause, the element, and the file's fate (`export-file.ts`: abort the writable; remove only an EMPTY file,
      checked by reading it back). (`7209fbaf`)
- [x] 2.2 The button shows `Exporting… N %`, both buttons wait; written → name and size; failed → a held sentence, the
      element selected; the HTML export answers too; no Cancel (no stopping point in the pack). (`7209fbaf`)
- [x] 2.3 Progress follows the work: per asset, `pack`'s own (`onProgress`), a chunked write. (`a1738835`, `7209fbaf`)
- [x] 2.4 A book page with an unknown asset is a preflight error; unreadable bytes fail the export naming the file.
      (`7209fbaf`)
- [x] 2.5 Sweep: Save / Save As had the same missing catch — fixed; the two save dialogs already caught. (`b90bba09`)
- [x] 2.6 Tests: `book-export.test.ts`, `export-answer.dom.test.ts`, e2e `book-export.spec.ts` (the real folder pick; a
      real OPFS handle made empty at the pick) — red at HEAD (no answer), green now. (`7209fbaf`)

## 3. CG Control names the file (B-350)

- [x] 3.1 `verify` reports why (`unreadable`, `not-a-template`, `invalid`, `integrity`, `trust`). (`a1738835`)
- [x] 3.2 Empty → "is empty (0 bytes); the export did not finish. Export it again from the Designer."; unreadable /
      not a template / changed → "is damaged or not a CG template.", the technical text in the log. (`0d8a17cb`)
- [x] 3.3 Tests: `template-delivery.test.ts` (red with the checks out), `verify.test.ts`, e2e
      `import-vcg-template.spec.ts` (empty); the sentence sweep moved 7 files' pins. (`0d8a17cb`)

## 4. One frame cap; too large is said, not a dropped socket (B-351)

- [x] 4.1 `WS_MAX_FRAME_BYTES` and `TEMPLATE_MEDIA_MAX_BYTES` in `@cg/shared-ipc`; the bridge reads the cap. (`292a7316`)
- [x] 4.2 CG Control never writes a frame past the cap (`BridgeFrameTooLargeError`; real-bridge test red with the guard
      out) and refuses a too-large import with its size before keeping anything. (`0d8a17cb`)
- [x] 4.3 The Designer refuses `Export .vcg` past 45 MB before the save dialog (pictures, MB, limit); the HTML export is
      not refused by it; the size warning no longer says the `.vcg` has "no such limit". (`7209fbaf`)

## 5. The chain, end to end

- [x] 5.1 e2e `book-from-designer.spec.ts`: the Designer's built app exports a book (Add folder…, a Data key); CG
      Control imports those bytes, loads, PLAY, Next, Previous, page box + Go, STOP. (`cd4108a8`)
- [x] 5.2 The Linux e2e discharge on CI: run
      [38760662866](https://github.com/yasermostafaee/cg/actions/runs/38760662866) on `9870f5b3` — **success**, read
      from the log: Designer 338 passed / 13 skipped, CG Control 348 passed / 2 skipped; `book-export.spec.ts` (both),
      `book-from-designer.spec.ts` and the empty-file case in `import-vcg-template.spec.ts` RAN and passed.
- [x] 5.3 The Linux e2e on the commit carrying `RUN-NEXT-VERSION-02` BOOK-EXPORT Q1 (`9b07a7ed`: the refusal adds
      "or load the pages in CG Control instead (Load folder…)")
      — run [39588699000](https://github.com/yasermostafaee/cg/actions/runs/39588699000) on `c23b1cea` (which carries `9b07a7ed`): success, read from the log: `ci` and the `E2E` step RAN — Designer 340 passed / 13 skipped; CG Control 353 passed / 2 skipped / 2 flaky (`pvw-live-plate-placeholder.spec.ts:381`, `rehearse-layout.spec.ts:81`: layout timing, passed on retry, not touched by this change); `book-export.spec.ts` and `book-from-designer.spec.ts` among them.

## 6. Housekeeping

- [x] 6.1 The leftover worktree `.claude/worktrees/agent-acb2ac8d3ec57ca26` removed after checking it held nothing `dev`
      lacks (5 of its 9 commits are the same patches on `dev`, 4 were folded; every file matches `dev` or is older).
