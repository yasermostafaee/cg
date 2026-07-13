# Tasks — position-override-readback (B-072)

## 1. Schema — the field that makes the override readable

- [x] 1.1 `StackItemStateSchema` (`@cg/shared-schema`, `runtime/item-state.ts`)
      gains `position: PositionSchema.optional()`. Absent = no override.
- [x] 1.2 Unit: `StackItemState` round-trips WITH and WITHOUT `position`
      (back-compat — absent is valid and every pre-existing shape still parses).

## 2. Bridge — join `#positions` into the published state at the EMIT site

- [x] 2.1 `CasparRuntime`: one private `#published()` helper maps
      `#reconciler.snapshot()` and attaches `this.#positions.get(itemId)` when
      present. Ownership does NOT move (Reconciler keeps item state,
      `CasparRuntime` keeps `#positions`).
- [x] 2.2 It backs BOTH renderer-facing exits and only those:
      `stackSnapshot()` and the `stackChanged.emit()` in `#markDirty`. The
      internal `#reconciler.snapshot()` callers (`removeAll`, health/lock) stay
      raw.
- [x] 2.3 Bridge integration (amcp-mock, red-first): `setPosition` on an item →
      that item's PUBLISHED state carries `position` equal to the override on
      BOTH `stackSnapshot()` and the `stackChanged` push; a later re-read (the
      deselect/reselect analogue) still carries it; after `remove` the field is
      gone; an item that never got an override publishes none.

## 3. Renderer — swap the seed SOURCE, add no store

- [x] 3.1 `PositionPicker` seeds from
      `item.position ?? defaultPositionOf(item.templateId)`. The itemId-keyed
      remount + re-seed stay exactly as they are. NO renderer-side override
      store (the B-070 anti-pattern).
- [x] 3.2 DOM tests (red-first): an item whose state carries an override seeds
      the picker from the OVERRIDE, not the manifest default; an item with no
      override still seeds from the default (and from CENTERED when the
      template declares none).
- [x] 3.3 DOM test — the BLAST-RADIUS guard: mount for an item with an applied
      override, press Apply WITHOUT editing → the `stack.set-position` payload
      equals the OVERRIDE, never the manifest default / CENTERED. This is the
      regression that used to destroy a correct on-air position.

## 4. Mock parity (the B-070 lesson)

- [x] 4.1 `MockRuntime.stackSnapshot()` performs the same join from its own
      `#positions` (its `positionOf` accessor already reads it); `#emitStack()`
      routes through `stackSnapshot()`, so one join covers both channels.
- [x] 4.2 Test: the mock publishes the override in item state (the DOM/e2e path
      exercises the real read-back shape, not a mock-only fiction).

## 5. Gate + wrap-up

- [x] 5.1 caspar-bridge suite green BOTH isolated AND under the full parallel
      `pnpm test`; every test binding a port/socket/server releases it in
      `try/finally`.
- [x] 5.2 Full uncached gate (`turbo --force`): format:check + typecheck + lint + test + build for every touched workspace.
- [x] 5.3 `pnpm openspec validate position-override-readback --strict`.
- [x] 5.4 PRD: file B-072 in `docs/prd/bugs-runtime.md` with the live-
      confirmation checklist (PENDING hardware); update `docs/ROADMAP.md`.
- [ ] 5.5 Pre-archive shared-spec ordering check — this change is a pure ADD to
      `runtime-caspar-bridge` (new requirement heading) + a MODIFY confined to
      `runtime-ui`, which the held pair (`fix-amcp-escaping-v2` /
      `reconnect-reconciliation`) never touches. If the check flags overlap
      with the held prescriptive-verb / template-resolution text, leave ACTIVE
      and report.

## 6. Live confirmation (PENDING hardware — the on-air half already works)

- [ ] 6.1 Apply a position → Play → the graphic renders at the override
      (unchanged behavior; the regression guard for this change).
- [ ] 6.2 Deselect → reselect → the picker SHOWS the override, not the default.
- [ ] 6.3 Re-Apply without editing → the on-air position is unchanged (NOT
      reverted to the manifest default).
