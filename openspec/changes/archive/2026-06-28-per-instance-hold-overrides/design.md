# Design — per-instance hold overrides (D-112)

## Recon summary (where the change lands)

- **Schema** — `CompositionElementSchema` at `packages/shared-schema/src/elements.ts:561`
  (`type:'composition'` + `compositionId`; carries NO `drivesHold` of its own). Sibling content
  elements (`ticker`/`clock`/`sequence`) each have `drivesHold: z.boolean().optional()`.
- **Runtime** — `packages/template-runtime/src/runtime.ts`. The content-driven hold (D-104/B-031)
  aggregates per scope: each scope's drivers are collected into `holdTickers`/`holdCountdowns`/
  `holdSequences` (filtered by the element's own `drivesHold !== false` at lines 404/426/539);
  `ownContentWait()` (570-577) = `Promise.all` of those; the coordinator's `waitForContent`
  (701-705) calls `aggregateContentWait(ownContentWait(), instanceChildren)` (146-161); a
  **non-coordinator** instance child is recursed via `contentTreeWait(child)` →
  `child.ownContentWait()`. **Key constraint:** `ownContentWait()` BAKES the child's own
  `drivesHold` filter at wiring time, so the parent has no per-element override point — it must be
  given the child's drivers per-element to re-filter.
- **Scope wiring** — `instanceChildren` are built at runtime.ts:614 from `scope.children`
  (`FieldScopeChild` in `types.ts:336` = `{ name, compositionId, scope }`), themselves pushed in
  `scene-builder.ts:193` from each `CompositionElement`. The instance Element (hence its
  `holdOverrides`) is reachable ONLY there — it must be threaded onto `FieldScopeChild`.
- **Round-trips** — `pack.ts:73` `JSON.stringify(scene)` (no allowlist) and
  `ExporterSingleFile.ts:245` inline the whole scene; `unpack.ts:35` `SceneSchema.parse` STRIPS
  unknown fields, so an OPTIONAL schema field is required (and sufficient) for survival.
- **Store/UI** — `slices/elements.ts` `setElementDrivesHold` + recursive `patchDrivesHold`;
  `PlayoutSection.tsx` `nestedHoldGroupsOf` (read-only D-108 rows) + the D-107 own-content checklist
  - the D-111 `InfiniteWarn`.

## Decision: schema shape

Add to `CompositionElementSchema` ONLY:

```ts
holdOverrides: z.record(z.string(), z.boolean()).optional(),
```

Keyed by the **nested content element's stable id**; value = whether it drives THIS instance's
parent hold. Optional ⇒ non-breaking, no `CURRENT_SCHEMA_VERSION` bump (stays `1`), survives both
round-trips. The override lives on the **composition-instance** element (the parent's copy), never
on the shared child — that is the whole point (per-instance isolation).

## Decision: resolution order (the single rule)

For a nested content element `el` reached through a composition-instance `inst`, its effective
participation in **`inst`'s parent hold** is:

```
effectiveDrivesParentHold(inst, el) =
  inst.holdOverrides[el.id]   if that key is defined
  else el.drivesHold !== false   (absent ⇒ drives, false ⇒ excluded)
```

- The element's OWN `drivesHold` is UNCHANGED and still governs the **child composition's own
  hold** (its own coordinator hold, if it is content-driven). The instance override affects ONLY
  the parent's aggregation — never the child's self-settle, never visibility, never whether content
  starts/runs. A looping element excluded by an override keeps crawling until the parent's exit.
- The override is consulted ONLY for a **non-coordinator** nested child (whose content the parent
  aggregates per-element). A content-driven (coordinator) child is awaited via `whenSettled()`
  (B-031) — the parent delegates to the whole child lifecycle, so an override on a coordinator
  child's internal content has no effect on the parent (to change that, edit the child's own
  playout/`drivesHold`). This matches the user's scenario (a default-`manual` nested child whose
  finite ticker + looping sequence the parent aggregates).

## Decision: deep-nesting cascade (per instance level)

`holdOverrides` on an instance element governs ONLY its referenced composition's **OWN direct
content** (recursing containers, NOT deeper composition instances). A deeper instance carries its
OWN `holdOverrides`, applied at ITS level. So for `P → I_C(comp C{Y, I_D}) → I_D(comp D{X})`:

- `Y` (C's direct content) is governed by `I_C.holdOverrides[Y.id] ?? Y.drivesHold`.
- `X` (D's direct content) is governed by `I_D.holdOverrides[X.id] ?? X.drivesHold`.

`I_C`'s overrides never reach `X`; each instance overrides exactly one level. The override travels
WITH the instance element in the tree, so the same child instanced under different parents resolves
independently. The Designer surfaces this progressively (D-108's drill-in): the parent edits the
IMMEDIATE instance's direct content as writable rows; deeper content is edited by drilling into that
instance (where its own writable rows appear).

## Decision: runtime threading (minimal, non-coordinator path only)

1. `FieldScopeChild` (`types.ts`) += `holdOverrides?: Readonly<Record<string, boolean>>`;
   `scene-builder.ts` pushes `element.holdOverrides` when creating the child.
2. `ScopeNode` (`runtime.ts`) gains:
   - `contentDrivers: ContentDriver[]` — EVERY hold-eligible own driver (ticker / countdown clock /
     sequence) as `{ id, drivesHold, whenComplete }`, UNFILTERED (so a parent override can
     force-include a child-excluded element, and force-exclude a child-included one).
   - `holdOverrides?: Readonly<Record<string, boolean>>` — the overrides of the instance element
     that produced this scope (set by the parent right after `wireScope` returns).
3. `ownContentWait()` UNCHANGED (still the child's own `drivesHold`-filtered hold — used by the
   child's own controller). The parent does NOT use it for a non-coordinator child anymore.
4. New `nestedContentWait(node)` REPLACES `contentTreeWait` for the non-coordinator recursion:
   `Promise.all` of `node.contentDrivers` filtered by `effectiveDrives(node.holdOverrides, d)` PLUS
   each instance child (coordinator → `whenSettled()`, else → `nestedContentWait(grandchild)`),
   applying each level's own `holdOverrides`. The coordinator's own `aggregateContentWait` keeps
   using `ownContentWait()` for ITS OWN content (no self-override) and `nestedContentWait` for its
   children.

This is the smallest change that (a) keeps the proven own-hold path intact, (b) gives the parent a
per-element re-filter, and (c) cascades per level.

## Decision: store mutator

`setHoldOverride(instanceId, nestedElementId, drives: boolean | undefined)` — a recursive patch
(mirrors `patchDrivesHold`; a composition instance can sit inside a container, so a shallow
`locate` would miss it) that, on the `type:'composition'` element with `id === instanceId`, sets
`holdOverrides[nestedElementId] = drives` or DELETES the key when `drives === undefined`; an empty
record collapses to `undefined`. The UI passes `undefined` when the chosen value equals the child's
own `drivesHold` (so toggling back to default CLEARS the override — minimal, round-trip-stable data,
and the fallback rule stays the single source of truth).

## Decision: Designer UI (writable rows, fold in D-111)

`nestedHoldGroupsOf` returns, per immediate instance: its referenced comp's DIRECT content drivers
`{ id, name, type, drivesHold, infinite, override, effective }` (writable rows), a recursive
EFFECTIVE driver count + effective-infinite count (overrides applied per level, for the prominent
all-infinite alert + the "drill in for more" hint), and the instance `key` (override target). Each
nested driver renders a checkbox (`checked = effective`) writing `setHoldOverride(instance, id,
checked === drivesHold ? undefined : checked)`, its name/type, and the D-111 `InfiniteWarn` when
`effective && infinite`. The D-108 drill-in chip stays (to edit deeper levels / the shared child).
The prominent all-infinite `Callout` now aggregates EFFECTIVE drivers (own + nested), so excluding a
nested infinite via override clears it.

## Decision: a coordinator immediate child is surfaced READ-ONLY (post-review)

Because the override is inert on a coordinator child (the parent awaits its `whenSettled`), the
Designer must NOT show writable override rows for one — that would re-introduce a silent footgun (a
control that appears to work but doesn't). `nestedHoldGroupsOf` marks each group `writable` via the
same predicate the runtime uses (`isCoordinatorComp` = `playoutOf(comp).mode !== 'manual' &&
holdSource === 'content-driven'`); a non-writable (coordinator) group renders the read-only drill-in

- a count + the infinite flag, so the operator drills in to edit the child's OWN participation. With
  overrides un-settable on a coordinator child, the UI's effective counts (which fall back to
  `drivesHold`) also match the child's `whenSettled` basis.

## Out of scope

- Repeater-row content (rows aren't `instanceChildren`); coordinator-child internal overrides
  (delegated to `whenSettled`); any animation-engine change; schema-version bump.
