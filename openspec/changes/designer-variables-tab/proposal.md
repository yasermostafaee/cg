## Why

Dynamic fields are currently buried at the bottom of whichever Inspector happens to be open, and
Sequence children without fields add repeated “no fields” noise. Authors need one stable,
composition-level Variables surface that remains easy to scan while they select and edit elements.

## What Changes

- Add a top-level **Variables** tab beside **Inspector** in the Designer right pane.
- Move all field authoring and binding actions from the Inspector into that tab.
- Present root fields and non-empty nested namespaces in a compact table.
- Omit Sequence/nested-composition namespaces whose aggregate contains no dynamic fields.
- Show one concise empty state only when the whole composition has no variables.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `designer-dynamic-fields`: changes the location and compact presentation of composition fields,
  while preserving the existing field/binding model and actions.

## Impact

- `apps/designer/src/renderer/App.tsx` and the right-panel composition.
- `apps/designer/src/renderer/features/fields/FieldsPanel.tsx` and its styles/tests.
- `apps/designer/src/renderer/features/inspector/InspectorPanel.tsx`, which no longer owns fields.
- Designer DOM and Playwright coverage for tabs, empty namespaces and existing field actions.
