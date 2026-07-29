# Design — field values from a text file, manual reload half (R-018)

## FSA, not Node `fs` — the Runtime is no longer Electron

The Runtime is a browser SPA (Vite); the Electron preload is history and there is no Node
`fs` in reach. The only browser mechanism that yields a RE-READABLE file reference is the
File System Access API: `showOpenFilePicker` returns a `FileSystemFileHandle`, and every
`getFile()` + `.text()` re-reads the file's current bytes — exactly what a manual RELOAD
needs. `<input type="file">` was rejected: its `File` is a snapshot; a reload would re-open
the picker every time, which is not "reload", it is "re-pick".

The bridge is deliberately NOT involved in this half. A bridge-side watcher/reader is one of
the two candidate architectures for the WATCH half (R-026) and pre-empting that open decision
here would build the very coupling the recon exists to judge.

## The `TextFileSource` abstraction — why an interface for one implementation

`TextFileSource` is `{ name: string; read(): Promise<string> }`, with the FSA handle wrapped
by `fsaTextFileSource`. Two load-bearing reasons, both required:

1. **Testability.** All split/trim/apply/error logic tests against a fake source in vitest —
   no FSA, no picker, no new E2E spec needed for the LOGIC. NB this does not discharge the
   Linux gate: a Linux `gate:e2e` is owed for any UI/layout/rendering change regardless of
   whether a spec was edited — mounting FromFileControl in the Inspector changes its content
   height, so this change OWES one full Linux `gate:e2e` run (once WSL lands); the Windows
   22/22 pass is non-authoritative evidence only (~19px render-geometry delta).
2. **The watch half drops in.** An FSA handle CANNOT be converted to a filesystem path, so a
   bridge-based watch (if R-026 lands there) means the operator re-specifies the file by path
   and values arrive from the bridge — a second `TextFileSource` implementation, not a
   redesign of the transform/apply chain.

## Values ride the existing field-update path

- **Choosing a file STAGES** the transformed content into the R-003 draft store — exactly a
  hand edit. The dirty dot appears; the operator applies with Update. Nothing reaches air on
  a file pick.
- **RELOAD re-reads and RE-APPLIES the field** (the acceptance's "the field re-applies") via
  `applyFieldValue`: stage, then the SAME `stack.update` wire call the Update button uses —
  one shared `sendUpdate` in `applyDraft.ts`, not a second apply path — with the payload
  built as applied-values + THIS field's overlay only. Consequences, all deliberate:
  - a reload never carries the operator's unrelated staged edits to air (they stay staged);
  - a rejected/failed update keeps the reloaded content STAGED, like any hand edit;
  - on acceptance only this field's staged entry clears (`clearStagedMatching` with the same
    single-field overlay that was sent — "what was sent" and "what to clear" cannot drift).

## Per-target split default, and the ambiguous fallback

Ticker content and sequence items are BOTH `list` fields, so field TYPE cannot pick the split
default. The one canonical place the distinction lives is the scene's `FieldBinding.target.kind`
(`ticker-items` / `sequence-items` / `repeater-items`). At `.vcg` import — the one moment the
app holds the unpacked scene, the R-011 `defaultPositionStore` pattern — `collectListFieldTargets`
walks the scene with the SAME namespace recursion as `aggregateCompositionFields` (so recorded
paths and Inspector field paths cannot disagree) and records each list field's sole consumer
kind per template. `sequence-items` → split defaults ON; everything else defaults OFF.

Fallbacks are all OFF — verbatim, the safer Cinegy-parity default, operator can flip it:

- a field bound to targets of MORE than one kind (ambiguous) is not recorded;
- an unbound list field is not recorded;
- a template imported in a PREVIOUS page session lists from the bridge registry without its
  scene, so it has no record at all (same residual R-011 accepts for the position seed).

## Handle persistence: SKIPPED for v1 — and SUPERSEDED (see B-113)

**This section's reasoning is stale and is kept only so the change reads in order. Handle
persistence SHIPPED in `runtime-from-file-persistence`; read that change's `design.md` for the
design that actually holds.**

What was written here, and why it stopped being true:

> FSA handles can be structured-cloned into IndexedDB, and a new session must re-request
> permission (gesture-gated) before reading. Persistence was skipped because the key it would
> need does not survive: from-file state is keyed by STACK ITEM id + field path, and item ids
> are minted per load (`item-<uuid>`) — after a tab reload there is no durable identity to
> re-attach a stored handle to.

The key argument was correct when written and was overtaken by [[B-092]], which added
`StackRetentionStore`: the stack's intent — including each `itemId` — is now persisted to OPFS
and re-delivered on connect, so `itemId + fieldPath` DOES name the same field after a reload.
The concern about re-pointing a NEW item at an old file never applied to that key; it applied to
the template+path key considered as an alternative, and that alternative is still rejected.

What remains true is the narrower half: a restored handle's READ PERMISSION may not survive, and
re-granting needs a user gesture. B-113 handles that explicitly rather than treating it as a
reason to skip persistence — a restored-but-unreadable attachment is shown as exactly that, and
is never read from until the operator grants access.

## Verbatim / no normalization — the R-020 boundary

File content is broadcast copy. It is NEVER passed through `latinDigits` or any digit/text
normalization: R-020 normalizes digits on numeric INPUT fields only, and applying it here
would silently rewrite Persian digits (۱۴۰۳ → 1403) in newsroom copy on air. The only
transform that exists is split mode's per-entry trim + empty-skip, which is opt-in and
documented in the spec. Whole-file mode is byte-for-byte (the `Blob.text()` UTF-8 decode
strips only a leading BOM, per spec). Unit tests pin Persian digits and mixed-bidi content
byte-for-byte.

## Split items: deterministic ids

Split (and whole-file) list items get position-stable ids `file-1`, `file-2`, …. The ticker
reconciles items by id, so a reload that changes an entry's text keeps its id and the crawl
updates WITHOUT restarting — the same reason the element schema gives ticker items stable ids.

## Degrade on non-Chromium

`showOpenFilePicker` is Chromium-only. Where absent, the "From file…" button renders disabled
with the reason as its tooltip and an inline muted note — a legible degrade, never a broken
control, and no capability is faked.
