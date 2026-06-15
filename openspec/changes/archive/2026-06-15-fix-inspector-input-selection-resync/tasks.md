## 1. Fix (@cg/designer)

- [x] 1.1 `controls.tsx` — add `resetKey?: string` to `TextField`/`ColorField`; fold
      it into the input's React `key` (`${label}-${resetKey}-${value}`).
- [x] 1.2 `DynamicDataSection.tsx` — key the data-key input by `element.id`
      (`dk-${element.id}-${currentKey}`); pass `resetKey={element.id}` to the
      field-meta `TextField`s.
- [x] 1.3 `InspectorPanel.tsx` — key the element-Name input by element id
      (`name-${elementId}-${name}`).
- [x] 1.4 `StyleSection.tsx` — pass `resetKey={id}` to the stroke/shadow `ColorField`s.
- [x] 1.5 `FieldsPanel.tsx` — pass `resetKey={field.id}` to the field-label `TextField`.

## 2. Regression test

- [x] 2.1 `apps/designer/tests/inspector-input-resync.test.ts` — render
      `DynamicDataSection`, type into element A's Data key, switch to B → B shows its
      own value AND A's value is still saved. (Verified it fails without the key fix.)

## 3. Gate

- [x] 3.1 Green gate: typecheck + lint + test + build for `@cg/designer`.
- [x] 3.2 `pnpm openspec validate fix-inspector-input-selection-resync --strict`.

## 4. Tracking

- [x] 4.1 Log `docs/prd/bugs.md` B-009.
