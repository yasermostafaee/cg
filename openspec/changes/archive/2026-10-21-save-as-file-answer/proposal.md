# Save As answers a failed write and leaves no empty file (BOOK-EXPORT Q4, RUN-NEXT-VERSION-02 Part 2)

## Why

`BOOK-EXPORT-01` gave the `.vcg` export an answer for every outcome and removed the EMPTY file Chrome's save dialog
makes when a later step fails (`B-349`). Its report left one door open (§10 Q4): Save As still wrote into the picked
file with no catch (`writeBytesToHandle`), so a failed write left an empty `.cgproj` behind, and the switch-guard
dialogs read that failure as a cancel. The owner accepted the recommendation: give Save As the export's file handling.

## What Changes

- A save into a file the save dialog made writes through the export's own helpers (`writeIntoPicked`: chunked write,
  abort on a throw, then `settleFailedFile`): a failure is answered with its cause in the author's words and what
  became of the file — an empty one is removed (checked by reading it back), else "left empty; delete it" or "not
  changed".
- The sentence is the export's, with its own verb: `Save failed: <cause>. <file> was removed; nothing was saved.` Said
  by the toolbar's Save and Save As (held until dismissed), and by the save-before-switch and unsaved-changes dialogs
  (never read as a cancel).

## Impact

- **Specs:** `designer-project-persistence` (ADDED × 1).
- **Code:** `export-file.ts` (`writeIntoPicked`), `createDesignerBridge.ts` (`saveDisk`), the toolbar and the two
  dialogs, `export-answer.ts` (the verb).
