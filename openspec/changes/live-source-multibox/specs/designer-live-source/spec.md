# designer-live-source — delta (D-137 design phase, 2026-08-03)

Encodes the Designer half of the Live Source multi-box feature: the element, its authoring
affordances, its export contract and its declaration. Implementation is a later PR — see this
change's `tasks.md` §0.

## ADDED Requirements

### Requirement: A Live Source is an axis-aligned region carrying ONE SYMBOLIC plate id

The Designer SHALL offer a **Live Source** element that can be placed and sized axis-aligned, and
that carries **exactly one** source id, an OPTIONAL `expectedAspect` and an optional poster image.
The schema type SHALL remain `video-placeholder` and SHALL be extended additively, so every stored
scene continues to parse without a schema-version bump or a migration.

**AMENDED 2026-08-10 (owner, `design.md` §2z) — that id is a PLATE IDENTIFIER, not an installation
key.** It names a hole in THIS template and nothing outside it, and the author picks it for the
LAYOUT. It SHALL NOT be matched by name against the installation's list of sources: a name match
silently requires the author to guess the installation's naming convention, which the Designer
cannot know. The installation binds a plate to one of its own named sources by a deliberate operator
action. The schema field is NOT renamed — that is a scene migration — and every rule below is
unchanged; only what the id MEANS is restated.

The plate id SHALL be **symbolic**: it SHALL match a plain identifier form and SHALL therefore
reject a concrete device reference such as `DECKLINK DEVICE 3`, a `route://` URL or a file path.
Resolving a plate to a concrete producer is an INSTALLATION concern and never travels in the scene —
a device-shaped plate id is an author writing an installation fact into a scene whether or not
anything would ever have matched it.

**AMENDED 2026-08-10 (owner) — whether an id resolves to a single device or to a FILL/KEY DEVICE
PAIR is a property of the installation's MAPPING, never of the scene.** The scene SHALL NOT declare
a second, key source id: the author cannot know how a source arrives at a given plant, which is the
same argument that makes `expectedAspect` an assertion rather than the fit input. The shipped
optional `keySourceId` schema field SHALL be treated as **DEPRECATED** — never written by a new
document, still parsed so stored scenes keep loading — and the Inspector SHALL NOT offer a control
for it.

Rotation and non-rectangular Live Sources are OUT of scope in v1, because `MIXER FILL` is
axis-aligned.

#### Scenario: The element carries its id and is placeable

- **WHEN** the operator creates a Live Source **THEN** it can be placed and sized axis-aligned and
  carries one source id, an `expectedAspect` and an optional poster
- **WHEN** a scene containing a Live Source is saved and reloaded **THEN** every field round-trips
  unchanged

#### Scenario: The scene never declares a key source

- **WHEN** the author inspects a Live Source **THEN** no key-source-id control is offered
- **WHEN** a stored scene carrying the deprecated `keySourceId` is loaded **THEN** it parses
  unchanged, and re-saving the document does not write the field back

#### Scenario: A stored scene authored before this change still parses

- **WHEN** a scene written before the additive fields existed is loaded **THEN** it parses
  unchanged and no migration runs

#### Scenario: A device reference is refused as a plate id

- **WHEN** a plate id is set to `DECKLINK DEVICE 3`, a `route://` URL or a file path **THEN** the
  value is refused at the schema boundary
- **WHEN** a scene carrying such an id reaches export preflight **THEN** an error is raised naming
  the element, and the export is blocked

### Requirement: The declared aspect is chosen by name, and the plate can be fitted to it

The Inspector SHALL offer `expectedAspect` as a NAMED PRESET picker rather than as a bare decimal.
The stored value SHALL remain a NUMBER — the presets are an authoring affordance over it, not a new
representation. Every option label SHALL carry BOTH spellings of the value (the ratio and the
decimal, e.g. `16:9 (1.78)`), because the field takes the decimal and the author reasons in ratios.

The picker SHALL offer a `Custom…` option that reveals a numeric input, so an unusual ratio stays
reachable, and a `— not specified —` option that writes the field **ABSENT**. Absent is a real third
state: `expectedAspect` is the author's ASSERTION, which the runtime validates the installation's
assigned source against and refuses the take on mismatch, so an author who cannot see the feed SHALL be able
to decline to assert rather than be forced into a guess. A new Live Source SHALL still store 16:9,
shown as the selected preset.

The Inspector SHALL offer an action that resizes the element so its EFFECTIVE rendered aspect —
`(W × scaleX) / (H × scaleY)`, since the element carries a non-uniform scale — equals the selected
aspect. It SHALL preserve `X`, `Y` and `W` and solve for `H`, SHALL NOT modify `scale`, and SHALL be
ONE undo entry. Where preserving `W` would push the element past the frame's bottom edge it SHALL
preserve `H` and solve for `W` instead, and SHALL state which side it preserved — an out-of-frame
Live Source is a preflight error, so the action must never create the error it exists to avoid. It
SHALL be disabled, with a stated reason, when no aspect is asserted or when the element already
matches within tolerance.

#### Scenario: The aspect reads back as a named preset

- **WHEN** a Live Source is selected **THEN** its aspect shows as a named preset whose label carries
  both the ratio and the decimal
- **WHEN** the stored number matches no preset **THEN** it shows as `Custom…` and the numeric input
  is revealed

#### Scenario: An author can decline to assert an aspect

- **WHEN** the author picks `— not specified —` **THEN** `expectedAspect` is written ABSENT and
  reloads as absent — never zero and never a sentinel number
- **WHEN** no aspect is asserted **THEN** the fit action is disabled with a stated reason

#### Scenario: The plate is fitted to the declared aspect

- **WHEN** the author invokes the fit action **THEN** the element is resized so
  `(W × scaleX) / (H × scaleY)` equals the selected aspect, preserving `X`, `Y` and `W`, leaving
  `scale` unchanged, in ONE undo entry
- **WHEN** preserving `W` would push the element past the frame's bottom edge **THEN** it preserves
  `H` and solves for `W` instead, and says which side it preserved
- **WHEN** the element already matches within tolerance **THEN** the action is disabled with a
  stated reason

### Requirement: The Inspector offers no affordance a Live Source cannot honour

The Inspector SHALL NOT offer, for a Live Source, any of: a keyframe affordance on a transform
field, a rotation control, an opacity control, or a filter section.

A Live Source's geometry is composed ONCE at import and sent as a static, axis-aligned box, and the
element paints no pixels on air, so none of those can change what airs. Offering them invites the
preflight error rather than preventing it, and the author would learn at EXPORT what the Inspector
could have said while they were authoring.

The plate's position, size and STATIC scale SHALL remain editable — the flattening composes scale
into the declared rect, so those describe the hole and the hole is the contract.

Every other element kind SHALL keep all of these.

#### Scenario: The affordances that cannot reach air are absent

- **WHEN** a Live Source is selected **THEN** its Inspector offers no keyframe affordance on any
  transform field, no rotation, no opacity and no filter section
- **WHEN** any other element kind is selected **THEN** all of those are still offered
- **WHEN** a Live Source is selected **THEN** position, size and scale remain editable

#### Scenario: The author is told why, once

- **WHEN** a Live Source is selected **THEN** the section states that the plate is static and
  axis-aligned and that it paints nothing on air, rather than leaving the removals unexplained

### Requirement: The source id is bindable through the existing fields/bindings model

A Live Source's source id SHALL be exposable as a dynamic field through the EXISTING fields and
bindings model, so a Runtime operator can set or change which source feeds it per take.

#### Scenario: A bound id is settable at playout

- **WHEN** the author marks a Live Source's source id DYNAMIC **THEN** it appears as a bound field
  like any other
- **WHEN** the Runtime operator changes that field's value **THEN** the new id is what the runtime
  resolves for that take

### Requirement: The authoring surfaces show SMPTE bars; the HOLE paints nothing in either export

The scene builder SHALL take an explicit render **mode**. In `author` mode a Live Source SHALL
render procedural SMPTE-style colour bars — drawn as CSS or inline SVG, never a bundled bitmap —
with its source id overlaid so multiple Live Sources stay distinguishable; a set poster image
replaces the bars. It SHALL never render as an unmarked black box.

In `output` mode the region INSIDE a Live Source's declared rect SHALL render **NOTHING**: fully
transparent, zero painted pixels. Every boot site SHALL name its mode explicitly rather than
inferring it.

The element MAY paint OUTSIDE that rect — see "A Live Source may carry a FRAME" below. "Paints
nothing" is a statement about the HOLE, which is the contract, and not about the element.

A Live Source SHALL be excluded from zone-override compilation in `output` mode, so no authored
zone can paint the hole on air.

#### Scenario: Bars on the authoring surfaces, an empty hole in the exports

- **WHEN** a Live Source is shown on the canvas or in the Designer preview **THEN** it renders SMPTE
  bars with its id label, or the poster when one is set
- **WHEN** the scene is exported to `.vcg` or to single-file HTML **THEN** the region inside the
  Live Source's declared rect paints zero pixels, and the element has no background and no children

#### Scenario: An authored zone cannot fill the hole on air

- **WHEN** a Live Source carries a zone override that would set a background colour **THEN** the
  exported page still paints nothing in that region

### Requirement: A Live Source is never silently dropped from an export

A Live Source SHALL NOT be silently removed from an export. The existing export path REMOVES fully
off-frame static elements without a message; a Live Source SHALL be EXEMPT from that removal,
because it is a compositing contract with the runtime and deleting it silently would remove the
contract while leaving the template that depends on it.

An out-of-frame or overlapping Live Source, and a Live Source carrying any geometry keyframe, SHALL
each raise a preflight **error** — not a warning, because only an error blocks the export.

#### Scenario: An off-frame Live Source blocks rather than vanishes

- **WHEN** a Live Source is dragged fully off-frame and the scene is exported **THEN** the export is
  blocked with an error naming the element, and the element is NOT removed from the artifact

#### Scenario: A rotated plate — or a rotated parent — is refused

- **WHEN** a Live Source carries a non-zero rotation **THEN** preflight reports an error naming the
  element and the export is blocked
- **WHEN** the plate's own rotation is zero but an ANCESTOR container is rotated **THEN** the same
  error is reported, naming both — the declared rect is axis-aligned either way, so the composited
  picture would show outside the frame the author drew

#### Scenario: An animated hole is refused in v1

- **WHEN** a Live Source carries a keyframe on position, size or scale **THEN** preflight raises an
  error, because a static composited rect would desync from a moving hole
- **WHEN** the plate carries none but an ANCESTOR container is animated **THEN** the same error is
  raised, naming both — an animated parent moves the hole identically, and the rect is read
  statically, so it stops being true on the next frame

#### Scenario: Overlapping Live Sources are reported

- **WHEN** two Live Sources overlap, or one exceeds the frame **THEN** preflight reports it against
  both elements

### Requirement: A Live Source may carry a FRAME, and the frame never enters the hole

A Live Source SHALL be able to carry an optional **stroke** — colour and width — authored in the
Inspector. The field SHALL be the SHARED stroke shape already used by the box kinds, added ADDITIVELY so every
stored scene keeps parsing with it absent, and it SHALL carry no alignment notion of its own.

The frame SHALL be painted **entirely outside the declared rect**, on the template layer, in BOTH
render modes. It is the one thing a Live Source paints on air.

🔴 **The declared rect SHALL be unchanged by a stroke of any width — its position as well as its
size.** The rect is a contract: the export declares it and CasparCG composites the live picture into
exactly it, so a frame that moved or resized the hole would put the picture out of register with the
frame drawn around it, with nothing in the Designer to show it. A stroke width of `0` SHALL mean NO
FRAME with the colour retained — a stored state, not an absent one.

Because the frame is outside the rect, it SHALL NOT affect the flattened rect the export declares,
and it SHALL NOT affect the overlapping-plate preflight check, which reads the declared rect and
only that. The same holds for any other paint an element places outside its rect, a drop shadow
included.

The frame SHALL survive the round trip through BOTH exporters.

#### Scenario: A frame is authored on the plate and survives both exports

- **WHEN** a Live Source is selected **THEN** the Inspector offers a frame colour and a frame width
- **WHEN** the author sets a colour and a width **THEN** the plate renders that frame around itself
  on the canvas
- **WHEN** the scene is exported to `.vcg` or to single-file HTML and read back **THEN** the stroke
  is present with the same width and colour
- **WHEN** the author sets the width to `0` **THEN** no frame is painted and the colour is retained,
  so raising the width again restores the frame the author chose

#### Scenario: The frame does not move or resize the hole

- **WHEN** a plate carries a frame of any width **THEN** the region the export declares for it has
  the same position and the same size as it had with no frame
- **WHEN** the page is rendered under the baseline stylesheet the artifact ships **THEN** the hole is
  still exactly the authored rect, with the frame drawn outside it

#### Scenario: Overlapping frames are not a fault; overlapping holes are

- **WHEN** two plates are placed so their FRAMES overlap but their declared rects do not **THEN**
  preflight reports no overlap error
- **WHEN** two plates' declared rects overlap **THEN** preflight reports the overlap error against
  both, whether or not either carries a frame

### Requirement: Each Live Source is independent, and the scene declares them for the runtime

A scene MAY contain multiple Live Sources, each with its own ids and geometry. The export path SHALL
produce a **declaration** for each: its flattened axis-aligned rect in scene pixels, its ids, its
`expectedAspect`, and whether its id is dynamic.

The flattening SHALL compose the FULL ancestor chain, including composition-instance scaling, so a
Live Source nested inside a composition instance declares the rect it actually occupies.

#### Scenario: Multiple independent Live Sources

- **WHEN** a scene contains several Live Sources **THEN** each is declared separately with its own
  ids and its own rect

#### Scenario: A nested Live Source declares its true rect

- **WHEN** a Live Source sits inside a composition instance that is scaled **THEN** its declared rect
  accounts for that scaling, not only for its own transform
