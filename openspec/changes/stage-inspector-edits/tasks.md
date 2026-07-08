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

- [ ] Full green gate UNCACHED (`turbo --force`) for `@cg/runtime` + repo
      `format:check`; `pnpm test:e2e`.
- [ ] `pnpm openspec validate stage-inspector-edits --strict`.
- [ ] Confirm `MockRuntime` needed no behavior change (state it in the report).

## 6. Live validation (operator) + wrap-up

- [ ] STOP for the operator's live pass (CasparCG 2.5.0 `69e8ad5`): the 7-point
      checklist (stage on blur/Enter → nothing on air + dirty; UPDATE applies the
      set + badge settles + markers clear; ticker multi-line/reorder/add/remove
      staged then one UPDATE, first ↑/↓/× click lands; Discard reverts; draft
      survives selection switch; Take shows applied not draft; UPDATE with nothing
      staged still sends).
- [ ] After PASS: tick tasks, flip R-003 → `[x]` (note build 2.5.0 `69e8ad5`),
      archive per the workflow, push, compare URL.
