# Tasks — save-as-file-answer (BOOK-EXPORT Q4)

Lane: **FULL** — a project file the author keeps (what is written, and what is removed).

- [x] 1.1 `writeIntoPicked` (`export-file.ts`): the export's chunked write with abort, then `settleFailedFile`.
- [x] 1.2 `saveDisk`'s picker path answers `{ ok: false, failure: { cause, file } }`; the toolbar (Save and Save As) and
      both switch-guard dialogs say it in `exportFailedLine(…, 'Save')`.
- [x] 1.3 Tests `book-export.test.ts` › "BOOK-EXPORT Q4 …" (a full disk: the cause, the empty file removed, the write
      aborted; a good write answers nothing; the sentence).
- [ ] 1.4 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_
