# runtime-caspar-bridge — delta (retention models the row's STATE: B-107 / B-109 / B-108)

## MODIFIED Requirements

### Requirement: The browser retains stack intent and restores it on reconnect

Stack items MUST survive a restart of the bridge process. The stack SHALL NOT live only in the
bridge's memory: the browser SHALL retain the operator's stack INTENT — for each item its id,
template id, current field values, **the STATE the row was actually in**, any error code that state
carries, the slot it occupied, and any position override, in stack order — in a **persistent,
browser-local** store (the same file-backed ownership model [[B-085]] gave the template library), so
the intent survives both the bridge's death and a page reload.

The retained STATE SHALL be a closed set that answers exactly one question — may this row's producer
be re-seated? — and SHALL distinguish at minimum:

- an item that was ON AIR when last observed, or may still be (the bridge died under it);
- an item whose producer was RESIDENT but not on air;
- an item whose layer is KNOWN EMPTY because the operator deliberately CLEARed it (or a reconcile
  proved the layer empty);
- an item whose last operation FAILED.

A deliberate CLEAR and a bridge death SHALL be distinguishable in the retained record. Play evidence
SHALL be DERIVED from the retained state rather than stored beside it, so the two cannot disagree.
The mapping from a reconciled status to a retained state SHALL exist in exactly ONE place, shared by
every consumer; a second copy SHALL NOT be derived locally.

On EVERY (re)connect the browser SHALL reconcile the bridge to that retained intent **before** it
re-pulls the stack snapshot, and it SHALL re-deliver the retained templates first so each restored
item resolves against a populated template registry. Because the restore precedes the re-pull, the
snapshot the SPA adopts is the RESTORED stack — never the empty one a freshly booted bridge would
otherwise report. A restore that fails SHALL leave the retained intent intact for the next connect
and SHALL NOT be allowed to blank the retained stack.

Conflict policy is local-wins, with one exception: an item the connected bridge ALREADY holds SHALL
NOT be clobbered by the retained copy (a page reload against a healthy bridge changes nothing). An
item whose template is not registered, or for which no layer can be obtained, SHALL be skipped
rather than failing the whole restore.

The restored rows SHALL appear as soon as the intent is delivered, without waiting for CasparCG:
restoring an item SHALL seed the bridge's stack state and publish it immediately, and SHALL send
NOTHING to CasparCG at that moment. A restored item SHALL be seeded at the state it was retained in
— a failed row comes back FAILED, a cleared row comes back cleared — and a restore SHALL NEVER
seed a state better than the one that was retained.

#### Scenario: The stack survives a bridge restart

- **WHEN** the bridge process is killed and restarted while the operator has items on the stack
- **THEN** the items are still on the stack after the SPA reconnects — the list is NOT emptied

#### Scenario: The retained intent is delivered before the snapshot is re-pulled

- **WHEN** the SPA reconnects to a freshly booted, empty bridge
- **THEN** it re-delivers the retained templates and then the retained stack intent, and the stack
  snapshot it subsequently adopts contains the restored items rather than an empty list

#### Scenario: A live bridge's own stack is never clobbered

- **WHEN** the SPA connects (e.g. after a page reload) to a bridge that still holds those items
- **THEN** the bridge keeps its own item state and the retained copy is skipped

#### Scenario: A failed restore does not destroy the retention

- **WHEN** the restore of a retained item is rejected by the bridge
- **THEN** the retained stack intent is preserved for the next connect, and the SPA does not adopt
  an empty stack in its place

#### Scenario: A deliberate CLEAR and a bridge death are distinguishable in the retention

- **WHEN** one item is CLEARed by the operator and another is left on air, and the bridge then dies
- **THEN** the two retained records differ in their retained state — the cleared one records that
  its layer is deliberately empty, the other that it was on air
- **AND** neither record is reduced to the same value as the other

#### Scenario: A failed row is restored as failed, not as ready

- **WHEN** an item whose retained state records a FAILED operation is restored into a fresh bridge
- **THEN** the bridge seeds it at its failed state, carrying its error code
- **AND** it is not seeded as loaded, playable, or on air

### Requirement: The stack is visible while the bridge is unreachable

The operator's stack MUST remain visible with the SPA↔bridge link down, including across a fresh
page load. Retaining the intent is not sufficient on its own: if the retention is only ever used as
the reconnect delivery set, a hard refresh during a bridge outage shows an EMPTY stack until the
bridge returns — the list disappearing, which is the failure this capability exists to prevent.

The stack snapshot SHALL therefore always be answerable: while the link is not usable it SHALL be
served from the browser-local retained intent instead of being refused, exactly as the template
library is served locally. This is **display only** — it SHALL send no command, and it SHALL make no
restore-vs-reset decision. The occupancy-aware restore remains the bridge's, on reconnect, and once
the link is usable the authoritative snapshot SHALL replace the locally-served view.

Rows served from local intent while the bridge is down MUST be honest about what cannot be verified,
**and losing the link SHALL NEVER IMPROVE a row's status.** A row whose retained state records that
it had been taken to air SHALL render in the muted UNVERIFIABLE state ("was on air, cannot confirm
now") and SHALL NOT render a confident on-air claim — with no bridge the SPA has no conduit to
CasparCG at all. A row that had not been taken SHALL render as a non-air-claiming resting state. No
such row SHALL be shown as pending.

Distinct retained states SHALL stay distinct in that view. A row whose last operation FAILED SHALL
be published as failed, carrying its error code, and SHALL NOT be published as loaded or ready. A
row whose layer is known empty SHALL be published as such, and SHALL NOT be published as loaded. The
projection SHALL NOT collapse a failed row, a known-empty row and a genuinely loaded row onto the
same published status.

The projection SHALL round-trip: re-mirroring a locally-served snapshot back into the retention
SHALL yield the same retained states, so displaying the stack offline can never corrupt it.

The locally-served view SHALL also count as the current stack for the offline
refuse-while-referenced check, so a template used by visible retained rows cannot be removed while
disconnected.

#### Scenario: A hard refresh during a bridge outage still shows the stack

- **WHEN** the operator reloads the page while the bridge process is down
- **THEN** the retained stack rows are displayed rather than an empty list

#### Scenario: Offline rows never claim ON AIR

- **WHEN** a retained row that had been taken to air is displayed with the bridge down
- **THEN** it renders as UNVERIFIABLE ("was on air"), never as a confident on-air claim, and never
  as pending

#### Scenario: An errored row does not become READY when the bridge dies

- **WHEN** a row whose reconciled status is a failure is displayed after the bridge process dies
- **THEN** it is published as failed, with the error code it carried
- **AND** it is NOT published as loaded, and the row does not read READY

#### Scenario: A cleared row does not become READY when the bridge dies

- **WHEN** a row the operator CLEARed is displayed after the bridge process dies
- **THEN** it is published as its known-empty resting status, not as loaded

#### Scenario: The offline view commands nothing

- **WHEN** the stack is displayed from local intent while disconnected
- **THEN** no frame is sent to the bridge, and the on-air verbs remain refused

#### Scenario: The authoritative stack replaces the offline view

- **WHEN** the bridge becomes reachable again
- **THEN** the re-pulled snapshot replaces the locally-served rows with the bridge's reconciled
  state

#### Scenario: A template used by offline rows cannot be removed

- **WHEN** the operator tries to remove a template that visible retained rows reference, with the
  bridge down
- **THEN** the removal is refused as in-use

### Requirement: Restoring a retained item never clears a live layer

Restoring retained stack intent MUST NOT drive the ordinary load path, because that path CLEARs a
layer before its first `CG ADD` on the layer ("adoption"): on a bridge-ONLY restart — the bridge
died while CasparCG kept rendering — that CLEAR would land on the LIVE layer and take the graphic
OFF AIR before re-adding it as merely loaded. A restore SHALL therefore be **occupancy-aware**.

**A restore SHALL re-seat a producer ONLY for an item whose retained state says a producer belongs
on its layer.** An item retained as deliberately CLEARed, or as FAILED, SHALL NOT have a producer
re-seated onto its layer under any occupancy verdict — its row is restored, and its layer is left
exactly as it is. Occupancy SHALL NOT be consulted for such an item at all: silence on a layer the
operator emptied is the EXPECTED reading, not evidence that a producer was lost.

Because the occupancy tap only populates once the fresh session reaches `healthy` and OSC is
flowing, the adopt-vs-re-ADD decision for a restorable item SHALL be taken at the moment occupancy
is knowable — at the session's transition INTO `healthy` (the same drained-occupancy point the
CasparCG-link-loss reconcile of [[B-086]] samples), or immediately when the intent is restored onto
an already-healthy session whose tap is already warm. Until that decision is taken the restored item
SHALL simply sit on the stack with nothing sent for it.

For each RESTORABLE item, consulting the observed occupancy of its layer (silence means unoccupied —
real CasparCG goes silent for a cleared layer rather than reporting `empty`):

- **Occupied layer** → the bridge SHALL ADOPT THE LAYER WITHOUT CLEARING IT: it marks the layer
  adopted so no later adoption can clear it, and sends NOTHING. The resumed OSC re-derives the
  item's real air state on its own — a still-playing graphic reads ON AIR again and is never
  interrupted.
- **Silent layer** → the producer is gone, so the bridge SHALL re-ADD the item as `loaded` with the
  ordinary `CG ADD` (carrying its retained fields and position) and SHALL NOT precede it with an
  adopt-CLEAR.

No restore path SHALL emit a layer CLEAR, and no restore path SHALL emit a channel-level CLEAR. The
adopt-CLEAR of the ORDINARY load path is unchanged — only the restore path adopts without clearing,
and only for a layer OBSERVED occupied.

**A restore SHALL report what it did NOT restore, per item and with a reason**, and the caller SHALL
NOT be able to discard that report by accident: a bare count is not sufficient, because the operator
needs to know WHICH rows are gone and WHY. The reason SHALL distinguish the benign case — an item
the live bridge already holds, which loses no row — from the cases where a row the operator was
looking at has genuinely disappeared.

#### Scenario: A bridge-only restart keeps the graphic on air, with no flash

- **GIVEN** an item was ON AIR and the bridge process is restarted while CasparCG keeps rendering it
- **WHEN** the retained item is restored and its layer is observed occupied
- **THEN** NO CLEAR is issued for that layer and the item reads ON AIR again from resumed OSC

#### Scenario: A bridge + CasparCG restart returns the items as loaded

- **GIVEN** an item was ON AIR and BOTH the bridge and CasparCG are restarted, so the layers are
  empty
- **WHEN** the retained item is restored and its layer is observed silent
- **THEN** the item is re-ADDed onto the empty layer and rests at `loaded` — not a resurrected
  ON AIR claim

#### Scenario: A deliberately cleared graphic is NOT put back on its layer

- **GIVEN** the operator took a graphic off air with CLEAR, keeping its row on the stack, and the
  bridge process is then restarted
- **WHEN** the retained item is restored and its layer is silent
- **THEN** NO `CG ADD` is issued for that layer — the silence is not read as a lost producer
- **AND** the row comes back on the stack in its known-empty state, off air, until the operator
  re-takes it

#### Scenario: A failed row is not repaired by a restart

- **GIVEN** an item whose last operation failed
- **WHEN** the bridge is restarted and the item is restored
- **THEN** no producer is re-seated for it and no command is sent for it
- **AND** it is published as failed rather than as loaded

#### Scenario: Observed occupancy suppresses the adopt-CLEAR

- **WHEN** a layer is reported occupied by the occupancy tap at restore time
- **THEN** the adopt-CLEAR for that layer is suppressed for the restored item

#### Scenario: The restore sends nothing while no server is reachable

- **WHEN** retained intent is restored while no declared CasparCG server is reachable
- **THEN** the items appear on the stack and no AMCP command is sent for them, and the on-air verbs
  stay refused (R-006)

#### Scenario: Rows the restore could not re-seat are surfaced, with the reason

- **WHEN** a restore skips items that were on the operator's stack and are now gone — their
  template is no longer registered, or no layer could be obtained
- **THEN** the operator is told, in a surface on the layers list, how many rows did not come back
  and why

#### Scenario: The benign skip raises no alarm

- **WHEN** a restore skips ONLY items the live bridge already holds — a page reload against a
  healthy bridge, which loses no row
- **THEN** nothing is surfaced to the operator
