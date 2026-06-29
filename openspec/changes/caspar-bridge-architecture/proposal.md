# Local CasparCG bridge + real transport — architecture (C-001)

## Why

The Runtime drives an in-memory `MockRuntime`; nothing reaches a real CasparCG
server. Browsers can't open raw TCP (AMCP) or UDP (OSC) sockets, so real playout
needs a small local **bridge** process. C-001 is large — the PRD itself asks for
a thorough `design.md` and "likely several OpenSpec changes." **This change is
that design**: it settles the architecture and contract and lays out the phased
implementation. It implements **no** protocol wiring and changes **no** app
behavior — those land in the phased follow-up changes (Phase 1/2/3 below).

It also **reverses** the PRD's inherited assumption. ADR 0007 / C-001 assumed a
_thin_ bridge ("protocol stays browser-side behind a transport interface; only
the socket transport is missing"). That premise is false: `@cg/caspar-client` is
Node-tier throughout (`node:net` / `node:dgram` / `node:events`) with no real
transport interface. We therefore adopt a **thick bridge / smart proxy** and
record it durably (new [ADR 0008](../../../docs/adrs/0008-thick-caspar-bridge.md),
plus a reversal note in ADR 0007).

## What Changes

This is a **design / docs-only** change. No source, tests, or build are touched.

- **New ADR 0008** — "Thick CasparCG bridge (smart proxy), not a thin
  byte-relay." Supersedes (in part) ADR 0007's thin-bridge premise.
- **ADR 0007** — strike the thin-bridge sentence and add a reversal pointer to
  ADR 0008 ("spec is the memory").
- **`design.md`** — the thorough design the PRD asks for: where the reconciler
  runs (in the bridge), the wire protocol (existing `@cg/shared-ipc` over a
  single WebSocket), the OSC return path (tamed in-bridge; only reconciled
  `StackItemState` deltas cross), bridge selection + offline fallback, bridge
  packaging, the ADR 0006 command-construction seam, and the risks.
- **`specs/runtime-caspar-bridge/spec.md`** — a new `runtime-caspar-bridge`
  capability that captures the architecture as durable requirements (thick-bridge
  placement, the WebSocket wire = `@cg/shared-ipc`, OSC tamed in-bridge, offline
  degradation with indicator, redundancy/failover in the bridge, AMCP command
  seam). C-001's four Acceptance lines map 1:1 onto scenarios here.
- **`tasks.md`** — the phased implementation breakdown (Phase 1/2/3), each of
  which becomes its **own** follow-up OpenSpec change, integration-tested against
  `tools/amcp-mock`.

## Capabilities

- `runtime-caspar-bridge` (ADDED): the architecture + contract for driving real
  CasparCG from the browser Runtime through a localhost bridge — the thick-bridge
  placement, the WebSocket wire protocol, OSC reconciliation in the bridge,
  offline degradation, and redundancy/failover. Concrete protocol wiring is
  delivered by the phased follow-up changes that reference this capability.

## Impact

- **Docs only.** `docs/adrs/0008-*` (new), `docs/adrs/0007-*` (reversal note),
  `openspec/changes/caspar-bridge-architecture/**`. No code, no behavior change,
  no schema change.
- **Sets up follow-ups.** Phase 1 (bridge skeleton + `WebSocketRuntime` +
  offline fallback), Phase 2 (real take/update/out + OSC→Reconciler deltas,
  swap `MockRuntime` for the real stack behind the unchanged `RuntimeBridge`),
  Phase 3 (real `RedundancyAdapter` failover + on-hardware AMCP-sequence
  validation, which updates ADR 0006 / Phase 4 §9). Each is its own change,
  integration-tested against `tools/amcp-mock`.
- **Gate:** docs-only — `pnpm openspec validate caspar-bridge-architecture
--strict` + `pnpm format:check`. Not the full green gate (no source/test/build
  touched).
- Do **not** archive — await design review.
