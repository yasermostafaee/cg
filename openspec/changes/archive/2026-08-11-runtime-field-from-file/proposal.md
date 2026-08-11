# Field values from a text file — manual reload half (R-018)

## Why

The client's newsroom keeps the crawl/subtitle copy in a text file that other staff update.
The incumbent Cinegy workflow — the default this feature must honor — is that the TYPIST embeds
the separators inside the text and the whole file IS the content, fed verbatim; splitting into
discrete items is our optional convenience. Today the operator retypes or pastes that copy into
the Inspector by hand.

This change ships ONLY the settled half of R-018: choose a file, whole-text-verbatim by
default, optional delimiter split, and a manual RELOAD. The automatic WATCH half moved out to
its own recon-first item (R-026) because its architecture — browser FSA re-read vs the bridge
watching a path — is an open decision this half must not block on.

## What Changes

- **A `TextFileSource` abstraction** (`read(): Promise<string>` + a display name) with the
  File System Access API handle as its only implementation today. The Runtime is a browser SPA
  (no Node `fs`, no bridge involvement in this half): `showOpenFilePicker` → keep the handle →
  `getFile()` + `.text()` on every read, so a read always sees the file's CURRENT bytes.
- **A "From file…" affordance under every text-carrying field** (text / multiline / list) in
  the Inspector: pick a file, see its name, RELOAD, or detach. Where the FSA API is absent
  (non-Chromium) the control renders disabled with a legible reason — never a broken control.
- **Values flow through the EXISTING field-update path, never a new pipeline.** Choosing a
  file STAGES the content as a draft (exactly like typing — the operator applies with Update).
  RELOAD re-reads and RE-APPLIES the field via the same `stack.update` the Update button
  sends, scoped to this one field so a reload never carries unrelated staged edits to air.
- **Split is per-TARGET, defaulting OFF.** Whole-file mode makes the entire content the value
  verbatim — on a ticker, ONE list item whose text is the whole file (Cinegy parity). Split ON
  takes a free-text delimiter (suggestions offered; `\n` = one entry per line), trims entries,
  skips empties. The default is resolved from the scene's BINDINGS at `.vcg` import
  (`sequence-items` → split ON; ticker / unknown / ambiguous → OFF), recorded per template the
  same way R-011 records the default position.
- **Verbatim is the contract.** File content is never trimmed (split entries excepted), never
  digit-normalized (R-020's `latinDigits` is for numeric INPUT fields; running broadcast copy
  through it would silently rewrite Persian digits), never otherwise transformed.
- **Missing-file safety.** A failed read applies NOTHING — the current (possibly on-air) value
  is kept, the error is shown at the field and toasted. Never a blank crawl because a share
  went away.

## Out of scope (recorded, not built here)

- **Watching the file** — R-026, recon-first (browser re-read vs bridge watch; the
  handle≠path consequence is recorded there).
- **Persisting the picked handle across page sessions** — see design.md; stack item ids do
  not survive the session, so there is nothing durable to re-attach a persisted handle to.
- **The Designer-track one-shot authoring load** — "load ticker / sequence / text content
  from a text file" (D-138), cross-referenced by title only.
- **R-019's modal read-only state** when from-file is active — that is R-019's acceptance,
  applied when the modal editor lands.

## Impact

- **Affected specs:** `runtime-ui` (new requirement: field values from a text file).
- **Affected code:** `apps/runtime` only —
  `src/renderer/features/inspector/` (`textFileSource.ts`, `fromFileContent.ts`,
  `fromFileStore.ts`, `fromFileOps.ts`, `listFieldTargets.ts`, `fieldTargetStore.ts`,
  `FromFileControl.tsx`, `draftStore.ts` + `applyDraft.ts` single-field apply, `Inspector.tsx`
  wiring), `features/library/templateDelivery.ts` + `LibraryPanel.tsx` (record list-field
  targets at import), `features/stack/StackPanel.tsx` (prune from-file entries). No schema,
  IPC, bridge, or `@cg/template-runtime` change; no new AMCP verbs.
