# runtime-caspar-bridge (B-056 — owned-slot occupancy warning)

## ADDED Requirements

### Requirement: Owned-slot occupancy raises a warning when adoption misses the primary

The bridge SHALL raise an owned-slot occupancy warning — identifying the
channel, layer, and item — when a load's adopt-CLEAR does NOT land on the
current primary (backup-only success, or a failed CLEAR — the layer stays
unadopted) AND the current primary session's passive OSC occupancy tap
reports the target (channel, layer) as non-empty within the R-009 freshness
window, sampled at load time BEFORE the item's own `CG ADD` is sent. The
load itself SHALL proceed exactly as without the warning: same acceptance,
same slot binding and OSC interest, same `CG ADD` — the warning is purely
additive. Unknown occupancy SHALL NOT warn: when the primary's occupancy is
unobservable (its OSC silent or stale), no warning is raised — observed
occupancy only.

The warning set SHALL be pullable (`layers.owned-occupancy`) and pushed on
change only (`layers.owned-occupancy-changed`). R-009's orphan channels,
sweep, debounce, and `layers.clear` owned-refusal are unchanged by this
requirement.

A warning SHALL resolve ONLY on provable events, never optimistically, and
the bridge SHALL NEVER auto-clear the layer:

- a bridge-issued `CLEAR` for that (channel, layer) lands on the current
  primary (`ok && onPrimary` — the adopt-CLEAR, out, remove, or an operator
  `layers.clear`), or
- the item is removed / the layer deallocated — the layer becomes unowned
  and the R-009 sweep owns surfacing whatever remains there, or
- a runtime reconfiguration (`setConfig`) swaps the server pair — warnings
  described the old primary and are dropped wholesale.

A take SHALL NOT resolve a warning (a take may `CG PLAY` the surviving
orphan on the primary once it reconnects), and a failover SHALL NOT resolve
one (a later fail-back would make the orphan live again with no
re-detection).

#### Scenario: Backup-only adopt with observed foreign occupancy warns; the load is unchanged

- **WHEN** a mirror pair's current primary has its AMCP link down (no
  failover), a previous session's producer is still reported non-empty and
  fresh by the primary's OSC occupancy tap for a layer, and a load
  allocates that layer — its adopt-CLEAR succeeding backup-only —
  **THEN** an owned-slot occupancy warning naming that channel-layer and
  the item is raised and published
- **AND** the load still proceeds unchanged: it is accepted, the slot stays
  bound to the item, and the item's own `CG ADD` is still sent

#### Scenario: Unknown occupancy does not warn

- **WHEN** the adopt-CLEAR misses the primary but the primary's occupancy
  tap has no fresh entry for the target layer (OSC silent, stale, or never
  received) **THEN** no owned-slot occupancy warning is raised — the load
  proceeds with no warning

#### Scenario: A CLEAR landing on the primary resolves the warning

- **WHEN** a warned item is taken out while the primary is still
  unreachable (the CLEAR lands backup-only) **THEN** the warning persists
- **AND WHEN** the primary's AMCP link recovers and a later out/remove
  CLEAR for that layer executes on the current primary **THEN** the warning
  resolves and the resolution is published

#### Scenario: Removing the item resolves and hands the layer to R-009

- **WHEN** a warned item is removed (directly or via Remove-All) — even
  while the primary is still unreachable — **THEN** the warning resolves
  (the layer is deallocated and unowned; the R-009 sweep surfaces any
  surviving producer as a regular orphan once the primary is observable)

#### Scenario: A take does not resolve the warning

- **WHEN** a warned item is taken **THEN** the warning persists unchanged

#### Scenario: Reconfiguration drops old-server warnings

- **WHEN** `setConfig` applies a new server pair while owned-slot warnings
  are surfaced **THEN** the warning set empties (published once) — the
  warnings described the old primary
