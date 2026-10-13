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

## 5. Tests (unit; no E2E spec added — the UI change itself still owes a Linux `gate:e2e`, see 7.3)

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
      edits; OWES one Linux `gate:e2e`, see 7.3); watch bullet moved out.
- [x] 6.2 New R-026 filed (number verified free against origin/main, ALL refs, and both
      sibling worktrees' working trees immediately before commit): watch half, RECON-FIRST,
      browser re-read vs bridge watch, debounce, dead-watch visibility, the handle≠path
      consequence recorded.
- [x] 6.3 Cross-referenced the Designer-track authoring-load counterpart (D-138) by title;
      not implemented here.

## 7. Gate

- [x] 7.1 `pnpm openspec validate runtime-field-from-file --strict`.
- [x] 7.2 `pnpm gate` green (uncached, via the P-013 host gate lock) — direct run + again
      in the pre-push hook.
- [x] 7.3 ONE Linux `pnpm gate:e2e` (FULL suite), owed because this change alters UI
      (FromFileControl mounts inside the Inspector and changes its content height; nine
      existing specs interact with the Inspector, `panel-scroll.spec.ts` is content-height
      sensitive) — a Linux run is owed for ANY UI/layout/rendering change, not only spec
      edits. The Windows `gate:e2e` 22/22 (0 cached) pass is non-authoritative evidence,
      NOT discharge.
      **DISCHARGED 2026-08-08** by a COMPLETED, GREEN `e2e` job on GitHub Actions
      (`ubuntu-latest`), commit `a344cd2`, which carries this change:
      <https://github.com/yasermostafaee/cg/actions/runs/31252541925>
      Run conclusion `success`; the `E2E (Playwright)` job ran BOTH suites for real —
      runtime **62 passed (2.1m)**, designer **237 passed (7.7m)**, 0 failed, 0 flaky.
      Not a cache replay: `test:e2e` is `"cache": false` in `turbo.json`, so it always
      executes (turbo reported `20 cached, 22 total` — the 20 are the build graph). The
      named risk was checked directly: `panel-scroll.spec.ts` (all 3 specs) and
      `inspector-open-close.spec.ts` (all 6) passed on Linux.
