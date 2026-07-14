# Clear-All: take everything off air, keep it on the stack

## Why

The stack header offers exactly one bulk escape hatch, Remove-All, and it is the wrong shape
for the thing operators actually need in a hurry.

"Get it off the screen" is not "throw it away". Remove-All OUTs **and** REMOVEs every item: it
clears air and then empties the list. Recovering from it means re-importing the templates and
re-typing every field the operator had staged. So the one control available for "everything
off, now" charges a rebuild for a mistake — or for a moment of panic that turns out to have
been unnecessary.

There is no bulk way to do the safe half. An operator clearing five graphics has to press
Clear on five rows, one at a time, while they are on air.

## What Changes

1. A **Clear-All** control beside Remove-All in the stack header. It sends the per-item CLEAR
   to every ON-AIR item and **leaves every row on the stack**, idle and re-takeable.
2. A `stack.clear-all` channel, routed to a `clearAll()` on both backends (the real
   `CasparRuntime` and the offline `MockRuntime`), so the B-074 parity and route-coverage
   guards stay green.
3. **NO new AMCP verb.** `clearAll()` iterates the on-air items and calls the SAME per-item
   `out()` the row's own Clear button sends — `CLEAR <ch>-<layer>` on the urgent (air-safety)
   lane, with the same B-039 CLEAR-destroys bookkeeping, so a later take re-ADDs. The wire
   sees nothing it has not seen before.
4. **One shared `isOnAir` predicate** for the row's Clear gating and the header's Clear-All
   count, mirrored by the bridge. Clear-All must mean exactly "press Clear on every row where
   Clear is enabled", and it can only keep meaning that if the predicate is defined once.
5. The button is **absent when nothing is on air** — there would be nothing to clear — while
   Remove-All still shows, because the rows can still be dropped.
6. Confirm-gated, like Remove-All: it is still an on-air action.

## Non-goals / explicitly unchanged

- **No new AMCP verb, no quoter/escaping change, no ADR-0006 verb-sequence change.**
- Remove-All is untouched: same semantics, same confirm, same label.
- This is NOT the animated-out STOP (the authored outro). Clear-All is a hard cut, exactly
  like the per-item Clear it reuses.

## Impact

- `packages/shared-ipc` — `StackClearAllChannel` (`stack.clear-all`).
- `apps/runtime` — bridge contract, `WebSocketRuntime`, `createRuntimeBridge`, `MockRuntime`,
  `StackPanel` (the control), `onAir.ts` (the shared predicate), `StackRow` (gates on it).
- `tools/caspar-bridge` — route + `CasparRuntime.clearAll()`.
- Specs: `runtime-ui` — ADDED (a new requirement heading; no existing requirement is
  modified).

## Capabilities

- runtime-ui — ADDED: Clear-All takes every on-air item off air and keeps it on the stack.
