# Designate the main / entry composition (D-115)

## Why

Which composition the editor opens on (and the template's intended entry) is implicit today — the
first composition by LIST POSITION. That is fragile: reordering for organization silently changes the
default. A template's real entry may not be the first comp. An explicit, order-independent pointer
matches intent.

## What Changes

- **Schema (`@cg/shared-schema`)** — a new optional, non-breaking `Scene.entryCompositionId` (a
  `compositions[].id`). Absent ⇒ no designation: fall back to the first composition (the prior
  default), so scenes authored before this validate + open unchanged.
- **Store (`composition.ts`)** — `setEntryComposition(id | null)` persists/clears the designation
  (validates the id); `deleteComposition` clears it when the designated comp is deleted.
- **Load resolution (`scene-doc.ts` `ensureCompositions`)** — open the designated entry composition
  when set + valid; else the first composition; else null. So opening a template lands on the main.
- **Compositions panel (`CompositionsPanel.tsx`)** — a "Set as main" / "Unset main" context action
  and a "main" badge on the designated row.
- **Round-trip** — `entryCompositionId` lives on the Scene, which is the `.vcg`'s `template.json`, so
  it round-trips on save/reload/export with no extra plumbing; the editor honors it via open-on-load.

Composition REORDERING is a separate organizational feature — explicitly NOT folded in.

## Capabilities

- `designer-compositions` (ADDED): designate the main/entry composition.

## Impact

- `packages/shared-schema/src/scene.ts`, `apps/designer/src/renderer/state/slices/composition.ts`,
  `apps/designer/src/renderer/state/scene-doc.ts`,
  `apps/designer/src/renderer/features/compositions/CompositionsPanel.tsx` (+ `.css.ts`).
- Tests: unit (`setEntryComposition` persists/clears, unknown-id no-op, delete-clears,
  `ensureCompositions` resolves entry / falls back / stale, `SceneSchema` round-trip) + a panel E2E
  (Set as main marks the row + toggles; deleting the main clears it). No runtime/render change.
