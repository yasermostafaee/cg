# FROM FILE becomes an AUTHORED grant, per field, chosen in the Designer

## Why

The owner's complaint, verbatim: _"Not every text needs to read from a file. It is really for
subtitles and long copy, not small labels. It should be optional, chosen in the Designer."_

R-018 shipped the from-file affordance gated on **FIELD KIND and nothing else** —
`Inspector.tsx:682` reads `kind === 'text' || kind === 'multiline' || kind === 'list'`. That is
not a decision anybody made about a particular field; it is a decision about a TYPE, and it is
therefore made identically for a 12-character `title` and for a 400-word crawl. The result is
the most propagated control in the Runtime Inspector — `FromFileControl.tsx:127` says so in its
own comment: _"it renders once per text / multiline / list field"_ — and on a template with a
dozen labels it is a dozen buttons the operator will never press, under every one of them.

The fix is to move the decision to the only person who knows which fields are long copy: the
**author**, in the Designer, at the moment they are already setting that field's label, its
length limits and its validation pattern.

## What Changes

- **ADD** an authored per-field flag `allowFileSource` to `@cg/shared-schema`'s `text`,
  `multiline` and `list` field variants — **and to no other variant**, so the flag is
  un-settable on a field that could not take file content, rather than settable-and-ignored.
- **ADD** the ONE canonical predicate `fieldAllowsFileSource(field)` beside the schema, plus
  `fieldTypeTakesFileSource(type)` for the outer kind gate. Every surface that asks "may this
  field take a file?" calls it; nobody re-derives the kind list. (Golden rule 6.)
- **ADD** an "Allow file source" row to the Designer's **Dynamic / Data** section
  (`DynamicDataSection.tsx` → `FieldMeta`), beside Required / Min length / Pattern — the
  field's other authored properties. It renders only where the flag can exist; switching the
  field to `number` DROPS it rather than hiding it.
- **MODIFY** the Runtime Inspector's gate: the kind test stays as the OUTER condition and the
  authored grant becomes the inner one. A field that does not grant renders no FROM FILE
  control at all.
- **ADD** a durable detach for an attachment whose field no longer grants — driven from a
  POSITIVELY LOADED template schema only (see `design.md` §3; this is the one part of the
  change with a real hazard).
- **DEFAULT OFF** for fields authored before the flag existed, under the `P-031` compatibility
  floor. See `design.md` §2.

## Impact

- `packages/shared-schema/src/fields.ts` — three variants gain the optional flag; the two
  predicates.
- `apps/designer/src/renderer/state/slices/fields.ts` — `ElementFieldMetaPatch.allowFileSource`,
  and `rebuildField` carries it on the three variants that can hold it.
- `apps/designer/src/renderer/features/inspector/DynamicDataSection.tsx` — the authoring row.
- `apps/runtime/src/renderer/features/inspector/Inspector.tsx` — the gate, and the detach effect.
- `apps/runtime/src/renderer/features/inspector/fromFileStore.ts` — `detachUngrantedSources`.
- No wire change: the flag rides `DynamicField`, which already travels
  scene → `template.json` → `aggregateCompositionFields` → `TemplateInfo.fields`/`groups` →
  the Inspector. Nothing new is plumbed.
