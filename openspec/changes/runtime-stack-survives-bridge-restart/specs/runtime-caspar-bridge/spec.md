# runtime-caspar-bridge Specification (delta)

## ADDED Requirements

### Requirement: The browser retains stack intent and restores it on reconnect

Stack items MUST survive a restart of the bridge process. The stack SHALL NOT live only in the
bridge's memory: the browser SHALL retain the operator's stack INTENT — for each item its id,
template id, current field values, play evidence (whether it had been taken to air), the slot it
occupied, and any position override, in stack order — in a **persistent, browser-local** store
(the same file-backed ownership model [[B-085]] gave the template library), so the intent survives
both the bridge's death and a page reload.

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
NOTHING to CasparCG at that moment.

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

Rows served from local intent while the bridge is down MUST be honest about what cannot be verified.
A row whose retained intent records that it had been taken to air SHALL render in the muted
UNVERIFIABLE state ("was on air, cannot confirm now") and SHALL NOT render a confident on-air claim
— with no bridge the SPA has no conduit to CasparCG at all. A row that had not been taken SHALL
render as a non-air-claiming resting state. No such row SHALL be shown as pending.

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

Because the occupancy tap only populates once the fresh session reaches `healthy` and OSC is
flowing, the adopt-vs-re-ADD decision for a restored item SHALL be taken at the moment occupancy is
knowable — at the session's transition INTO `healthy` (the same drained-occupancy point the
CasparCG-link-loss reconcile of [[B-086]] samples), or immediately when the intent is restored onto
an already-healthy session whose tap is already warm. Until that decision is taken the restored item
SHALL simply sit on the stack with nothing sent for it.

For each restored item, consulting the observed occupancy of its layer (silence means unoccupied —
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

#### Scenario: Observed occupancy suppresses the adopt-CLEAR

- **WHEN** a layer is reported occupied by the occupancy tap at restore time
- **THEN** the adopt-CLEAR for that layer is suppressed for the restored item

#### Scenario: The restore sends nothing while no server is reachable

- **WHEN** retained intent is restored while no declared CasparCG server is reachable
- **THEN** the items appear on the stack and no AMCP command is sent for them, and the on-air verbs
  stay refused (R-006)
