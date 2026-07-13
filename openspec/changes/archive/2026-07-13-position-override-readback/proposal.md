# Position override read-back: the picker must show what is actually applied (B-072)

## Why

R-011 gave the operator a per-item on-air position override. The bridge stores
it and honours it: `#positions` (`CasparRuntime`) is written by
`stack.set-position`, read on every `CG ADD` (load AND the take re-ADD) to
append `?pos=&dx=&dy=` to the resolved served URL, and dropped only when the
item is removed. **On air, this works** — the graphic renders at the override.

What R-011 never built is the **read-back**. The override is write-only from
the SPA's point of view:

- `stack.set-position` answers `{ ok, reason? }` — no read.
- The two channels that carry item state to the renderer (`stack.snapshot`,
  `stack.state-changed`) carry `StackItemState[]`, whose shape has **no
  `position` field**. The item's state structurally cannot carry the override
  back.
- `PositionPicker` therefore seeds from the ONLY source it has —
  `defaultPositionOf(item.templateId)`, the manifest default recorded at
  `.vcg` import, keyed by templateId and blind to any override.

The picker is mounted `key={pos-${itemId}}`, so deselect → reselect remounts it
and re-seeds from that default. **The UI lies about what is applied.**

That would be merely cosmetic if the picker were read-only. It is not: it has
an Apply button. An operator who reselects an item, sees the DEFAULT, and
re-presses **Apply position** — reasonably, believing the override never stuck —
sends the manifest default and **silently destroys the correct on-air
override**. The display bug's blast radius is real destruction of operator
state, which is why B-072 is high and not medium.

## What Changes

The stored override is surfaced over the state stream that **already exists** —
no new IPC channel, no renderer-side source of truth.

- **Schema.** `StackItemStateSchema` gains an OPTIONAL `position?: Position`.
  Absent = no override (back-compatible: every existing producer/consumer of
  item state validates unchanged).
- **Bridge.** At the two sites where item state leaves `CasparRuntime` for the
  renderer — `stackSnapshot()` and the `stackChanged.emit()` in `#markDirty` —
  the published state is joined with `#positions`. Ownership does not move: the
  Reconciler still owns item state, `CasparRuntime` still owns `#positions`;
  they are joined at the EMIT site. Delete-on-remove then clears the field for
  free.
- **Renderer.** `PositionPicker` seeds from `item.position ?? defaultPositionOf(item.templateId)`.
  The itemId-keyed remount and the re-seed stay exactly as they are — only the
  seed SOURCE changes.
- **Mock.** `MockRuntime` mirrors the bridge and publishes its stored override
  in item state, so the offline/DOM path exercises the real read-back shape
  (the B-070 lesson: the mock must not be the only one that models — or fails
  to model — a path the UI depends on).

## Impact

- Affected specs: `runtime-caspar-bridge` (ADDED: published state carries the
  override), `runtime-ui` (MODIFIED: the picker's seed source).
- Affected code: `@cg/shared-schema` (`runtime/item-state.ts`),
  `@cg/caspar-bridge` (`caspar-runtime.ts`), `@cg/runtime`
  (`PositionPicker.tsx`, `platform/MockRuntime.ts`).
- **FROZEN, untouched:** R-011's refusal predicate (on-air/unsettled ⇒
  `reason: 'on-air'`), the picker lock that mirrors it, delete-on-remove ("the
  override dies with the item"); the B-064 serve contract — the override still
  rides the RESOLVED served URL query as the single permitted touch, a bare id
  is still never given a query, and the position still never touches the data
  payload, so ADR-0006 / B-041 escaping is unaffected. **No AMCP verb is added
  and no wire payload changes** — this change is read-back only.
