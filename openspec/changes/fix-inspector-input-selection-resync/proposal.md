## Why

The inspector's text inputs are **uncontrolled** (`defaultValue`, applied only at
mount) and relied on a React `key` derived from the committed **value** to
re-initialise. When the selection moves from element A to element B and both share
the same committed value (e.g. both Data keys empty), the key is identical, so React
**reuses the same DOM node** and keeps A's in-progress (uncommitted) draft — so B's
input displays A's value (B-009). Saving was already correct (the pending edit
commits to A on blur); only the DISPLAY was wrong.

## What Changes

- The data-key, element-name, and shared `TextField`/`ColorField` inputs now fold the
  **selected element id** (or owning field id) into their React `key`, so the input
  re-initialises whenever the selection changes — regardless of whether the two
  elements happen to share the same committed value.
- `TextField`/`ColorField` gain an optional `resetKey` prop (the owner id), threaded
  from `StyleSection`/`FieldMeta` (`element.id`) and `FieldsPanel` (`field.id`).
- Commit-on-blur is unchanged, so a pending edit still saves to the PREVIOUS element.
- `RealtimeNumberInput`/`SelectField` are already controlled and don't exhibit the
  bug; the colour popover remounts on open, so it's unaffected.

## Capabilities

### Added Capabilities

- `designer-inspector`: the inspector's editable inputs always reflect the
  currently-selected element — switching selection re-initialises each input to the
  newly-selected element's value, while a pending (uncommitted) edit still commits to
  the previously-selected element.

## Impact

- **Designer:** `features/inspector/DynamicDataSection.tsx` (data-key input key +
  `resetKey` on the field-meta `TextField`s), `features/inspector/InspectorPanel.tsx`
  (element-Name input key), `features/inspector/controls.tsx` (`resetKey` on
  `TextField`/`ColorField`), `features/inspector/StyleSection.tsx` (`resetKey` on the
  stroke/shadow `ColorField`s), `features/fields/FieldsPanel.tsx` (`resetKey` on the
  field-label `TextField`).
- **Tests:** `apps/designer/tests/inspector-input-resync.test.ts` — a render test
  that types into element A's Data key, switches to B, and asserts B shows its own
  value while A's value is still saved.
- **Bug:** `docs/prd/bugs.md` B-009.
