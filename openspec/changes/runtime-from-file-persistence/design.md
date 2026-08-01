# Design

## Why IndexedDB, and not the `localStorage` everything else here uses

A `FileSystemFileHandle` is opaque. It has no serialisation — `JSON.stringify` on one yields
`{}` — so `localStorage`, which stores strings, physically cannot hold it. IndexedDB stores
STRUCTURED CLONES, and a handle is cloneable. That single fact decides the storage layer; it is
not a preference.

The delimiter list has the opposite shape — plain data, small, read on every render — so it stays
in `localStorage` beside the shell layout. Two stores, because the two things being stored are
not the same kind of thing.

## Why the key is durable now, when R-018 said it was not

R-018's `design.md` recorded: "item ids are minted per load (`item-<uuid>`) — after a tab reload
there is no durable identity". True when written. [[B-092]] then added `StackRetentionStore`, an
OPFS-backed record of the stack's intent that persists each `itemId` and re-delivers it on
connect — so `itemId + fieldPath` now names the same field after a reload. Task 6.3 corrects that
doc rather than leaving a stale rationale for the next reader to trust.

## Permission is the real remaining blocker, and it is not the one that was written down

What does NOT survive a reload is the handle's READ PERMISSION. Chromium may return it already
granted (persistent permissions, common for a file the operator has used before) or `prompt`, and
`requestPermission` needs a user gesture — which a page doing its boot restore does not have.

So restoration reports rather than guesses:

- `queryPermission` at restore (it cannot prompt, so it is safe during boot).
- `granted` → the attachment is fully live.
- anything else → the attachment is restored VISIBLY, marked unreadable, and the control offers
  "Grant access" — a button, because a button click is a gesture.

The fail-closed reading is deliberate and matches the house rule: an attachment we cannot read is
not an attachment that works. Presenting it as working, and reading the last applied value in its
place, would be the from-file equivalent of treating silence as empty.

## Why the restore runs in the prune's effect

Both need exactly one input: the set of item ids actually on the stack. Running them apart lets a
restore land in the window before the prune that would have rejected it, flashing file names onto
rows that no longer exist. One effect, one id set, no window. The restore is idempotent (an
already-attached field is skipped) so re-running it on every stack change is free.

## Why the current delimiter stays selectable after it leaves the list

The picker includes the field's current value as an option even when the configured list no
longer contains it. Otherwise removing a delimiter in the modal would silently re-point every
attached field using it at whatever option happened to be first — a change to how live content is
parsed, made as a side effect of tidying a list. The stale entry is labelled "(in use)" so the
operator can see why it is there.

## Why the delimiter modal is not a section of the settings panel

The owner asked for "a section in settings". It is its own modal, opened from beside the control,
for two reasons. The server-settings panel is about the playout SERVER, and its Apply is gated
while anything is on air — a gate that is right for changing a host and wrong for saying what a
comma means. And the need is discovered at the control, so that is where the way out of it
belongs. `FixedBankConfigModal` set the same precedent, for the same kind of reason.
