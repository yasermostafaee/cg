# Design — Caspar bridge Phase 2 (C-001)

Key decisions only. Architecture is the archived `caspar-bridge-architecture`;
the transport is Phase 1 (`caspar-bridge-transport`).

## Backing swap, wire unchanged

`tools/caspar-bridge`'s throwaway `RuntimeBacking` is replaced by `CasparRuntime`,
which owns the real `@cg/caspar-client` stack. `bridge.ts`'s WS server + the
`@cg/shared-ipc` frame envelope are unchanged except that request dispatch now
**awaits** async handlers (stack ops await their AMCP ack). The browser
(`WebSocketRuntime`, indicators, offline/DISCONNECTED) is untouched.

## Reconciler as source of truth

`CasparRuntime` holds a `Reconciler`. Stack ops feed it intents and acks;
`session.osc` `'events'` feed it OSC. It emits `item-changed` / `item-removed`;
the bridge publishes `Reconciler.snapshot()` over `StackStateChangedChannel`.
There is no parallel state machine.

Per-op flow (own monotonic intent `seq`):

- **load** → `applyIntent({kind:'load'})` → `LayerManager.allocate(type, ch)` →
  `assignSlot(itemId, {channel, layer, server:'primary'})` →
  `osc.interest.add(ch, layer)` → seam `CG ADD` → enqueue → `applyAck(seq, ok)`.
- **take/update/out** → `applyIntent` → seam (`CG PLAY` / `CG UPDATE` / `CLEAR`)
  → enqueue → `applyAck`.
- **remove** → `applyIntent({kind:'remove'})` → `CLEAR` → `deallocate` +
  `interest.remove`.

`templateType` for `LayerManager.allocate` is the `templateId` if it matches a
policy range, else `custom` (try/catch `UnknownTemplateTypeError`).

## The OSC interest gotcha

`OscTransport`'s interest filter defaults to **empty → drops everything**. OSC
only reaches the Reconciler for slots added via `session.osc.interest.add(ch,
layer)` — done at allocation. Without this, no confirmations arrive.

## Command seam (ADR 0006) — amcp-mock-validated, NOT hardware-validated

`CommandBuilder` is the single place AMCP lines are built. Phase-2 sequence
(what `amcp-mock` acks):

| op     | AMCP line                                             |
| ------ | ----------------------------------------------------- |
| load   | `CG {ch}-{layer} ADD {flash} "{template}" 1 "{data}"` |
| take   | `CG {ch}-{layer} PLAY {flash}`                        |
| update | `CG {ch}-{layer} UPDATE {flash} "{data}"`             |
| out    | `CLEAR {ch}-{layer}`                                  |

`data` is `JSON.stringify(fields)`, escaped via `quote()`. ADR 0006's candidate
update verbs (`CALL "update"` / `CG INVOKE`) did NOT deliver payloads on 2.3.2 and
remain unresolved; `amcp-mock` does not implement `CALL`, and acks `CG UPDATE`, so
Phase 2 uses `CG UPDATE`. Phase 3 swaps the hardware-verified verb in **here**
with no stack rework, and updates ADR 0006.

## OSC port wiring (tests)

`ServerSession` _binds_ the OSC UDP port to **receive**; `amcp-mock` _sends_ OSC
to a destination. They must match. Tests pick a free UDP port, configure
`amcp-mock`'s `oscPort` + the bridge connection's `oscPort` to it, so the mock
pushes to the port the session binds. `amcp-mock`'s `addOscObserver(host, port)`
is the alternative for an ephemeral bind.

## Coalescing (Phase-2 NOTE)

On any Reconciler change, mark the `itemId` dirty and schedule one bounded flush
(small debounce). The flush publishes `Reconciler.snapshot()` (last-write-wins per
item). This bounds outbound publishes under OSC churn — never an unbounded queue
of intermediate states. (The OSC change-tracker already dedupes unchanged events
on the input side; this bounds the output side.)

## Health & failover

`health()` derives `primary.state` from the `ServerSession` state
(healthy/connecting/disconnected…). `failover()` is a Phase-3 stub (no real second
session yet). lock / templates / audit / settings / update-gate stay simple
in-memory stubs — they are app concerns, not CasparCG playout.
