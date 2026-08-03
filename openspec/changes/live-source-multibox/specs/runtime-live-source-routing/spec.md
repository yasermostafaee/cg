# runtime-live-source-routing — delta (C-015 design phase, 2026-08-03)

Encodes the Runtime/bridge half: the installation mapping, the declared ownership class, the AMCP
verbs, the geometry and the audio rule. Implementation is a later PR — see this change's `tasks.md`
§0. Two decisions are the owner's and are recorded as open questions in `design.md` §12.

## ADDED Requirements

### Requirement: The installation maps a source id to a concrete producer, and an absent mapping fails CLOSED

The bridge SHALL persist an installation-level mapping from a symbolic source id to a concrete
producer, expressed as a discriminated union over `route` / `decklink` / `ndi` / `media` so an
unreachable producer form is refused at the boundary rather than at take time.

The mapping SHALL be **product-writable** through an IPC channel and editable by the operator in a
Runtime settings surface. It SHALL NOT be stored in the bridge's templates directory, because the
template registry reads every JSON file there as a template.

An **ABSENT** mapping file SHALL mean **NO MAPPINGS**. There SHALL be no built-in default: a default
layer bank is a guess about our own numbering, whereas a default input mapping is a guess about
hardware this project cannot see, and a wrong guess puts the wrong source on air. A file that is
PRESENT but unusable SHALL be a HARD startup failure, before the socket accepts clients.

#### Scenario: An absent mapping file reaches nothing to air

- **WHEN** the bridge starts with no mapping file **THEN** it starts normally with zero mappings
- **WHEN** an item declaring a Live Source is then taken **THEN** the take is refused with a
  distinct errorCode naming the unmapped id — never a silent empty hole on air

#### Scenario: A present but unusable mapping file refuses to boot

- **WHEN** the mapping file exists but is unreadable, malformed or schema-invalid **THEN** startup
  fails with an error naming the file and the reason, and no client is ever served

#### Scenario: The operator edits the mapping and the change is durable

- **WHEN** the operator sets an id's producer in the settings surface **THEN** the bridge validates
  and persists it, and refuses illegibly-shaped input with a reason naming what was wrong
- **WHEN** the bridge restarts **THEN** the mapping is still in force
- **WHEN** the connected bridge predates this feature **THEN** the surface says so specifically
  rather than reporting a generic failure

#### Scenario: The mapping's provenance is visible at boot

- **WHEN** the bridge starts **THEN** it prints which mapping is in force and where it came from, so
  two machines running different mappings cannot disagree silently

### Requirement: Live Source layers are a DECLARED, bridge-owned ownership class

The bridge SHALL keep its own ledger of the layers it has placed Live Sources on. Ownership SHALL be
**declared in that ledger**, never inferred from the OSC producer kind — the feature deliberately
creates bridge-owned NON-html layers, which is precisely what a kind-based discriminator cannot see.

Live Source layers SHALL be declared as a range in install config, validated **disjoint** from the
fixed operator bank AND from the reserved playout range, at config load AND at every change.

A Live Source layer SHALL NOT be declared through the reserved-playout mechanism, which fences
layers AWAY from this bridge and would leave a Live Source layer unplaceable and unclearable.

Against the three existing gates:

- the orphan sweep SHALL NOT treat a ledger-held layer as a reclaim candidate;
- foreign quarantine SHALL skip a ledger-held layer BEFORE its producer-kind test;
- the operator-facing clear path SHALL refuse a ledger-held layer with a DISTINCT reason that names
  it as a Live Source — not as foreign, and not as owned — so the operator is told what it is.

Bridge teardown of its own Live Source layers is unaffected by that refusal.

#### Scenario: A live guest box is never offered for reclaim

- **WHEN** the bridge has placed a Live Source and the orphan sweep runs **THEN** that layer is not
  surfaced as an orphan
- **WHEN** foreign quarantine runs **THEN** that layer is not quarantined, despite reporting a
  non-html producer kind

#### Scenario: The operator is told what a Live Source layer is

- **WHEN** the operator tries to clear a Live Source layer **THEN** it is refused with a reason
  naming it as a Live Source layer
- **WHEN** the item owning it is stopped or cleared **THEN** the bridge clears its Live Source
  layers alongside it

#### Scenario: Overlapping range config is refused at load and at change

- **WHEN** the declared Live Source range intersects the fixed bank or the reserved range **THEN**
  startup fails with an error naming both ranges
- **WHEN** a later config change would create that overlap **THEN** it is refused the same way

#### Scenario: One item owns several layers

- **WHEN** a template declaring three Live Sources is taken **THEN** the bridge records three layers
  against that one item, and clears all three together

### Requirement: The bridge places live producers with layer-scoped commands only

The AMCP command seam SHALL gain the ability to start a mapped producer, to set its fill geometry,
and to reset that geometry on teardown.

Every one of these SHALL be addressed at `channel-layer`. A channel-scoped form SHALL NEVER be
emitted: a channel-level clear or mixer command reaches the program signal this application does not
manage. Mixer state survives a layer clear, so teardown SHALL explicitly reset it — otherwise a later
unrelated graphic inherits the geometry.

#### Scenario: Producers are started and torn down per layer

- **WHEN** an item declaring Live Sources is taken **THEN** each mapped producer is started on its
  own layer below the template's layer
- **WHEN** the item is cleared **THEN** each Live Source layer is cleared AND its mixer geometry is
  reset

#### Scenario: No channel-scoped command is ever emitted

- **WHEN** any Live Source command is built **THEN** it addresses a channel AND a layer, never a
  channel alone

#### Scenario: A dynamic id is retargeted without disturbing its neighbours

- **WHEN** a Live Source's id is dynamic and the operator changes its value **THEN** that layer's
  producer is swapped in place, and neither the template's layer nor any other Live Source is
  disturbed

### Requirement: Fill geometry reproduces the page's own placement chain, and never stretches the picture

The composited rect SHALL be derived by reproducing the SAME transform chain the exported page
applies — the uniform output scale, the letterbox pad and the anchor translate — and then
normalizing PER AXIS against the channel raster. Normalizing the scene-pixel rect against the scene
resolution alone is INSUFFICIENT and SHALL NOT be used: it omits the scale and the pad, and lands the
picture in the wrong place on any channel whose raster is not the reference frame.

Because the fill command STRETCHES rather than letterboxing, the declared aspect SHALL be fitted
inside the hole rect — centred, preserving aspect — so a source whose real aspect differs from the
authored hole is pillarboxed rather than distorted. A face SHALL NOT go on air stretched.

The composited rect SHALL be clamped to the scene rect, because the template layer clips at that
boundary and the layer behind it does not.

#### Scenario: Placement is correct on a non-reference raster

- **WHEN** a scene smaller than the reference frame is placed on a channel whose raster is not 16:9
  **THEN** the composited source sits exactly behind its hole, accounting for the output scale and
  the letterbox pad

#### Scenario: A mismatched source aspect is pillarboxed, not stretched

- **WHEN** a source's declared aspect differs from the hole's aspect **THEN** the picture is fitted
  inside the hole preserving its aspect, and the margin shows the channel background

#### Scenario: A hole partly outside the frame does not leak

- **WHEN** a hole extends past the scene rect **THEN** the composited source is clamped to the scene
  rect, matching what the template layer clips

### Requirement: Every producer the bridge creates is created MUTED

Every producer the bridge creates SHALL be created muted, and audio SHALL be raised only by an
explicit recorded intent naming the layer. A live source carries the source's live audio, and a
producer started for pre-roll is on the channel before the take.

The mute SHALL be part of creation — issued with the producer, before the layer can be composited —
rather than a follow-up step that can fail independently.

The bridge SHALL record an intended volume per owned layer, rather than relying on a single global
constant, so a Live Source layer can be muted and restored without depending on an operator row.

#### Scenario: A pre-rolled live box is silent

- **WHEN** Live Source producers are started ahead of the template's take **THEN** none of them is
  audible before the take

#### Scenario: No blanket unmute reaches a Live Source layer

- **WHEN** the bridge re-asserts intended volumes across its declared operator range **THEN** no
  Live Source layer is unmuted as a side effect
