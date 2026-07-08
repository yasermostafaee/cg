# Tasks — staged Inspector edits (R-003)

## 1. Draft store

- [ ] `apps/runtime/src/renderer/features/inspector/draftStore.ts` — framework-
      free module store (`Map<itemId, Record<fieldId, FieldValue>>` + version +
      subscribe): `stageField`, `stagedValue`, `hasStaged`, `isFieldDirty`
      (staged AND structurally != applied), `isItemDirty`, `buildApplyPayload`
      (`{ ...applied, ...draft }`), `clearDraft`, `pruneDrafts`. Consumed via
      `useSyncExternalStore`.

## 2. Controlled Inspector (remove the remount-key hazard)

- [ ] `Inspector.tsx`: every `FieldControl` renders draft-or-applied and stages
      via `onChange` — no blur/Enter commit; drop the scalar `key={fieldId-value}`
      remount keys (number field keeps a draft-frozen key, documented). Add the
      Inspector-header Update + Discard controls + per-field dirty marker + item
      dirty chip. Remove the old `commit()`/`stack.update` path.
- [ ] `ListFieldEditor.tsx`: drop local `useState`; render
      `toListItems(draft-or-applied)`, stage every op; keep the multi-line
      textarea; remove the `JSON.stringify(value)` remount key.

## 3. Apply wiring

- [ ] `StackPanel.tsx`: UPDATE sends `buildApplyPayload` as one `stack.update`
      and `clearDraft` on accepted; `pruneDrafts(liveItemIds)` from the snapshot.
- [ ] `StackRow.tsx`: minimal `● draft` chip when the item is dirty (Take/Out/
      Remove unchanged; UPDATE status-gating unchanged).

## 4. Tests

- [ ] Unit (`tests/draftStore.test.ts`, node): stage/overwrite; dirty vs
      equal-value; a push (new applied) never clobbers a draft + clears the
      marker on convergence; discard; `buildApplyPayload` merges the full set;
      per-item independence; prune drops removed items.
- [ ] E2E — re-encode the blur-commit specs on the Update-button flow (keep
      their intent): `inspect-list-field.spec.ts`, `stack-badge-settle.spec.ts`.
- [ ] E2E new (`stage-inspector-edits.spec.ts`): blur+Enter send nothing (applied
      fields unchanged); UPDATE applies the full set atomically; Discard reverts;
      the first ↑/↓/× click lands right after editing another item's text; a
      draft survives selection switch; Take shows applied not draft; UPDATE with
      nothing staged still sends.

## 5. Gate

- [x] Full green gate UNCACHED (`turbo --force`) for `@cg/runtime` (17/17) + repo
      `format:check`; `pnpm test:e2e` (runtime 16/16, designer 175/175).
- [x] `pnpm openspec validate stage-inspector-edits --strict`.
- [x] Confirmed `MockRuntime` needed NO behavior change: staging is
      renderer-local and apply sends the same
      `{ itemId, fields, mergeMode: 'merge' }` shape it already handled.

## 6. Live validation (operator) + wrap-up

- [x] Operator live pass — **PASS, CasparCG 2.5.0 (`69e8ad5`), 2026-07-08**: all
      7 points verified — staged text/blur/Enter reach air only via Update; one
      atomic Update applies the whole staged set and the badge settles per B-044;
      ticker edit/reorder/add/remove all stage and the first ↑/↓/× click lands;
      Discard reverts; drafts survive selection switches; Take on a dirty row
      shows the last APPLIED values while the row stays visibly dirty; Update
      with nothing staged still sends (B-048 workaround). No regressions observed.
- [x] After PASS: tick tasks, flip R-003 → `[x]` (build 2.5.0 `69e8ad5`),
      archive per the workflow, push, compare URL.

## 7. Adversarial-review fixes (applied before merge)

- [x] Number field: replaced the focus-dropping frozen-key uncontrolled input
      with a controlled `NumberField` (in-progress text preserved, no
      keystroke remount); all `FieldEditor`s keyed by `itemId-fieldId` so no DOM
      node is shared across items.
- [x] `applyDraft` clears ONLY the sent fields (`clearStagedMatching` vs a
      `snapshotDraft`) — an edit staged during the in-flight round-trip survives.
- [x] Tests hardened: draft-survival asserts the edit stayed UNAPPLIED; apply
      counts `stack.update` dispatches (exactly one, atomic + multi-field); a
      number digit-by-digit e2e guards the remount regression; unit coverage for
      `clearStagedMatching`/`snapshotDraft`.
