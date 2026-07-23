# Tasks — field values from a text file, manual reload half (R-018)

## 1. Source abstraction + pure transforms

- [x] 1.1 `textFileSource.ts`: `TextFileSource` (`name` + `read()`), `fsaTextFileSource`
      over a `FileSystemFileHandle`, `pickTextFileSource` (AbortError = cancel, not an
      error), `fileSourceSupported` + the operator-facing unsupported message.
- [x] 1.2 `fromFileContent.ts`: `parseDelimiter` (`\n`/`\t` escapes), `splitContent`
      (trim + skip-empty; empty delimiter cannot split), `contentToFieldValue`
      (text/multiline verbatim; list whole-file → ONE item; split → items with
      deterministic position-stable `file-N` ids), delimiter suggestions + default.

## 2. Per-target split default

- [x] 2.1 `listFieldTargets.ts`: `collectListFieldTargets` — same namespace walk as
      `aggregateCompositionFields` (composition instances + D-083 sequence composition
      items, depth-capped); a field bound to more than one target kind is ambiguous and
      not recorded.
- [x] 2.2 `fieldTargetStore.ts`: per-template record + `splitDefaultFor` (`sequence-items`
      → ON; ticker/repeater/unknown/ambiguous → OFF).
- [x] 2.3 `templateDelivery.ts` returns `listFieldTargets`; `LibraryPanel` records them at
      import beside R-011's `recordDefaultPosition`.

## 3. Stage/apply orchestration

- [x] 3.1 `draftStore.ts`: `singleFieldOverlay` + `buildOverlayPayload` (the single-field
      apply payload built from the SAME overlay later used to clear the staged entry).
- [x] 3.2 `applyDraft.ts`: extract the ONE shared `sendUpdate`; add `applyFieldValue`
      (stage → single-field `stack.update`; rejected update keeps the value staged).
- [x] 3.3 `fromFileOps.ts`: `stageFromFile` (pick-time: stage only) + `reloadFromFile`
      (re-read + re-apply); failed read stages/applies NOTHING, records a legible error on
      the entry and reports it via the command-error channel.
- [x] 3.4 `fromFileStore.ts`: per-item/per-field source state (source, split, delimiter,
      last error) with subscribe/version; pruned beside `pruneDrafts` in `StackPanel`.

## 4. Inspector UI

- [x] 4.1 `FromFileControl.tsx` under every text/multiline/list field: pick ("From
      file…"), file name, RELOAD (AsyncButton, toast-routed errors), detach, split
      checkbox + delimiter input with datalist suggestions (list fields), the explicit
      "whole file becomes ONE item" note while split is OFF, inline error line.
- [x] 4.2 Unsupported browser (no `showOpenFilePicker`): disabled control + visible
      reason — legible degrade, never a broken control.
- [x] 4.3 `Inspector.tsx`: thread the `StackItemState` down to `FieldEditor`/`FieldGroup`
      and mount the control (nested-namespace fields included).

## 5. Tests (unit — no E2E spec added, no Linux gate debt)

- [x] 5.1 `fromFileContent.test.ts`: whole-file verbatim; split + trim + skip-empty;
      `\n` escape; deterministic ids; Persian digits + mixed-bidi byte-for-byte (NOT
      digit-normalized).
- [x] 5.2 `listFieldTargets.test.ts`: ticker vs sequence recording, ambiguous → not
      recorded, nested-namespace paths, store split defaults + unknown-template fallback.
- [x] 5.3 `fromFileReload.dom.test.ts` (fake `TextFileSource`, stubbed bridge): pick-time
      staging; reload re-reads CURRENT content and re-applies via `stack.update`; a reload
      never carries unrelated staged edits; rejected update keeps the value staged; failed
      read keeps the current value, records + toasts a legible error; next success clears
      it; prune; Persian verbatim end-to-end.

## 6. PRD + docs

- [x] 6.1 `docs/prd/runtime.md`: R-018 narrowed to the manual-reload half and → `[~]` with
      the honest status note (no hardware pass owed — same wire and value shapes as hand
      edits; no E2E edit → no Linux `gate:e2e` owed); watch bullet moved out.
- [x] 6.2 New R-026 filed (number verified free against origin/main, ALL refs, and both
      sibling worktrees' working trees immediately before commit): watch half, RECON-FIRST,
      browser re-read vs bridge watch, debounce, dead-watch visibility, the handle≠path
      consequence recorded.
- [x] 6.3 Cross-referenced the Designer-track authoring-load counterpart (D-138) by title;
      not implemented here.

## 7. Gate

- [x] 7.1 `pnpm openspec validate runtime-field-from-file --strict`.
- [ ] 7.2 `pnpm gate` green (uncached, via the P-013 host gate lock).
