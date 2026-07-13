# Tasks — nested-composition fields reach the Inspector (B-067)

## 1. Recon (done)

- [x] 1.1 Locate where nested fields are dropped: `templateDelivery.ts` builds
      `TemplateInfo.fields` from `scene.fields ?? []` (ROOT only); for a D-119 starter the
      entry comp's own `fields` is `[]` because `migrateGlobalFieldsToCompositions`
      relocated them to the nested comp.
- [x] 1.2 Confirm the nested address ALREADY exists end-to-end (GDD emits it, the template
      runtime resolves `values[child.name]`, `JSON.stringify` carries it, the Designer
      preview drives it) ⇒ no new field identity, no AMCP change.
- [x] 1.3 Confirm the existing collector to reuse: `aggregateCompositionFields` (the GDD
      exporter already calls it). Do NOT reinvent.
- [x] 1.4 Confirm the real blocker is `FieldValuesSchema` (flat `z.record`) rejecting a
      nested payload at the IPC boundary.
- [x] 1.5 Confirm no Reconciler change is needed: the Inspector applies the COMPLETE field
      set, so whole-namespace objects survive the existing shallow top-level merge.

## 2. Schema — carry the address that already exists

- [x] 2.1 `@cg/shared-schema` `fields.ts`: `FieldValuesSchema` becomes recursive
      (`NestedFieldValues`). A SUPERSET — every existing flat payload still validates.
- [x] 2.2 `@cg/shared-schema`: Zod schemas for the existing `CompositionFieldGroup` /
      `AggregatedFields` TS types, so they can cross the IPC boundary.
- [x] 2.3 `@cg/shared-ipc` `templates.ts`: `TemplateInfo.groups` (ADDITIVE — `fields` keeps
      its meaning: the composition's own flat fields).

## 3. Runtime — aggregate, render, seed

- [x] 3.1 `templateDelivery.ts`: build `TemplateInfo` from
      `aggregateCompositionFields(scene, scene)` instead of `scene.fields ?? []`.
- [x] 3.2 `draftStore.ts`: address drafts by PATH (`readonly string[]`) instead of a flat
      field id; deep-get / deep-set / deep-merge. Flat behavior (path length 1) unchanged.
- [x] 3.3 `Inspector.tsx`: render `groups` recursively as labelled sections; field controls
      take a path.
- [x] 3.4 `LibraryPanel.tsx`: seed defaults with `defaultNestedValues(aggregate)`.

## 4. Tests (red-first)

- [x] 4.1 RED-FIRST: a two-comp template (real D-119 starter fixture) → the delivered
      `TemplateInfo` exposes the nested fields (fails before 3.1).
- [x] 4.2 Inspector renders the nested group + its fields (fails before 3.3).
- [x] 4.3 Round-trip: an edited nested field lands in the applied payload under
      `{ instanceName: { fieldId } }` — the key the binding reads.
- [x] 4.4 Wire proof: that payload reaches the `CG UPDATE` data argument unchanged
      (nested object survives `JSON.stringify` + escaping), and the template runtime's
      binding resolves it at render.
- [x] 4.5 Same-named fields in two different nested instances stay distinct.
- [x] 4.6 Regression: a FLAT (single-comp) template still behaves exactly as before.

## 5. Gate

- [x] 5.1 `turbo run typecheck lint test build --force` green.
- [x] 5.2 `format:check` clean; `openspec validate --all --strict`.
- [x] 5.3 caspar-bridge green isolated AND under full parallel `pnpm test`.

## 6. Wrap-up

- [x] 6.1 `design.md`: the recon diagnosis, the aggregation fix, the keying/round-trip
      proof, and which Designer collector was reused.
- [ ] 6.2 B-067 → `[x]` at archive, with the live-confirmation checklist (PENDING HARDWARE):
      load a D-119 two-comp starter → nested fields appear in the Inspector → edit one →
      it renders on air.
- [x] 6.3 Pre-archive shared-spec ordering check: this change touches
      `runtime-template-library` ONLY — it does NOT touch `runtime-caspar-bridge`, where the
      held pair (`fix-amcp-escaping-v2` → `reconnect-reconciliation`) both hold deltas on
      the shared "Template resolution is validated" requirement. No ordering interaction.
