## ADDED Requirements

### Requirement: Layer-addressed Clear settles the affected row after primary acknowledgement

When the current primary acknowledges a bank or orphan Clear, the Bridge SHALL retire any
eligible row's cached producer on that exact coordinate, settle it to idle and publish the
result. The row SHALL keep its binding and late OSC for the erased producer SHALL NOT restore
its on-air claim. A newer row intent or an acknowledgement from only the backup SHALL NOT
cause this reconciliation. Both commands SHALL retain their existing dispatch guards.

#### Scenario: A Clear acknowledgement precedes the last producer frame

- **WHEN** the current primary acknowledges the layer-addressed Clear of a bound row, or a row
  adopts the orphan while its Clear is pending **THEN** the Bridge publishes idle for that row
  even if the engine reports one final producer frame before it erases the layer.

## MODIFIED Requirements

### Requirement: Orphaned layer occupancy is swept, surfaced, and operator-clearable

The bridge SHALL periodically compare server-side layer occupancy against the
layers it owns and surface every mismatch as an orphan: a layer whose
foreground producer is non-empty on the CURRENT PRIMARY, observed fresh, and
whose (channel, layer) is not owned by the bridge (not a reserved slot).
Occupancy SHALL be sourced from a passive tap on the already-parsed OSC
producer stream — upstream of the interest filter, adding no events to the
OSC pipeline and no AMCP traffic — so the interest set, rate limiter, and
change tracker (the B-044 firehose protections) remain untouched. (CORRECTED
by `RELEASE-091-01`: AMCP `INFO <channel>` on 2.5.0 DOES carry per-layer
stage data — `<stage><layer><layer_N>` — measured on the plant's core; the
ordinary orphan sweep uses OSC alone.)

For a route observation immediately following acknowledged Clear of a Bridge-owned native preset
artwork route, the Bridge MAY read the affected channel stage to verify occupancy. An empty seat
confirmed on the same session SHALL exclude that OSC observation from the orphan notice. A
producer present on the seat or an uncertain stage reading SHALL go through normal debounce after
the scoped check. Later observations SHALL be evaluated on their own evidence. The verification
SHALL only affect the notice.

The sweep SHALL run on a bounded periodic cadence, query only the current
primary (following it across failover and reconfiguration), and skip while
the primary session is not healthy — existing warnings freeze rather than
falsely resolve while disconnected. Surfacing SHALL be debounced (an orphan
appears after consecutive sightings; it resolves on the first sweep that
observes the layer empty or no longer reported) and published only when the
orphan set changes. The sweep timer SHALL be disposed with the runtime.

The orphan set SHALL be pullable (`layers.orphans`) and pushed on change
(`layers.orphans-changed`), each orphan carrying the observed producer kind.

A `layers.clear` request SHALL send an urgent `CLEAR <channel>-<layer>` ONLY
for a layer whose foreground producer the current primary's occupancy tap has
OBSERVED FRESH, and ONLY when that producer is `html` or the layer lies inside
the three bands (50–99, `inAnyLayerBand`). Inside them any producer may be this
system's own or one another station left there — plates are `ffmpeg`, `route`,
`ndi` or `decklink`, never `html` — so the owner narrowed R-015 there
(`RELEASE-091-01` DELTA B, B3, `B-292`). A request below 50 is refused as a
request, before any gate (`FOLLOWUPS-01` B). It SHALL refuse, sending nothing:

- `reason: 'owned'` — any layer a stack item holds (clearing owned layers is
  Out/Remove's job), refused before any occupancy check; a declared playout
  layer is refused `reserved`, and a plate this bridge's ledger holds
  `live-source`, as their own requirements say;
- `reason: 'foreign'` — any layer above the bands whose fresh observation
  reports a non-`html` producer kind, any unrecognised kind there ("not html"
  fails safe), and any layer with NO fresh observation at all (silence is
  evidence of nothing and cannot license a CLEAR — including the B-094
  AMCP-alive/OSC-dead install and entries aged past the staleness bound).

The bridge SHALL never touch slots or interest it does not own; a CLEAR
executed on the current primary counts as layer adoption. It SHALL never send
a channel-wide `CLEAR`. The warning resolves only on the next sweep's observed
empty — never optimistically, and the bridge SHALL NEVER clear a layer without
an explicit operator request.

#### Scenario: A foreign producer surfaces within the sweep cadence

- **WHEN** a producer exists on a layer the bridge does not own (e.g. left by
  a dead bridge session) and the primary session is healthy **THEN** within
  two sweep cycles the layer is surfaced as an orphan, named by
  channel-layer with its observed producer kind, and published to connected
  clients

#### Scenario: Late OSC from retired native preset artwork does not surface

- **WHEN** a delayed OSC route observation follows acknowledged cleanup of Bridge-owned preset
  artwork and the same engine's stage has no producer on that seat **THEN** that observation does
  not raise an orphan notice
- **WHEN** a producer uses the same seat after that cleanup **THEN** the normal orphan debounce
  still reports it if it is unclaimed

#### Scenario: Owned layers never surface; idle is quiet

- **WHEN** every non-empty layer maps to a bridge-owned slot **THEN** no
  orphan is surfaced and nothing is published (no idle noise, no per-tick
  logging)

#### Scenario: Operator Clear of an html orphan resolves on observed empty

- **WHEN** the operator invokes `layers.clear` on a surfaced layer whose
  fresh observation reports an `html` producer **THEN** the bridge sends
  `CLEAR <ch>-<layer>` (urgent) and the warning resolves on the next sweep
  that observes the layer empty or gone silent
- **WHEN** `layers.clear` names a layer the bridge owns **THEN** the request
  is refused with `reason: 'owned'` and nothing is sent

#### Scenario: A layer left in our band can be cleared

- **WHEN** `layers.clear` names layer 70 carrying an `ffmpeg` producer that no
  ledger record holds **THEN** the bridge sends `CLEAR <ch>-70` and the
  warning resolves on observed empty
- **WHEN** it names a plate layer this bridge's ledger holds **THEN** it is
  refused `live-source` and nothing is sent (the control)

#### Scenario: Outside the bands a video can never be cleared

- **WHEN** `layers.clear` names layer 120 whose fresh observation reports a
  non-`html` producer **THEN** the request is refused with `reason: 'foreign'`
  and NO `CLEAR` reaches the wire
- **WHEN** it names a layer below 50 **THEN** it is refused as a request and
  nothing is sent
- **WHEN** `layers.clear` names a layer the occupancy tap has NO fresh
  observation for (never observed, aged out, or the tap is blind) **THEN**
  it is refused with `reason: 'foreign'` and nothing is sent

#### Scenario: The sweep follows the primary and freezes when it is down

- **WHEN** a failover or runtime reconfiguration switches the primary
  **THEN** subsequent sweeps read the new primary's occupancy
- **WHEN** the primary session is not healthy **THEN** the sweep skips and
  previously surfaced warnings persist unchanged (absence of knowledge never
  resolves a warning)
