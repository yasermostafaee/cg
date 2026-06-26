# Sequence: typed items (text | composition) — D-083 Phase 1

## Why

A rotating now/next TITLE / branding element commonly cycles **mixed**
content — a headline, a channel logo, a clock — each through the same in/out
transitions and dwell. Today a sequence item is text-only
(`{ id, text, dwellMs? }`), so a clock or a logo card can't ride the rotation.

The platform already has a composition library (`scene.compositions`) and a
`composition` element that references one by `compositionId` and renders its
content via the engine. A single clock/logo is just a one-element composition.
So instead of inventing per-kind sequence primitives, a sequence item becomes
`text | composition`: a composition item reuses the SAME `compositionId`
reference and the SAME rendering engine — so D-084 (clock timezone), D-103
(blinking colon), and shared/asset logos all "just work" inside a sequence
with no special sequence-item rendering.

## What changes

- **Schema (`@cg/shared-schema`).** `SequenceItemSchema` becomes a discriminated
  union: a TEXT item `{ kind?: 'text', id, text, dwellMs? }` (the bindable kind)
  or a COMPOSITION item `{ kind: 'composition', id, compositionId, dwellMs? }`.
  `kind` is OPTIONAL so a pre-D-083 item `{ id, text }` parses UNCHANGED as text.
  **Non-breaking: no schema-version bump, no migration.**
- **Runtime (`@cg/template-runtime`).** A composition item renders the referenced
  composition's HELD content for the item's dwell, with its LIVE inner drivers
  running (a clock ticks). The composition's own intro/outro lifecycle does NOT
  run inside the sequence. The sequence's `transitionIn/Out`, `dwell`,
  `advance` (auto|manual), and `next()` apply uniformly to text and composition
  items; advancing tears the composition subtree down.
- **Inspector (`@cg/designer`).** Each sequence item gains a KIND picker
  (Text / Composition); a composition item swaps its text input for a
  composition picker drawn from the scene's compositions (the same nestable set
  the composition/repeater pickers use). Add / remove / reorder / per-item dwell
  still work.
- **Binding.** TEXT-ONLY in Phase 1: a sequence holding any composition item is
  not data-bindable (its Data key is disabled with a hint; the bind-resolver
  returns null). Composition items are static in Phase 1.
- **Export.** A composition referenced ONLY by a sequence composition item joins
  the per-composition export closure, so its template + assets are packaged; the
  bundled runtime renders the item (reusing composition asset resolution + the
  clock driver).

## Impact

- Affected specs: `designer-sequence-element` (MODIFIED item shape + ADDED
  composition-item rendering/authoring/binding/export).
- Affected code: `packages/shared-schema/src/elements.ts`,
  `packages/shared-schema/src/composition-fields.ts`,
  `packages/template-runtime/src/{sequence-driver,scene-builder,runtime,types}.ts`,
  `apps/designer/src/renderer/features/fields/{ListItemsEditor,bind-resolver}.ts`,
  `apps/designer/src/renderer/features/inspector/{StyleSection,DynamicDataSection}.tsx`,
  `apps/designer/src/renderer/state/slices/fields.ts`.
- Out of scope (Phase 2): per-item field injection into composition items; a
  nested crawler's liveness inside a composition item (clocks ARE live in
  Phase 1).
