# runtime-caspar-bridge — delta (protect video layers, R-015)

## MODIFIED Requirements

### Requirement: Orphaned layer occupancy is swept, surfaced, and operator-clearable

The bridge SHALL periodically compare server-side layer occupancy against the
layers it owns and surface every mismatch as an orphan: a layer whose
foreground producer is non-empty on the CURRENT PRIMARY, observed fresh, and
whose (channel, layer) is not owned by the bridge (not a reserved slot).
Occupancy SHALL be sourced from a passive tap on the already-parsed OSC
producer stream — upstream of the interest filter, adding no events to the
OSC pipeline and no AMCP traffic — so the interest set, rate limiter, and
change tracker (the B-044 firehose protections) remain untouched. (Verified
on CasparCG 2.5.0: AMCP `INFO` carries no per-layer data on the 2.3+
lineage; OSC is the only per-layer occupancy signal.)

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
OBSERVED FRESH as `html` — the one producer kind this system ever places, so
the one kind that can plausibly be this system's own orphaned graphic
(R-015). It SHALL refuse, sending nothing:

- `reason: 'owned'` — any layer the bridge owns (clearing owned layers is
  Out/Remove's job), refused before any occupancy check;
- `reason: 'foreign'` — any layer whose fresh observation reports a
  non-`html` producer kind (a video or other foreign producer is PROVABLY not
  ours), any unrecognised kind ("not html" fails safe — video kinds are never
  enumerated), and any layer with NO fresh observation at all (silence is
  evidence of nothing and cannot license a CLEAR — including the B-094
  AMCP-alive/OSC-dead install and entries aged past the staleness bound).

The bridge SHALL never touch slots or interest it does not own; a CLEAR
executed on the current primary counts as layer adoption. The warning
resolves only on the next sweep's observed empty — never optimistically, and
the bridge SHALL NEVER clear a layer without an explicit operator request.

#### Scenario: A foreign producer surfaces within the sweep cadence

- **WHEN** a producer exists on a layer the bridge does not own (e.g. left by
  a dead bridge session) and the primary session is healthy **THEN** within
  two sweep cycles the layer is surfaced as an orphan, named by
  channel-layer with its observed producer kind, and published to connected
  clients

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

#### Scenario: A video layer can never be cleared

- **WHEN** `layers.clear` names a layer whose fresh observation reports a
  non-`html` producer (e.g. `ffmpeg` — a video played by another system,
  regardless of layer number) **THEN** the request is refused with
  `reason: 'foreign'` and NO `CLEAR` reaches the wire
- **WHEN** `layers.clear` names a layer with an unrecognised producer kind
  **THEN** it is refused with `reason: 'foreign'` exactly as a video layer —
  "not html" fails safe, never an enumeration of video kinds
- **WHEN** `layers.clear` names a layer the occupancy tap has NO fresh
  observation for (never observed, aged out, or the tap is blind) **THEN**
  it is refused with `reason: 'foreign'` and nothing is sent

#### Scenario: The sweep follows the primary and freezes when it is down

- **WHEN** a failover or runtime reconfiguration switches the primary
  **THEN** subsequent sweeps read the new primary's occupancy
- **WHEN** the primary session is not healthy **THEN** the sweep skips and
  previously surfaced warnings persist unchanged (absence of knowledge never
  resolves a warning)
