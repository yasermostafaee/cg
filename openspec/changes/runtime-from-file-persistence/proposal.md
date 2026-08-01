# A field's file source survives a refresh, and its delimiter is picked from a configurable list

## Why

Two defects in R-018's "from file" affordance, both reported by the owner from live use
([[B-113]], [[R-034]]):

1. **The chosen file is lost on every page refresh.** The attachment lives in a module-level
   `Map` that nothing persists. The field keeps its last APPLIED value, so nothing looks
   broken — the operator discovers the loss only when Reload is gone and the file must be
   picked again, which on a live programme is the worst possible moment to go hunting through
   a file dialog. The whole point of a file source is that the operator stops hand-typing
   content; an attachment that evaporates returns them to hand-typing.

2. **The delimiter list hides four of its five options.** The control is a free-text input
   backed by a `<datalist>`, initialised to `\n`. A `<datalist>` FILTERS its options against
   the input's current value, so with `\n` already in the box only "new line" matches — pipe,
   Persian comma, comma and semicolon are invisible until the operator deletes the contents of
   a box that carries no dropdown affordance to suggest there is anything to find. The Persian
   comma entry exists precisely because Persian source copy needs it, and a Persian operator
   cannot find it.

R-018's design.md justified skipping persistence with "item ids are minted per load, so after a
tab reload there is no durable identity to re-attach to". That was true when written and is not
any more: [[B-092]] added `StackRetentionStore`, which persists each item's `itemId` and
re-delivers it on connect. The blocker that remains is narrower and different — a file handle's
READ PERMISSION may not survive a reload, and re-granting it needs a user gesture.

## What Changes

- A field's attachment — the file handle, the split flag and the delimiter — is persisted to
  IndexedDB and restored at boot. IndexedDB rather than `localStorage` because a
  `FileSystemFileHandle` is opaque and cannot be serialised to a string; it CAN be structured-
  cloned, which is what IndexedDB stores.
- A restored attachment whose read permission did not survive is shown with its file name and
  an explicit way to re-grant, and is never read from until the operator does. It is never
  presented as a working attachment, and stale content is never substituted for the file.
- Attachments for items no longer on the stack are pruned from durable storage in the same pass
  that prunes the in-memory store.
- The delimiter control becomes a PICKER over the configured list, showing every option by name
  at once. It cannot be free-typed.
- The delimiter list becomes configurable and persisted, with add / remove / reset, reachable
  from beside the control. It can never be emptied.
- Removing a delimiter does not change how an already-attached field splits: the field's current
  delimiter stays selectable even when it has left the list.

## Impact

- `apps/runtime/src/renderer/features/inspector/` — `fromFilePersistence.ts` (new),
  `delimiterStore.ts` (new), `DelimitersModal.tsx` (new), `fromFileStore.ts`,
  `FromFileControl.tsx`, `textFileSource.ts`, `fromFileContent.ts`
- `apps/runtime/src/renderer/features/layers/LayersPanel.tsx` — restore beside the existing prune
- No schema change, no bridge change, no wire change. Nothing here can reach air on its own: the
  value still travels the existing stage → `stack.update` path.
