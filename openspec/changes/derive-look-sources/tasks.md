# Tasks — derive the multi-frame group's source list (`B-188`)

## 0. Re-verify the blast radius BEFORE deleting anything

- [x] 0.1 `lookGroups` still has **ZERO** hits in `apps/runtime/src` and `tools/caspar-bridge/src`
      (`git grep`, count 0)
- [x] 0.2 `B-188`'s five readers confirmed still complete and still correct — the `+ Source` list,
      the Inspector picker, `look-source-undeclared` + its message, the schema's duplicate refusal,
      the exporter
- [x] 0.3 🔴 **`live-look-bindings.ts` OPENED** (it was not, by the session that filed `B-188`).
      `resolveLookBindings` iterates `carrier.sources` — the already-derived export — and dedupes
      seats on `producerArg`, the WIRE argument. The declaration appears nowhere in the file, so
      two looks sharing a key still resolve to ONE seat. **The change was not blocked.**
- [x] 0.4 Swept for the identifier AND for rendered strings: `+ Source`, `New source id`,
      `Sources — declared once`, `No sources yet`, `does not declare`, `Declared sources`,
      `is already declared`, `declares each source ONCE`
- [x] 0.5 ⚠ Ran the suites rather than trusting the sweep — a test that depends on the SET of
      preflight issues is not reachable by grep. 14 tests reddened across 5 files; every one is
      accounted for below.

## 1. Schema

- [x] 1.1 `LookSourceSchema` / `LookSource` DELETED, and `LookGroupSchema.sources` with it
- [x] 1.2 The schema's duplicate-declaration refusal deleted — a derived list is distinct by
      construction. ⚠ NOT `look-source-duplicate`, which is about two PLATES and survives
- [x] 1.3 `deriveLookSources(scene)` added in `packages/shared-schema/src/look-sources.ts`, with the
      order rule and the append/deletion asymmetry documented as contract
- [x] 1.4 `looks.ts`'s header rewritten: the declaration paragraph replaced by the derivation, the
      measurement recorded, and `expectedAspect`/`dynamic` moved to the element with the owner's
      reasoning
- [x] 1.5 `elements.ts`'s `routeKey` docstring: the `LookSource.routeKey`-stays-required asymmetry
      is gone, because the field it named is gone

## 2. Exporter

- [x] 2.1 `collectLookCarrier` derives its source list from `deriveLookSources(scene)`; the
      `declared.has(routeKey)` gate on every plate is deleted
- [x] 2.2 `expectedAspect` read off the FIRST plate serving each key in document order — the same
      element `elementId` names (`B-179`'s hoist)
- [x] 2.3 `dynamic` computed from `dynamicRoleIndex`, the SAME index the groupless path uses —
      closing the asymmetry where that path computed it and this one hardcoded `false`
- [x] 2.4 Docstrings updated to say the set is unchanged and only the ORDER moved

## 3. Designer

- [x] 3.1 `addLookSource` / `removeLookSource` DELETED from the looks slice; `createLookGroup` no
      longer writes `sources: []`
- [x] 3.2 `look-source-undeclared` and its message deleted from the preflight
- [x] 3.3 ⚠ `live-source-unset` KEPT — document scope, and it is what makes an unset plate block
      Export
- [x] 3.4 🔴 `look-source-duplicate`'s `?? ''` bucket fixed: unassigned plates are skipped, not
      grouped under one empty key. Deleting the declaration deleted the guard that made the bucket
      harmless, so this would have reported two unset plates as _"source “” appears 2 times"_ —
      `B-183`'s defect through the door the deletion opened
- [x] 3.5 `chooseASource`'s two-way branch collapsed to one sentence: there is one control now
- [x] 3.6 Looks panel: no `+ Source`, no remove; the list is read-only, derived and ordered
- [x] 3.7 Looks panel: errors and warnings counted and headed separately, so the nudge is never
      listed under "export will refuse"
- [x] 3.8 Inspector: ONE control, the free-text box, with the derived keys offered via a
      `<datalist>` (`TextField` gains `suggestions` + `datalistId`); the plate's own key filtered
      out of its own suggestions; `UNASSIGNED_LABEL` retired with the `<select>` it named
- [x] 3.9 The near-miss WARNING (`live-source-near-miss`), with the numbering exclusion

## 4. Tests — by value, with the discrimination proved

- [x] 4.1 `packages/shared-schema/tests/look-sources.test.ts` — NEW. The SET (dedup, unassigned,
      containers, every document, repeater not walked) and the ORDER (first use; stable under
      append; **NOT** stable under deletion, pinned as a test). Every fixture writes the RETIRED
      `sources` array, several in the OPPOSITE order, so a surviving reader of it would flip the
      result
- [x] 4.2 `packages/shared-schema/tests/looks.test.ts` — the duplicate-refusal test replaced by one
      asserting a stored `sources` array parses and is STRIPPED (`'sources' in parsed === false`)
- [x] 4.3 `packages/vcg-format/tests/look-carrier.test.ts` — the discriminating fixture at the
      carrier (a plate the stale declaration OMITS gets a rect AND a declaration); the order rule
      against a stale declaration in the opposite order; `B-179`'s aspect + `dynamic` from the
      element, with the un-asserting plate as the negative control; two plates on one key resolving
      first-in-document-order
- [x] 4.4 `apps/designer/tests/look-preflight.test.ts` — B.1's describe replaced: the code is gone,
      asserted by NAME as well as by outcome; `live-source-unset` survives; two unset plates are not
      a duplicate
- [x] 4.5 `apps/designer/tests/looks-slice.test.ts` — the source mutators asserted ABSENT from the
      store (a no-op `addLookSource` would satisfy every behavioural assertion while reopening the
      door); a fresh group carries no `sources` key
- [x] 4.6 `apps/designer/tests/looks-issues.dom.test.ts` — the undeclared surfacing replaced by its
      absence; the near-miss surfaced as a nudge under its own heading; the numbered family silent
- [x] 4.7 `apps/designer/tests/plate-source-unassigned.dom.test.ts` — the fixture UNCHANGED in shape
      and inverted in meaning; the control asserted to be a text box with NO `<select>`, on a
      template that HAS a group; typing a brand-new key end to end; the near-miss with its severity
      asserted and `l3` as the positive control
- [x] 4.8 E2E `looks.spec.ts` — the six sources are no longer declared up front; each comes into
      existence as its plate is typed. `live-source.spec.ts` comment corrected
- [x] 4.9 🔴 **Discrimination proved by REVERTING, and the result reported as measured rather
      than as hoped.** `git stash push` on the six implementation files (schema, exporter,
      preflight, slice, Looks panel, Inspector), leaving every new test in place:

      | suite | red | total |
      | ----- | --- | ----- |
      | `@cg/shared-schema` | **6** | 548 |
      | `@cg/vcg-format` | **12** | 153 |
      | `@cg/designer` | **24** | 1394 |
      | **all three** | **42 across 6 files** | |

      Restored: **548 / 153 / 1394, all green.**

      ⚠ **NOT a clean A/B, and saying so is the point.** Three POSITIVE CONTROLS went red too
      — *"the well-formed two-look template is clean"*, *"a plate on a key others use"*, *"the SAME
      source in TWO looks is ACCEPTED"*. Their failure is `TypeError: Cannot read properties of
      undefined (reading 'map')` at the reverted `live-source-preflight.ts:493`, because the
      fixtures no longer write the `sources` array the reverted code indexes. That is a STRUCTURAL
      crash, not a behavioural disagreement, so those three prove nothing either way and are not
      counted as evidence. The discriminating reds are the ones that failed on a VALUE — e.g.
      *"expected `[ 'look-source-undeclared' ]` to deeply equal `[]`"* — and there are enough of
      them in every suite

## 5. PRD

- [x] 5.1 `B-179` re-scoped and closed with the owner's reasoning written into it — the premise
      rejected, candidate (a) deleted with the declaration, (b) shipped, Acceptance bullet 3
      deliberately not implemented and why
- [x] 5.2 `B-187`'s two-half rule collapsed to one — grouped and groupless no longer differ
- [x] 5.3 `B-188` updated with the owner's three answers and marked implemented
- [x] 5.4 The registry's claim section for the change

## 6. Gate

- [x] 6.1 `pnpm gate` green, `0 cached`
- [x] 6.2 `pnpm openspec validate --all --strict`
- [x] 6.3 Local E2E run (`CG_GATE_HOOK_E2E=1`) — a Windows pass discharges nothing, and catches a
      real break
- [ ] 6.4 🔴 **Linux `e2e` on GitHub Actions, `conclusion: success`, job RAN not skipped, run URL
      written HERE beside this box.** OWED until then — this change alters what renders.
