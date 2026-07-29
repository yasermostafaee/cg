# Tasks

## 1. Durable attachments

- [x] 1.1 `fromFilePersistence.ts` — an IndexedDB store for `{key, itemId, path, handle, split,
delimiter}`, with save / delete / load / prune. Every failure resolves rather than
      rejecting: losing persistence must degrade the feature to what it was, never take it away.
- [x] 1.2 `TextFileSource` exposes its `handle` (optional, so the test fake and any future
      non-FSA source stay valid), and `fsaTextFileSource` supplies it.
- [x] 1.3 `fromFileStore` writes through on attach, on split/delimiter change, and on detach.
      Fire-and-forget: a rejected write must not undo an attachment the operator can see.
- [x] 1.4 The last read ERROR is deliberately NOT persisted — it describes one moment's
      filesystem, and restoring it would present a stale failure as the file's condition now.

## 2. Permission across the reload boundary

- [x] 2.1 `queryReadPermission` / `requestReadPermission` over the handle's permission API, with
      a `granted` fallback where the browser does not gate reads this way.
- [x] 2.2 `FromFileState.permission` — a freshly picked file is `granted` by construction (the
      picker IS the grant); a restored one carries whatever the browser reports.
- [x] 2.3 The control replaces Reload with a "Grant access" action while a restored attachment is
      not readable, and states why. Nothing is read until it is granted.
- [x] 2.4 The restore uses `queryPermission` only — it cannot prompt, which is correct during a
      boot that has no user gesture.

## 3. Restore, wired where the prune already is

- [x] 3.1 `restoreFromFileAttachments(liveItemIds)` — skips items not on the stack, skips fields
      already attached in this session, prunes durable storage in the same pass.
- [x] 3.2 Called from `LayersPanel`'s existing prune effect, so restore and prune see the same
      id set and cannot race each other.

## 4. The delimiter picker

- [x] 4.1 `delimiterStore.ts` — the configured list, `localStorage`-persisted, seeded from the
      five R-018 shipped. Validated per element on read; degrades to the built-ins.
- [x] 4.2 Removal refuses to empty the list; add refuses a blank name, an empty value, and a
      duplicate value.
- [x] 4.3 `FromFileControl` renders a `<select>` over the list, by label. The field's CURRENT
      delimiter is included even when absent from the list, so a removal cannot silently change
      an attached field's split.
- [x] 4.4 `DELIMITER_SUGGESTIONS` / `DEFAULT_DELIMITER` removed from `fromFileContent.ts` — one
      declaration only; a second copy is how the picker and the default come to disagree.
- [x] 4.5 `DelimitersModal` — add / remove / reset, opened from a gear beside the control.

## 5. Tests

- [x] 5.1 `delimiterStore.test.ts` — seed, add, refusals, the empty-list refusal, and the
      degrade-to-built-ins path for unusable stored data.
- [x] 5.2 `fromFileRestore.dom.test.ts` — write-through, restore after a wipe, the
      needs-gesture case, prune of dead items, live-attachment-wins, detach forgets durably.
- [x] 5.3 Full green gate for `@cg/runtime`.

## 6. Owed before archive

- [ ] 6.1 **An E2E is owed and NOT written.** The flow needs a real `showOpenFilePicker` grant
      and a page reload that preserves the profile's IndexedDB and its FSA permission state;
      Playwright's default context discards both. Decide whether to drive it with a persistent
      context or to accept the DOM tests as the coverage, and say which.
- [ ] 6.2 **Owner check on a Chromium that does NOT auto-grant.** The needs-gesture path is
      covered by unit test against a fake handle; the real prompt's wording and timing on this
      station's Chromium has not been seen. Verify the restored row reads sensibly before the
      grant, not just after.
- [x] 6.3 Correct R-018's `design.md`, which still records "item ids are minted per load" as the
      reason persistence was skipped — stale since [[B-092]].
