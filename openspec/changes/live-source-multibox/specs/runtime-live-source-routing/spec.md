# runtime-live-source-routing — delta (C-015 design phase, 2026-08-03)

Encodes the Runtime/bridge half: the installation mapping, the declared ownership class, the AMCP
verbs, the geometry and the audio rule. Implementation is a later PR — see this change's `tasks.md`
§0. Two decisions are the owner's and are recorded as open questions in `design.md` §12.

## ADDED Requirements

### Requirement: The installation maps a source id to a concrete producer, and an absent mapping fails CLOSED

The bridge SHALL persist an installation-level mapping from a symbolic source id to a concrete
producer, expressed as a discriminated union over `route` / `decklink` / `ndi` / `media` so an
unreachable producer form is refused at the boundary rather than at take time.

Each mapping entry SHALL carry the source's **signal FORMAT**, and MAY carry a fill/key **DEVICE
PAIR** on the arm where such a pair can physically exist. The scene declares one symbolic id and
never states either: how a source arrives at a plant is an installation fact.

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

#### Scenario: One id can resolve to a fill/key device pair

- **WHEN** an installation configures a source id as a fill/key pair **THEN** it is expressed on the
  MAPPING and the template that names the id is unchanged
- **WHEN** the same template is used at a plant where that source is a single device **THEN** it
  needs no edit

#### Scenario: The mapping's provenance is visible at boot

- **WHEN** the bridge starts **THEN** it prints which mapping is in force and where it came from, so
  two machines running different mappings cannot disagree silently

### Requirement: A template CARRIES its Live Source declaration, and an absent carrier is UNKNOWN

The import path SHALL derive the template's Live Source declaration at the one moment it holds the
unpacked scene, and carry it on the template's registry metadata alongside the scene's **resolution**
and its **resolved authored default position**. No `.vcg` reaches the bridge, the bridge parses no
HTML, and the scene is discarded after import, so a fact not captured there is not recoverable.

The carried default position SHALL be present whenever the carrier is — never optional within it.
The bridge appends an operator's position override to the served URL only when one exists, so with
no override the page falls back to the authored default; a bridge that assumed centred would place
the composited source against a different origin from the hole it must sit behind.

The carrier SHALL be emitted for EVERY import, including a template with no Live Source, which
carries an EMPTY declaration list. An **absent** carrier SHALL therefore mean **UNKNOWN** — the
template was imported before the carrier existed — and SHALL NOT be read as "no Live Sources". The
operator-facing template list SHALL say so on the affected row.

#### Scenario: The declaration is derived once, at import

- **WHEN** a template is imported **THEN** its registry metadata carries the scene resolution, the
  resolved authored default position, and one declaration per Live Source
- **WHEN** the author set no position **THEN** the carried default is the centred fallback, never
  absent

#### Scenario: No Live Sources is a real answer, not a gap

- **WHEN** a template with no Live Source is imported **THEN** its carrier is present with an empty
  declaration list

#### Scenario: A template imported before the carrier existed says so

- **WHEN** a template holds no carrier at all **THEN** the template list marks that row as needing a
  re-import, rather than presenting it as having no Live Sources

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

### Requirement: Fill geometry reproduces the page's own placement chain, from ONE shared implementation

The composited rect SHALL be derived by reproducing the SAME transform chain the exported page
applies — the uniform output scale, the letterbox pad and the anchor translate — and then
normalizing PER AXIS against the channel raster. Normalizing the scene-pixel rect against the scene
resolution alone is INSUFFICIENT and SHALL NOT be used: it omits the scale and the pad, and lands the
picture in the wrong place on any channel whose raster is not the reference frame.

The position SHALL be resolved through the SAME three-step chain the page uses — operator override,
then the template's authored default position, then centred. The authored default SHALL therefore be
carried to the bridge, because the position query is appended only when an override exists.

The placement arithmetic SHALL have exactly ONE implementation, shared by the page and the bridge
rather than copied. Where the two sides cannot share code — one emits CSS, the other emits AMCP —
a contract test SHALL pin them to each other over a fixed set of scene, raster and rect
combinations, INCLUDING at least one non-16:9 raster, because on a 16:9 raster every scaling term
collapses to identity and a wrong implementation would pass.

The composited rect SHALL be clamped to the scene rect, because the template layer clips at that
boundary and the layer behind it does not.

#### Scenario: Placement is correct on a non-reference raster

- **WHEN** a scene smaller than the reference frame is placed on a channel whose raster is not 16:9
  **THEN** the composited source sits exactly behind its hole, accounting for the output scale and
  the letterbox pad

#### Scenario: An authored default position is honoured without an operator override

- **WHEN** a template declares a default position and the operator has set no override **THEN** the
  composited source sits behind its hole, in the position the page itself resolves

#### Scenario: The two implementations cannot silently diverge

- **WHEN** the placement arithmetic changes on either side **THEN** a contract test fails if the
  bridge and the page no longer place the same scene point at the same raster pixel
- **WHEN** that test runs **THEN** it exercises at least one raster whose aspect is not 16:9

#### Scenario: A hole partly outside the frame does not leak

- **WHEN** a hole extends past the scene rect **THEN** the composited source is clamped to the scene
  rect, matching what the template layer clips

### Requirement: A mismatched source is CROPPED to fill its window, never stretched and never barred

The fill command stretches, so a source whose aspect differs from its window SHALL be scaled to
COVER the window with its proportions intact and the overflow clipped away — crop-to-fill. A face
SHALL NOT go on air distorted, and SHALL NOT go on air with bars inside a frame the designer drew:
in a designed multi-box window, bars read as a fault rather than as an honest aspect.

The fit SHALL be driven by the INSTALLATION's statement of what the mapped source delivers, because
a crop discards picture and must be computed from what the source actually is. The element's
declared aspect is an AUTHOR'S ASSERTION to validate against, not the fit input; where the mapping
states no aspect the declared aspect MAY be used as the assumed source aspect.

WHEN the element's declared aspect and the mapping's aspect disagree, the take SHALL be refused with
a distinct errorCode rather than silently cropping something the author did not anticipate.

The scaled rect and the mask rect SHALL be emitted as a PAIR, computed together. They are expressed
in the SAME channel-normalized space and the mask does NOT travel with the scaled rect, so they are
not independently settable: a scaled rect that moves out from under its mask renders NOTHING, which
on air is a black region where a source should be. No caller SHALL be able to set one without the
other.

The aspect driving the fit SHALL be **DERIVED** from the mapping's declared format rather than
typed as a number, falling back — in order — to the mapping's explicit aspect where the format
yields none, then to the element's `expectedAspect`. A hand-entered aspect is a value that can be
wrong on air while looking reasonable.

`expectedAspect` SHALL remain the AUTHOR'S ASSERTION that the bridge validates the mapping against;
its appearance at the end of the fit chain is a fallback for an undescribed mapping, never a
promotion to fit input.

#### Scenario: The fit aspect comes from the mapping's format

- **WHEN** a mapping declares a format that determines a raster **THEN** the crop-to-fill uses the
  aspect derived from it, and no aspect is typed by hand
- **WHEN** the format determines no raster **THEN** the mapping's explicit aspect is used, and only
  then the element's `expectedAspect`

#### Scenario: A 4:3 source fills a 16:9 window without distortion

- **WHEN** a 4:3 source is mapped to a 16:9 Live Source **THEN** the picture fills the window edge to
  edge with its proportions intact, and the parts that do not fit are clipped
- **WHEN** the window is inspected **THEN** no bars appear inside it

#### Scenario: A declared aspect that contradicts the installation refuses the take

- **WHEN** an element declares one aspect and its mapping states another **THEN** the take is refused
  with an errorCode naming the element and both aspects

#### Scenario: An undescribed mapping still plays

- **WHEN** a mapping states no aspect **THEN** the fit uses the element's declared aspect, and the
  source still reaches air

#### Scenario: The scaled rect and the mask cannot be set apart

- **WHEN** a Live Source's geometry is applied **THEN** the scaled rect and the mask are emitted
  together from one computation
- **WHEN** either would be changed **THEN** both are recomputed, so the scaled rect can never end up
  outside its mask and render nothing

### Requirement: A plate's input can be swapped WHILE the template is on air

The operator SHALL be able to point ONE plate of an on-air template at a different source without
taking the graphic off air and without disturbing the other plates.

**R-048 — a CLIENT REQUIREMENT, not a preference.** The case is a three-plate template on air, one
input drops, and that plate goes black while the other two are fine.

The swap SHALL be a **PER-ITEM OVERRIDE**, never an edit to the installation mapping. A mapping is
installation-wide configuration: editing it changes every template using that id and it persists,
both wrong for a temporary emergency substitution. The configured value SHALL be untouched and only
this run SHALL change — the same shape as the existing position override.

The swap SHALL be a **REPLACE, never a clear-then-add**: the producer is substituted in place on the
occupied layer. A clear followed by a play that fails is a destructive step committed before the
constructive one was known to succeed. When the replace fails, the previous producer SHALL remain
and the row SHALL say so rather than reporting success.

The fit SHALL be re-derived for the new source as part of the SAME action, because the new source
may carry a different format. Audio intent SHALL survive the swap: a plate whose audio the operator
deliberately raised SHALL still be audible afterwards, since the intent belonged to the PLATE and
not to the producer instance. The override SHALL survive a bridge restart. The action SHALL be
reachable in one or two actions from the row.

#### Scenario: One plate is repointed while the graphic stays on air

- **WHEN** the operator swaps one plate's source on an on-air template **THEN** that layer's producer
  is replaced in place, the template's layer is untouched, and the other plates are undisturbed
- **WHEN** the replace fails **THEN** the previous producer remains and the row reports the failure

#### Scenario: The swap carries the fit and the audio with it

- **WHEN** the substituted source declares a different format **THEN** the crop-to-fill is
  re-derived in the same action, with no second operator step
- **WHEN** that plate's audio had been deliberately raised **THEN** it is audible after the swap

#### Scenario: The override is per-item and survives a restart

- **WHEN** a plate is swapped **THEN** the installation mapping is unchanged and every other template
  using that id is unaffected
- **WHEN** the bridge restarts **THEN** the swapped plate is still pointed at the substituted source

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
