# Tasks — Clear-All: off air, still on the stack

## 1. Channel + both backends (the B-074 five places)

- [x] 1.1 `StackClearAllChannel` (`stack.clear-all`, `z.void()` → `{ ok, cleared }`) in `packages/shared-ipc/src/channels/stack.ts`.
- [x] 1.2 Bridge contract: `stack.clearAll()` in `apps/runtime/src/shared/runtime-bridge.ts`.
- [x] 1.3 Live client: `WebSocketRuntime.stack.clearAll`.
- [x] 1.4 Mock: `createMockBridge().stack.clearAll` + `MockRuntime.clearAll()`.
- [x] 1.5 Real bridge: `route(StackClearAllChannel, …)` + `CasparRuntime.clearAll()` — reuses `out()`, so NO new AMCP verb and no new line in `command-builder.ts`.

## 1b. Broadcast safety — per-layer, never per-channel

- [x] 1b.1 `CasparRuntime.clearAll()` iterates only items that HOLD a slot, and clears each item's OWN layer via `out()` → `CLEAR <ch>-<layer>`. No channel-level `CLEAR <channel>` is ever constructed: `command-builder.ts` is the sole AMCP seam (ADR-0006) and its `out()` is `CLEAR ${target(slot)}`, where `target()` always emits `<channel>-<layer>`.
- [x] 1b.2 Verified there is no other `CLEAR` construction in the app: the only channel-wide form in the tree is `amcp-mock`'s server-side HANDLER (it models real CasparCG); nothing we send uses it.
- [x] 1b.3 `clear-all-broadcast-safety.integration.test.ts` — records EVERY AMCP `CLEAR` on the wire: all match `<ch>-<layer>`, the unique set is exactly this app's own item layers, a foreign program producer on layer 1-1 survives on air with its producer/file unchanged, and an empty stack sends NO command at all.
- [x] 1b.4 `MockRuntime.clearAll()` deliberately does NOT add the slot filter (it allocates no slots and reaches no wire — the filter would only make Clear-All a no-op in test mode). Documented at the method.

## 2. The shared predicate

- [x] 2.1 `onAir.ts` — `isOnAir(item)` = not `idle`, not `loaded`. ONE definition.
- [x] 2.2 `StackRow`'s Clear button gates on it (it used to restate the predicate inline).
- [x] 2.3 `StackPanel`'s Clear-All count uses it, so the two can never disagree.
- [x] 2.4 The bridge's `clearAll` mirrors it.

## 3. UI

- [x] 3.1 CLEAR ALL beside REMOVE ALL in the stack header; confirm names the outcome ("come off air and stay on the stack, idle").
- [x] 3.2 Hidden when nothing is on air; Remove-All still shown (the rows can still be dropped).

## 3b. The per-item label

- [x] 3b.1 The row's OUT button is relabelled **CLEAR** — it sends `CLEAR`, and "OUT" read like the authored outro (which it is not). LABEL ONLY: same `stack.out` intent, same channel, same AMCP command.
- [x] 3b.2 `clearLabel.dom.test.ts` pins that the rename changed nothing on the wire (the same `out` intent still fires with the same itemId).
- [x] 3b.3 The E2E specs and the gating DOM test address the button by its new label.

## 4. Tests

- [x] 4.1 `clearAll.test.ts` — the `isOnAir` predicate; the mock clears air, KEEPS the rows, leaves a `loaded` item alone, no-ops on an idle stack, and a cleared item can be re-taken. Explicitly asserts clear ≠ remove.
- [x] 4.2 `clear-all.integration.test.ts` (caspar-bridge) — against a real AMCP session: both on-air layers go `producer: empty`, all three items stay on the stack, the loaded one is untouched, and a retake re-ADDs and renders. Resources released in `afterEach`, not on the last line of the test body.
- [x] 4.3 `stackPanel.clearAll.dom.test.ts` — confirm → `clearAll` called and `removeAll` NOT called; cancel → nothing; hidden with nothing on air; the count names only on-air items.
- [x] 4.4 B-074 guards: `route-coverage.test.ts` (bridge routes the new channel) and `mock-bridge-parity.test.ts` (`clearAll` in `BACKING_METHODS` + `BRIDGE_SURFACE.groups.stack`) — both green.
- [x] 4.5 caspar-bridge green ISOLATED and under the full parallel run.

## 5. Gate

- [x] 5.1 `pnpm --filter @cg/runtime typecheck lint test build` + `@cg/shared-ipc` + `@cg/caspar-bridge`
- [ ] 5.2 `pnpm turbo run typecheck lint test build --force` + `pnpm format:check`
- [ ] 5.3 `pnpm openspec validate runtime-stack-clear-all --strict`
