# runtime-live-source-routing — delta (C-015 design phase, 2026-08-03)

Encodes the Runtime/bridge half: the installation's live sources and the per-plate assignments, the
declared ownership class, the AMCP verbs, the geometry and the audio rule. Two decisions are the
owner's and are recorded as open questions in `design.md` §12.

⚠ **RESHAPED 2026-08-10 (owner, `design.md` §2z / §2d).** The single store keyed by a template's
declared id is replaced by TWO independent stores — a NAMED catalog the installation builds with no
reference to any template, and per-template, per-plate ASSIGNMENTS joining them — and the binding
surface moved from the sources modal to the Inspector. The requirements below are written in those
terms.

## ADDED Requirements

### Requirement: The installation DEFINES its live sources, and an absent catalog fails CLOSED

The bridge SHALL persist an installation-level **CATALOG** of live sources, built with **no
reference to any template**: each entry carries an **installation-generated id**, a **human NAME**
the operator chose, and a concrete producer expressed as a discriminated union over `route` /
`decklink` / `ndi` / `media`, so an unreachable producer form is refused at the boundary rather than
at take time.

Each entry SHALL carry the source's **signal FORMAT**, and MAY carry a fill/key **DEVICE PAIR** on
the arm where such a pair can physically exist. The scene declares neither: how a source arrives at
a plant is an installation fact.

The NAME SHALL be required and unique within the catalog. It is the only handle the operator ever
sees when binding a plate, so an entry without one cannot be chosen and two entries sharing one
leave the operator choosing blind.

A generated id SHALL NEVER be reused. A retired source's id re-issued to a new entry would let a
stale reference re-bind silently to a source nobody chose.

The catalog SHALL be **product-writable** through an IPC channel and editable by the operator in a
Runtime settings surface. It SHALL NOT be stored in the bridge's templates directory, because the
template registry reads every JSON file there as a template.

An **ABSENT** catalog file SHALL mean **NO SOURCES**. There SHALL be no built-in default: a default
layer bank is a guess about our own numbering, whereas a default input definition is a guess about
hardware this project cannot see, and a wrong guess puts the wrong source on air. A file that is
PRESENT but unusable SHALL be a HARD startup failure, before the socket accepts clients.

#### Scenario: An absent catalog reaches nothing to air

- **WHEN** the bridge starts with no catalog file **THEN** it starts normally with zero sources
- **WHEN** an item whose template declares a live plate is then taken **THEN** the take is refused
  with a distinct errorCode naming the plate — never a silent empty hole on air

#### Scenario: A present but unusable catalog refuses to boot

- **WHEN** the catalog file exists but is unreadable, malformed or schema-invalid **THEN** startup
  fails with an error naming the file and the reason, and no client is ever served

#### Scenario: The operator defines a source and the change is durable

- **WHEN** the operator names a source and gives it a producer **THEN** the bridge validates and
  persists it, and refuses illegibly-shaped input with a reason naming what was wrong
- **WHEN** a second source is given a name the catalog already holds **THEN** it is refused, because
  the name is the only handle the assignment picker shows
- **WHEN** the bridge restarts **THEN** the catalog is still in force
- **WHEN** the connected bridge is an older build than the page **THEN** the surface says so
  specifically rather than reporting a generic failure

#### Scenario: A refusal never shows a wire identifier

- **WHEN** any live-source call is refused — by the validator, or by the bridge's own frame
  validation against a build whose channel shape differs — **THEN** the operator is shown a sentence
  about what to do, never an IPC channel name and never a bare reason code
- **WHEN** a new validator reason code is added **THEN** the operator sentence for it is derived from
  the same wire constant the code comes from, so the two cannot drift

#### Scenario: One source can resolve to a fill/key device pair

- **WHEN** an installation defines a source as a fill/key pair **THEN** it is expressed on the
  CATALOG ENTRY and every template that uses it is unchanged
- **WHEN** the same template is used at a plant where that source is a single device **THEN** it
  needs no edit

#### Scenario: The catalog's provenance is visible at boot

- **WHEN** the bridge starts **THEN** it prints which catalog is in force and where it came from, so
  two machines running different source lists cannot disagree silently

### Requirement: A template's plate is ASSIGNED a source, once per template

A template's declared source id SHALL be read as a **PLATE IDENTIFIER** — it names a hole in that
template and nothing outside it — and SHALL NOT be matched against the installation's source list by
name. A name match silently requires the AUTHOR to guess the installation's naming convention, which
the Designer cannot know.

The bridge SHALL therefore persist a second store of **ASSIGNMENTS** — template, plate, source —
beside its template registry, because the bridge is what resolves a plate to a producer at take. An
assignment held per browser would mean the console that made it is the only console that can take
the item.

The assignment SHALL be **TEMPLATE-LEVEL**: it is the default for every use of that template, and
the surface SHALL SAY SO where the operator makes it rather than in a tooltip. A per-run override of
one plate on one on-air item is a separate capability layered on top, and that override SHALL NOT
write back to this assignment — an emergency substitution must never silently become the permanent
configuration.

The binding control SHALL STAGE an unapplied draft rather than write on change, through the SAME
draft mechanism every other control on that surface uses — the same state, the same dirty marking,
the same discard, and the same apply. Because the assignment is shared by every row carrying the
template, a control that wrote on change would let one stray action change what those rows do with
no moment to notice and nothing to undo: the draft IS the confirmation step. Every protection that
already guards an unapplied edit — surviving a selection change, surviving a panel round-trip, and a
prune that refuses to act on a stack state it cannot confirm — SHALL guard this draft identically.

The surface SHALL state WHEN an applied change takes effect: an assignment is read at the TAKE and
never re-composites the graphic already on the channel.

The binding surface SHALL be shown with the SELECTED TEMPLATE, not as a global list of every plate
in the station. A template that is not on a row cannot be bound, which is accepted: every template
that will be used is on a declared row, and a take of an unassigned plate refuses anyway.

An **ABSENT** assignments file SHALL mean **NOTHING ASSIGNED**; a PRESENT but unusable one SHALL be
a HARD startup failure, as for the catalog. An assignment naming a source the catalog does not
define SHALL be REFUSED at change and PRUNED, loudly, at load — a file that will not parse has no
reading at all, while a dangling reference has a clear one: that plate is unassigned.

One source MAY be assigned to two plates at once. That means two producers reading one input, which
is unremarkable for a routed source and MAY be refused by a capture device; until it is measured, no
surface SHALL present it as guaranteed.

#### Scenario: A freshly imported template has every plate unassigned

- **WHEN** a template declaring live plates is imported **THEN** every one of its plates is
  unassigned, which is the ordinary state and not an error
- **WHEN** the operator looks at that template's row **THEN** it NAMES which plates still need a
  source, rather than reporting only a count
- **WHEN** the item is taken **THEN** the take is refused with a distinct errorCode naming the plate

#### Scenario: A plate edit is staged, and Update is what writes it

- **WHEN** the operator changes a plate's source **THEN** nothing is written: the edit is a staged
  draft, the control and the panel both mark it unapplied, and the surface states that it takes
  effect at the next take
- **WHEN** the operator discards **THEN** the plate returns to the assignment in force, from the same
  action that discards the staged fields
- **WHEN** the operator applies **THEN** the assignment is written alongside the item's field update,
  as one operator action
- **WHEN** the selection changes, or the panel is closed and reopened, with a plate edit unapplied
  **THEN** the draft survives, exactly as a staged field does

#### Scenario: The assignment is made once and holds for every row using that template

- **WHEN** the operator APPLIES a plate binding from one row **THEN** a different row carrying the
  same template resolves that plate to the same source
- **WHEN** the binding surface is shown **THEN** it states that the setting is the template's, not
  the row's

#### Scenario: A template with no live plates offers no binding surface

- **WHEN** a template that declares no live plate is selected **THEN** no plate-binding section is
  shown at all

#### Scenario: Deleting a source in use cascades, and says so at the moment of deletion

- **WHEN** the operator removes a source that plates are assigned to **THEN** the removal is
  ALLOWED, and the surface names the templates and plates that referenced it
- **WHEN** those plates are next inspected **THEN** they read as needing a source, and no assignment
  anywhere points at a source that no longer exists
- **WHEN** one of those items is taken **THEN** the take is refused for that reason

The assignments of a template SHALL be OWNED BY ITS LIBRARY ENTRY. Deleting the entry from the
station SHALL delete them, once the removal is confirmed and never when it is refused. Re-importing
the same template SHALL KEEP them — an author fixing something and re-exporting must not cost the
operator every binding — and the surface SHALL SAY they were carried over, because the operator did
nothing to produce them. An assignment for a plate id the re-imported version no longer declares
SHALL be DROPPED: a dangling record can later match a plate it was never meant for.

A refusal from the surface that deletes a library entry SHALL reach the operator IN THAT SURFACE.
A reason rendered behind the dialog that produced it is not a reason the operator has been given.

#### Scenario: Deleting a library entry takes its bindings with it

- **WHEN** the operator deletes a template from the station **THEN** its plate bindings are deleted
  with it, and no other template's bindings are touched
- **WHEN** the deletion is REFUSED **THEN** the bindings are left exactly as they were, and the
  reason is shown in the surface that refused it
- **WHEN** a ROW holding the template is cleared **THEN** the library entry and its bindings are
  unaffected

#### Scenario: A re-import keeps the bindings, says so, and drops what no longer exists

- **WHEN** the same template is imported again **THEN** its bindings survive and the surface states
  that they were carried over from the previous import
- **WHEN** the re-imported version no longer declares a plate **THEN** that plate's binding is
  dropped and the operator is told
- **WHEN** the re-imported version declares a plate the previous one did not **THEN** that plate
  reads as unassigned

#### Scenario: A dangling assignment at boot is pruned, not fatal

- **WHEN** the assignments file names a source the catalog does not define **THEN** the bridge starts,
  drops that assignment, and names it on its boot line
- **WHEN** a client sends such an assignment **THEN** it is REFUSED, because the product's own
  surface cannot produce one

#### Scenario: Two templates with the same display name are told apart

- **WHEN** two imported templates resolve to the same display name **THEN** the operator surface
  distinguishes them, so a binding is never made against the wrong one
- **WHEN** a template's name is unambiguous **THEN** no disambiguator is shown

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

- **WHEN** a Live Source's plate id is dynamic and the operator changes its value **THEN** that
  layer's producer is swapped in place, and neither the template's layer nor any other Live Source is
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

The fit SHALL be driven by the INSTALLATION's statement of what the ASSIGNED source delivers,
because a crop discards picture and must be computed from what the source actually is. The element's
declared aspect is an AUTHOR'S ASSERTION to validate against, not the fit input; where the assigned
source states no aspect the declared aspect MAY be used as the assumed source aspect.

WHEN the element's declared aspect and the assigned source's aspect disagree, the take SHALL be
refused with a distinct errorCode rather than silently cropping something the author did not
anticipate.

The scaled rect and the mask rect SHALL be emitted as a PAIR, computed together. They are expressed
in the SAME channel-normalized space and the mask does NOT travel with the scaled rect, so they are
not independently settable: a scaled rect that moves out from under its mask renders NOTHING, which
on air is a black region where a source should be. No caller SHALL be able to set one without the
other.

The aspect driving the fit SHALL be **DERIVED** from the assigned source's declared format rather
than typed as a number, falling back — in order — to that source's explicit aspect where the format
yields none, then to the element's `expectedAspect`. A hand-entered aspect is a value that can be
wrong on air while looking reasonable.

`expectedAspect` SHALL remain the AUTHOR'S ASSERTION that the bridge validates the assigned source
against; its appearance at the end of the fit chain is a fallback for an undescribed source, never a
promotion to fit input.

#### Scenario: The fit aspect comes from the assigned source's format

- **WHEN** the assigned source declares a format that determines a raster **THEN** the crop-to-fill
  uses the aspect derived from it, and no aspect is typed by hand
- **WHEN** the format determines no raster **THEN** that source's explicit aspect is used, and only
  then the element's `expectedAspect`

#### Scenario: A 4:3 source fills a 16:9 window without distortion

- **WHEN** a 4:3 source is mapped to a 16:9 Live Source **THEN** the picture fills the window edge to
  edge with its proportions intact, and the parts that do not fit are clipped
- **WHEN** the window is inspected **THEN** no bars appear inside it

#### Scenario: A declared aspect that contradicts the installation refuses the take

- **WHEN** an element declares one aspect and its assigned source states another **THEN** the take is
  refused with an errorCode naming the element and both aspects

#### Scenario: An undescribed source still plays

- **WHEN** the assigned source states no aspect **THEN** the fit uses the element's declared aspect,
  and the source still reaches air

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

The swap SHALL be a **PER-ITEM OVERRIDE**, never an edit to the template's ASSIGNMENT and never an
edit to the installation's catalog. The assignment is the TEMPLATE-LEVEL DEFAULT — it is shared by
every row carrying that template — and the catalog is installation-wide; editing either changes
other work and persists, both wrong for a temporary emergency substitution. The configured values
SHALL be untouched and only this run SHALL change — the same shape as the existing position
override. The override SHALL NOT write back: an emergency substitution must never silently become
the permanent configuration.

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

- **WHEN** a plate is swapped **THEN** the template's assignment and the installation's catalog are
  both unchanged, and every other row carrying that template is unaffected
- **WHEN** the bridge restarts **THEN** the swapped plate is still pointed at the substituted source

### Requirement: Every producer the bridge creates is created MUTED

Every producer the bridge creates SHALL be created muted, and audio SHALL be raised only by an
explicit recorded intent naming the layer. A live source carries the source's live audio, and a
producer started for pre-roll is on the channel before the take.

The mute SHALL be part of creation — issued with the producer, before the layer can be composited —
rather than a follow-up step that can fail independently.

The bridge SHALL record an intended volume per owned layer, rather than relying on a single global
constant, so a Live Source layer can be muted and restored without depending on an operator row.

**The RAISE half SHALL have an operator surface, ON THE ROW.** Audio raised only by an explicit
recorded intent is a rule with two halves, and a rule whose second half nothing can express leaves
every live plate permanently silent. The control SHALL be reachable from the row itself, beside the
plate's source affordance, and SHALL be usable on a row that is not yet on air — arming a plate's
audio before the take is what stops the operator chasing a silent guest afterwards.

**The intent SHALL be per PLATE and SHALL SURVIVE what the producer does not.** It SHALL outlive a
teardown, a re-take, an on-air source swap and a bridge restart, which means it SHALL NOT be stored
only in the bridge's in-process ledger. An explicit volume of ZERO SHALL be recorded as a chosen
value and SHALL NOT be treated as "no intent recorded": the two states are different, only one was
chosen, and a plate deliberately silenced SHALL NOT be re-raised by a swap.

#### Scenario: A guest can be made audible, and stays audible

- **WHEN** the operator raises a plate's audio from the row **THEN** that layer's volume is set on
  the wire and no other plate is affected
- **WHEN** the item is cleared and taken again **THEN** the plate is still audible
- **WHEN** the bridge restarts and the row is restored **THEN** the plate is still audible

#### Scenario: A deliberately silenced plate stays silent

- **WHEN** the operator mutes a plate and then swaps its source **THEN** the new producer is silent,
  because the recorded intent is zero rather than absent

#### Scenario: A pre-rolled live box is silent

- **WHEN** Live Source producers are started ahead of the template's take **THEN** none of them is
  audible before the take

#### Scenario: No blanket unmute reaches a Live Source layer

- **WHEN** the bridge re-asserts intended volumes across its declared operator range **THEN** no
  Live Source layer is unmuted as a side effect
