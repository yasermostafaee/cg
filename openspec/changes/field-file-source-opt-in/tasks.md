# Tasks — FROM FILE becomes an authored per-field grant

## 1. The schema and the ONE predicate

- [x] 1.1 `packages/shared-schema/src/fields.ts` — `allowFileSource: z.boolean().optional()` on
      `TextFieldSchema`, `MultilineFieldSchema` and `ListFieldSchema`, and on NO other variant.
- [x] 1.2 `fieldTypeTakesFileSource(type)` and `fieldAllowsFileSource(field)` beside them — the
      only place the kind list `text | multiline | list` is spelled for this purpose (golden
      rule 6). Exported from `@cg/shared-schema`.
- [x] 1.2b `fieldTakesFileSource(field)` — the same question asked of the FIELD, added during
      implementation because a guard on `field.type` narrows the DISCRIMINANT and not the object:
      after it, `field` is still the whole union and `field.allowFileSource` does not compile (an
      `image` field has no such key). It DELEGATES to 1.2's predicate, so the kind list is still
      spelled exactly once — the alternative (a `switch` over the three cases at each call site)
      would have been the second copy golden rule 6 forbids.
- [x] 1.3 `apps/runtime/.../fromFileContent.ts` — `FromFileFieldKind` is DERIVED from the shared
      predicate's type (`FileSourceCapableField['type']`) rather than re-listing the kinds.

## 2. The Designer — where the grant is authored

- [x] 2.1 `state/slices/fields.ts` — `ElementFieldMetaPatch.allowFileSource?: boolean`.
- [x] 2.2 `rebuildField` carries the grant on the `list`, `multiline` and `text` branches and
      DROPS it on the `number` branch. ⚠ `rebuildField` REBUILDS the field from scratch, so a
      key not carried here is silently lost on the next unrelated meta edit.
- [x] 2.3 `DynamicDataSection.tsx` → `FieldMeta` — an "Allow file source" `CheckRow` in the
      `list` branch and in the text branch (`fieldType === 'text'` only, so `number` never
      offers it), with a hint saying what it is for.
- [x] 2.4 `field-defaults.ts` needs NO change — `defaultField` sets no key, so a new field is
      un-granted. Verified by test (3.2), not by reading.

## 3. Tests — Designer + schema, RED first

- [x] 3.1 `packages/shared-schema/tests/field-file-source.test.ts` — the flag parses on
      text/multiline/list; the five other variants STRIP it; absent stays absent; the predicates
      name exactly three kinds. 13 tests.
- [x] 3.2 `apps/designer/tests/field-file-source-grant.test.ts` — `defaultField` grants nothing;
      `setElementFieldMeta` sets and clears; an unrelated meta edit (Title, Multiline) PRESERVES
      it; switching to `number` drops it and switching back leaves it un-granted; the section
      offers the control for text and for a ticker's list and NOT for a number. 10 tests.
- [x] 3.3 Round trip — `packages/vcg-format/tests/roundtrip.test.ts` gains three cases: a granted
      multiline and a granted list survive `pack` → `unpack`, and an un-granted field comes back
      with the key still ABSENT. The Designer's own save/load (`ProjectStore.save` → `open`) is
      covered in 3.2's last case.

## 4. The Runtime — the gate and the detach

- [x] 4.1 `Inspector.tsx` — the gate is now `fieldAllowsFileSource(field)` + the kind narrowing,
      asked of the FIELD and never of the inferred `kind`.
- [x] 4.2 `fromFileStore.ts` — `detachUngrantedSources(snapshot: FieldGrantSnapshot)`, whose
      `{known: false}` arm makes the "unresolved schema deletes everything" mistake unreachable
      BY TYPE, exactly as `StackPruneInput` does for the prunes.
- [x] 4.3 `fileSourceGrants.ts` — `grantedFileSourcePaths(aggregate)`, the walk over
      `{fields, groups}`, the same shape `FieldEditor`/`FieldGroup` traverse, keyed by the
      existing `fieldPathKey`.
- [x] 4.4 `Inspector` runs the reconcile in ONE effect per item, passing `{known: true}` only
      when `item !== null` AND `info !== null` AND `info.templateId === item.templateId`. ⚠ The
      third condition was added during implementation: `info` is NOT cleared when `item` changes,
      so between selecting item B and B's `templates.get` resolving, `info` still holds item A's
      template — reconciling B's attachments against A's grants would detach whatever A does not
      happen to grant, with nothing on screen to say why.

## 5. Tests — Runtime, RED first

- [x] 5.1 `fromFileGrant.dom.test.ts` — an un-granted text/multiline/list field renders NO
      from-file control; a granted one renders the same control as today (button, chip, and for a
      list the split row + delimiter picker in the footer). Includes the nested-composition group,
      granted and un-granted side by side.
- [x] 5.2 Same file — a `number` field renders no control (the outer gate still holds).
- [x] 5.3 🔴 The 1d decision: a granted field's attachment SURVIVES; an un-granted field's is
      detached from the store AND from durable storage, at a root path and at a NAMESPACED one;
      another item's attachment is untouched.
- [x] 5.4 🔴 The hazard: with the schema unresolved — `templates.get` returning `null`, still in
      flight, or REJECTING — NOTHING is detached. 12 tests total; the four that were RED before
      the implementation are named in the session report.

## 6. Ripples the sweep found (golden rule 9)

- [x] 6.1 `FromFileControl.tsx` docstring said the affordance renders "under a text-carrying
      field (text / multiline / list)" — now states the grant is the inner condition and that
      this component does NOT re-check it.
- [x] 6.2 `FromFileControl.tsx`'s `neutral`-not-`ghost` comment cited "the most PROPAGATED
      instance of that mistake in the app, since it renders once per text / multiline / list
      field". That fact is no longer true; the comment now records it as history and marks the
      styling verdict as standing on its own, so nobody walks the button back to `ghost`.
- [x] 6.3 `packages/starter-templates/src/ticker.ts` — the `headlines` list field GRANTS a file
      source. Not decoration: without it every seeded template loses the control and the owner
      can only see the OFF state. `label` one field up stays un-granted, so the one starter shows
      both states in one Inspector.
- [x] 6.4 `openspec/specs/runtime-ui/spec.md:828` still carries the old "on every text-carrying
      field" wording — deliberately NOT edited: it is the living spec, and this change's delta
      supersedes it at archive time.

## 7. Gate and hand-off

- [x] 7.1 Full green gate.
- [ ] 7.2 ⚠ STATE THE COST in the report: an operator using FROM FILE today loses the control on
      any template not re-exported with the box ticked. `P-031`'s floor permits it; the owner
      should hear it as a decision, not discover it.
- [x] 7.3 **Linux `gate:e2e` DISCHARGED.** This alters what renders in the Runtime Inspector (a
      control disappears from most fields; the Inspector's content height changes, which is exactly
      what R-018 flagged `panel-scroll.spec.ts` for). A COMPLETED, GREEN `e2e` job on
      `ubuntu-latest` for commit `104a5cd4`, a later `dev` tip that CONTAINS this change
      (`8b4c852c`): <https://github.com/yasermostafaee/cg/actions/runs/32649701579> — run
      `conclusion: success`, `E2E (Playwright)` job conclusion `success`, Playwright genuinely ran
      (9m45s; runtime **92 passed**, designer **269 passed / 12 skipped**), including the
      named-risk `panel-scroll.spec.ts` and the Inspector specs.

      The earlier run for `8b4c852c` itself was RED, but NOT because of this change: it failed on
      `live-source-layers.spec.ts`, a PANIC assertion belonging to `add-multibox-audio` that
      encoded a rule `09eb9760` had deleted (see that change's `tasks.md` 8.7). Named here so the
      red run in this commit's history is not mistaken for a defect in the file-source grant.
