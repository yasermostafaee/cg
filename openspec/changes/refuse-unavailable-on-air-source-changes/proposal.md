# refuse-unavailable-on-air-source-changes — reject an unavailable picture before it can split an on-air action

PRD: `B-355` (`docs/prd/bugs-runtime.md`). Related, but not reopened: `B-273` / `LOOK-SWITCH-01` established that a
look switch is all or nothing; `B-299` established the same prospective-binding gate for a source the row's channel
cannot show.

## Why

The Playout deliberately keeps a listed-but-unavailable input in the catalogue. CG Control may bind it while preparing
a row off air, but it may not be seated. Two live doors currently lose that distinction:

- **Update on air** accepts a new unavailable binding, records it, sends no replacement picture and leaves the old
  picture on air without an error;
- a look switch validates an already-punched `plateId` as though its picture were already satisfied, even when the
  destination look binds that same plate to a different unavailable source. In the owner's case the outgoing shared
  plate is the full-screen Playlist output and the destination's other box is valid, so the old Playlist remains
  full-screen while that valid frame moves — a partial composition belonging to neither look. The inverse, where the
  shared plate keeps Playlist and a newly shown/held plate is unavailable, already refuses correctly.

The first result says an edit landed when it did not. The second violates the existing all-or-nothing look-switch
contract and can expose a wrong or empty box on air.

## What Changes

- A row that owns live seats refuses any Update that introduces a new or changed binding whose resolved catalogue
  entry is not seatable. Fields and bindings remain one atomic action: no intent, state or AMCP changes.
- An emergency live-source swap applies the same rule to the target it changes. An unrelated unchanged invalid frame
  still does not block repairing another plate to a healthy source.
- A look switch requires every frame of its destination look to resolve, even when its `plateId` is already punched by
  the outgoing look. Refusal happens before pre-seat, page tell or any other wire command.
- The existing two-axis source rule remains: a listed unavailable source is still bindable for off-air preparation,
  but it is never seatable. Take and switch enforce the air boundary.
- A frame whose binding is unchanged is not retroactively refused merely because the Playout later marked its source
  unavailable. Text-only and unrelated repair actions keep their existing behavior.
- Every refusal uses the existing `source-unavailable` / `source-unusable` vocabulary and names `Plate N`, the source
  and its reason. A two-box action either lands completely or leaves the previous layout and pictures untouched.

## Capabilities

### Modified Capabilities

- `runtime-playout-sources`: distinguish off-air binding from on-air seating for unavailable entries at Update, take
  and switch, including the unchanged-binding control and the canonical refusal sentence.
- `runtime-caspar-bridge`: add the narrow requirement that prospective on-air binding changes and destination-look
  validation happen atomically before any page or plant mutation.

## Impact

- `tools/caspar-bridge/src/caspar-runtime.ts`: the prospective binding refusal and the switch planner's validation
  scope; no new rollback path or source-status predicate.
- `packages/shared-ipc/src/playout-sources.ts` and `tools/caspar-bridge/src/live-plate-assignment.ts`: existing
  predicates, error codes and wording are reused; their public contract does not change.
- `apps/runtime/src/platform/MockRuntime.ts`: parity or a narrow e2e seed for the catalogue-plan refusal.
- Tests: bridge integration coverage for Update and shared-plate look switch, plus Runtime e2e feedback/state coverage.
- No IPC shape, persisted schema, AMCP success wire, picker availability or off-air preset behavior changes.
