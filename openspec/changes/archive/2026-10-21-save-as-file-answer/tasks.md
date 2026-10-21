# Tasks — save-as-file-answer (BOOK-EXPORT Q4)

Lane: **FULL** — a project file the author keeps (what is written, and what is removed).

- [x] 1.1 `writeIntoPicked` (`export-file.ts`): the export's chunked write with abort, then `settleFailedFile`.
- [x] 1.2 `saveDisk`'s picker path answers `{ ok: false, failure: { cause, file } }`; the toolbar (Save and Save As) and
      both switch-guard dialogs say it in `exportFailedLine(…, 'Save')`.
- [x] 1.3 Tests `book-export.test.ts` › "BOOK-EXPORT Q4 …" (a full disk: the cause, the empty file removed, the write
      aborted; a good write answers nothing; the sentence).
- [x] 1.4 Linux `e2e` discharged on the pushed commit
      — run [39588699000](https://github.com/yasermostafaee/cg/actions/runs/39588699000) on `c23b1cea` (which carries `64e649d9`): success, read from the log: `ci` and the `E2E` step RAN — Designer 340 passed / 13 skipped; CG Control 353 passed / 2 skipped / 2 flaky (`pvw-live-plate-placeholder.spec.ts:381`, `rehearse-layout.spec.ts:81`: layout timing, passed on retry, not touched by this change); `save-as-copy.spec.ts` among them.
