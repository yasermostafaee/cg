# designer-live-source Specification

## Purpose

TBD - created by archiving change live-plate-fit-mode. Update Purpose after archive.

## Requirements

### Requirement: The author chooses how a live plate is fitted into its box

A Live Source plate SHALL offer a FIT control in the Inspector, beside the declared aspect, choosing
between `contain` (the default — the whole picture, centred, margins showing the template) and
`cover` (scale to cover and centre-crop).

It SHALL be authored PER ELEMENT and not per source: the same catalog source seated in a 16:9 box
and a 3:4 box needs different fits, so a per-source field would be wrong in both places at once.

The control SHALL use the app's shared control primitives and the shared `Icon` component, and SHALL
read correctly under RTL. A plate authored before this control existed SHALL load with no stored
value and render as `contain`.

The label SHALL say what the mode does to the PICTURE rather than to the box, because the natural
misreading — that the box changes shape — is wrong: the box is unchanged and the picture is placed
inside it.

#### Scenario: The fit mode is chosen in the Inspector

- **WHEN** a Live Source plate is selected **THEN** the Inspector shows a fit control offering
  `contain` and `cover`
- **WHEN** the author picks one **THEN** the choice is stored on the element and survives a save and
  reload

#### Scenario: An existing plate defaults to `contain`

- **WHEN** a plate authored before this control existed is opened **THEN** the control reads
  `contain`, and the scene stores no value until the author picks one

#### Scenario: The choice reaches the export

- **WHEN** a scene with a fitted plate is exported **THEN** the export carries that plate's fit mode,
  so the bridge resolves the same mode the author chose
- **WHEN** that scene has a LOOK GROUP **THEN** the mode is carried PER LOOK, from the plate element
  serving that `routeKey` in that look — never off the group's declared source, which nothing writes
  (`B-178`), and never one answer for a `routeKey` whose box differs between looks
- **WHEN** two plates in one look are authored with different modes **THEN** both reach the runtime,
  each with its own

### Requirement: A multi-frame group's source list is DERIVED from its plates

A multi-frame group SHALL NOT store a list of sources. The group's source list SHALL be derived from
the distinct `routeKey`s its template's Live Source plates carry, and a source SHALL come into
existence by a plate being pointed at a key.

The derived list SHALL have a defined order: **document order of first use** — the scene's own
layers, then each composition in order, each walked in authored sibling order. The order SHALL be
stable under APPEND: a new plate, a new look or a new key SHALL be appended after every key that
already exists. It SHALL NOT be stable under deletion — removing the plate that first used a key
moves that key to wherever it is next used — and no operator assignment SHALL depend on position,
because assignments are keyed on the source id.

An UNASSIGNED plate SHALL contribute nothing to the list.

There SHALL be exactly ONE definition of this derivation, shared by the exported carrier and by
every Designer surface that shows the list, so the author's list and the operator's list cannot
disagree about either membership or order.

A stored scene or exported package written while the group still declared its sources SHALL keep
loading, and the stored list SHALL be ignored rather than merged, migrated or preferred.

#### Scenario: The list is what the plates say

- **GIVEN** a template whose plates carry `l1`, `l2` and `l1` again
- **WHEN** the group's source list is derived
- **THEN** it is `l1`, `l2` — deduped, in document order of first use
- **AND** an unassigned plate contributes nothing to it

#### Scenario: A stored declaration is ignored

- **GIVEN** a scene that still carries a group's stored `sources` array
- **AND** a plate whose `routeKey` that array does not contain
- **WHEN** the scene is loaded and exported
- **THEN** the scene parses and the stored array is dropped
- **AND** that plate's key is an ordinary source: it appears in the derived list and in the exported
  carrier
- **AND** the exported order follows the plates, not the stored array

#### Scenario: Growth does not reorder the operator's list

- **GIVEN** a derived list of `l1`, `l2`
- **WHEN** a plate carrying a new key is added
- **THEN** the new key is appended and the existing keys keep their order

### Requirement: A plate is never refused for using a source the group does not declare

The export preflight SHALL NOT refuse a Live Source plate on the ground that its `routeKey` is not
declared by the multi-frame group. There is no declaration for it to contradict.

Two neighbouring refusals SHALL survive unchanged, because neither is about a list: a plate pointed
at NOTHING SHALL keep blocking the export in DOCUMENT scope, whether or not the template has a
group; and two PLATES carrying the same key in one look SHALL keep being refused, because one source
is one seat.

Two plates pointed at nothing SHALL NOT be reported as two plates sharing one source.

#### Scenario: An undeclared key raises nothing

- **GIVEN** a template with a multi-frame group
- **AND** a plate whose `routeKey` no other plate uses
- **WHEN** the preflight runs
- **THEN** no issue is raised for that plate

#### Scenario: The unset refusal survives

- **GIVEN** a plate with no source, in a template with a multi-frame group
- **WHEN** the preflight runs
- **THEN** the export is blocked with an `error` naming that plate
- **AND** two such plates in one look are reported as two unset plates, not as a duplicated source

### Requirement: The Inspector's source control accepts a new key typed freely

The Inspector SHALL offer ONE source control for a Live Source plate, whether or not the template
has a multi-frame group, and that control SHALL accept a freely typed key — because typing a new key
is how a source comes into existence.

The keys the template already uses SHALL be OFFERED by that control as suggestions, never as a
constraint, and the plate's own key SHALL NOT be offered to itself. The control SHALL NOT mark any
key as undeclared.

The control SHALL keep showing what the element holds and SHALL NEVER substitute a different value.
Clearing it SHALL store an absent `routeKey` rather than an empty string. Rendering it SHALL NOT
modify the scene.

#### Scenario: A new key is created by typing it

- **GIVEN** a template with a multi-frame group and an unassigned plate
- **WHEN** the author types a key no other plate uses and commits it
- **THEN** the key is stored on the element, the refusal clears, and the key joins the derived list
- **AND** it is offered as a suggestion to the next plate

#### Scenario: The control offers without constraining

- **GIVEN** a plate on a template whose other plates use `l1` and `l2`
- **WHEN** the Inspector renders it
- **THEN** `l1` and `l2` are offered, the plate's own key is not offered to itself, and no key is
  marked undeclared
- **WHEN** the author clears the control **THEN** `routeKey` is absent once more, not an empty string

### Requirement: The Looks panel MIRRORS the derived source list

The Looks panel SHALL show the group's derived source list read-only, in its derived order. It SHALL
offer no control to add, rename or remove a source, because none of those is an act on the panel any
more.

Where the panel summarises preflight issues, refusals and non-blocking warnings SHALL be counted and
headed separately, so a warning is never presented under a heading that claims the export will
refuse.

#### Scenario: The panel has no source editor

- **WHEN** the Looks panel renders a multi-frame group
- **THEN** the sources it lists are those the plates use, in derived order
- **AND** there is no control to add or remove one

### Requirement: A near-miss source id is a non-blocking nudge

The preflight SHALL raise a WARNING naming both ids where a template uses two source ids that
differ only by a separator, by case, or by a single character.

The warning SHALL NEVER be an error, SHALL NEVER block the export, and SHALL NOT be promoted to one:
the check is a heuristic over what the plates say, not a second copy of the truth to check against,
and a heuristic that blocks is worse than none.

It SHALL NOT fire on ids that differ only in a NUMBER within the same family, because numbering is
how templates name their inputs and a warning that shouts at correct work is one authors learn to
ignore.

#### Scenario: A separator slip is nudged, not refused

- **GIVEN** a template using `l1` on one plate and `l-1` on another
- **WHEN** the preflight runs
- **THEN** a `warning` is raised naming both ids
- **AND** the export is not blocked by it

#### Scenario: A numbered family is silent

- **GIVEN** a template using `l1`, `l2` and `l3`
- **WHEN** the preflight runs
- **THEN** no near-miss warning is raised

### Requirement: A look-group template carries the author's aspect and its FILL flag from the plate

For a template with a multi-frame group, the exported carrier's `expectedAspect` and `dynamic` SHALL
be taken from the plate ELEMENT that first serves each source in document order — the same element
the carrier's `elementId` names — and not from any per-source declaration.

Both fields were previously read off a declaration nothing ever wrote, so a look-group template
exported no aspect at all and the take's aspect-mismatch refusal, which needs both the source's
aspect and the author's, could not fire (`B-179`).

Where two plates serving one key assert DIFFERENT aspects, the first in document order SHALL win and
this SHALL NOT be refused: an aspect is the author's intention for a BOX, and the real feed's format
still outranks it when known.

#### Scenario: The author's aspect reaches the bridge

- **GIVEN** a look-group template whose plate asserts an expected aspect
- **WHEN** the scene is exported
- **THEN** that aspect rides the carrier for that source
- **AND** a plate asserting nothing carries no aspect, which stays distinguishable from asserting a
  default

#### Scenario: The FILL flag is computed the same way for both paths

- **GIVEN** a plate retargeted by a `live-source-id` field binding with the `fill` role
- **WHEN** the scene is exported, with or without a multi-frame group
- **THEN** its carrier entry is marked dynamic by the same rule in both cases

### Requirement: An element blocking the export is MARKED on the canvas

Every element that is the subject of an ERROR-severity preflight issue SHALL be marked on the canvas,
whether or not it is selected, and the mark SHALL clear as soon as the geometry stops producing the
issue.

The mark SHALL use the design system's existing `danger` treatment and SHALL NOT be confusable with
the selection outline or a hover state. Colour SHALL NOT be the only channel: the mark SHALL also
carry a non-chromatic signal and an accessible description naming the problem.

Where an issue names TWO participants — an overlap files one issue per element — BOTH SHALL be marked.

The mark SHALL be driven by the live preflight output, never by selection, and SHALL NOT intercept
pointer input.

#### Scenario: Both overlapping boxes are marked

- **WHEN** two Live Sources overlap **THEN** BOTH participants are marked on the canvas, not just one
- **WHEN** either is inspected **THEN** its mark carries the issue's own message as an accessible
  description

#### Scenario: The mark is independent of selection

- **WHEN** an offending element is not selected **THEN** it is still marked
- **WHEN** an element is selected but has no error **THEN** it carries the selection outline and no
  error mark

#### Scenario: The mark clears when the geometry is fixed

- **WHEN** the author moves the boxes apart **THEN** the marks disappear without any further action

#### Scenario: An off-frame box is marked the same way

- **WHEN** a Live Source is partly outside the frame **THEN** that box is marked, with its own message

#### Scenario: A clean composition marks nothing

- **WHEN** a composition has no error-severity issues **THEN** no element is marked

### Requirement: A blocked Export names the offender and opens the way to the full reason

The Export controls SHALL NOT be inert when validation errors block them. They SHALL remain fully
operable, and a press SHALL open the Issues panel and select the offending elements.

⚠ They SHALL NOT be marked `aria-disabled` either. A control that announces itself as unavailable
tells a screen-reader user not to press the one thing that would explain the problem — this
requirement's own defect, aimed at the users least able to work around it. The refusal SHALL reach
assistive technology as the control's accessible DESCRIPTION, which is possible only because the
control is enabled; its accessible NAME SHALL stay canonical, so every surface can still find it.

The refusal SHALL name the number of errors and the first offender. No string that cannot be rendered
SHALL remain in the component.

Where the export is unavailable because there is NO composition open, the control SHALL be genuinely
disabled: there is no issue to explain.

#### Scenario: Pressing a blocked Export explains it

- **WHEN** validation errors block the export and the author presses Export **THEN** the Issues panel
  opens, the offending elements are selected, and the refusal names the count and the first offender
- **WHEN** it is pressed **THEN** no export runs

#### Scenario: The refusal is one action from the button

- **WHEN** the author presses a blocked Export **THEN** the full message is on screen in ONE action
  from the control they pressed

#### Scenario: Assistive technology hears the reason, not "unavailable"

- **WHEN** the export is blocked **THEN** the control is neither `disabled` nor `aria-disabled`, and
  the refusal is exposed as its accessible description
- **WHEN** it is blocked **THEN** its accessible NAME is unchanged, so the control remains findable

#### Scenario: No composition is a genuinely disabled control

- **WHEN** no composition is open **THEN** the Export control is disabled and says so, because there
  is nothing to explain

#### Scenario: A clean composition exports

- **WHEN** there are no error-severity issues **THEN** the Export control is live and pressing it runs
  the export

### Requirement: The overlap rule ignores floating-point noise, and only noise

Every comparison that decides whether two Live Source rects share area SHALL treat two coordinates as
EQUAL when they differ by less than the floating-point format's own noise floor at their magnitude,
and SHALL use ONE shared predicate to do so across every copy of the rule — the Designer's export
preflight (both the per-document AABB pass and the per-arrangement / per-look flattened pass) and the
scene flattener's mask-hole membership test.

The floor SHALL be expressed as a small multiple of the double's epsilon scaled to the magnitudes
being compared (a ULP-relative epsilon), and SHALL NOT be an absolute pixel figure. This is what makes
it provably a **noise filter and not a product tolerance**: it says nothing about how close two holes
may sit on air, only that two numbers which the arithmetic cannot distinguish are not evidence of a
collision. A guard chosen in pixels would be a product decision about `D-137`'s rule; this one is not.

The strict inequality itself SHALL be unchanged: exactly touching edges SHALL still NOT be an overlap,
so flush abutment remains buildable. Only the INPUTS are guarded. An overlap large enough for the
author to have caused it — `0.01` px is ten orders of magnitude above the floor — SHALL still raise
the error.

#### Scenario: Two flush plates inside a scaled composition instance are accepted

- **WHEN** two plates abut at exactly equal coordinates in their composition's own
  units, and that composition is instanced at a size that is not its own resolution
  (so every flattened coordinate is multiplied by a non-integer `preScale`)
- **THEN** no overlap error is raised, and neither plate punches a mask hole
  through the other

#### Scenario: A genuine sub-pixel overlap still fires

- **WHEN** two plates in the same scaled instance overlap by 0.01 scene pixels
- **THEN** the overlap error is raised against BOTH plates, exactly as `D-137` requires

#### Scenario: Exactly flush is still not an overlap at preScale 1

- **WHEN** two plates abut exactly, with no scaling anywhere in the chain
- **THEN** no overlap error is raised — the boundary the rule already had is unmoved

#### Scenario: A residue value stored by an older project no longer blocks the Export

- **WHEN** a project saved before this change holds a coordinate a drag committed as
  `123.99999999999999` against a neighbour's edge at `124`
- **THEN** the Export is not refused, and the Issues panel does not name the two plates

### Requirement: The Designer describes a plate as the runtime composites it now

The Designer SHALL describe a Live Source, in every string about one — the Inspector's Live Source
and Frame sections, the preflight refusals, the arrangement guidance — by the current mechanism:
the page carrying the plates is composited BELOW them, CasparCG draws each picture into the plate's
declared rect, the plate paints nothing on air, and the frame is painted on the page just outside
the rect. No Designer string SHALL describe a punched hole, a mask, or a picture "behind" the page.

#### Scenario: the Inspector carries no retired mechanism

- **WHEN** a Live Source plate is selected
- **THEN** the Live Source, Frame and Transform sections contain no "hole", no "mask" and no
  "composited on a layer behind it"

#### Scenario: the refusals name plates, not holes

- **WHEN** the preflight refuses a plate inside a repeater or sequence item, an animated plate, or
  two overlapping plates
- **THEN** each message describes a plate that declares no box, a plate whose frame would slide
  from its picture, or overlapping plates — never a hole

### Requirement: The Frame colour is withheld at width 0, and the value is kept

At a stroke width of 0 the Frame section's colour field SHALL stay visible with its colour, disabled,
carrying "No frame at width 0. The colour is kept" as its tooltip. Setting a width SHALL re-enable
it with the same colour. No sentence under the fields SHALL restate this.

#### Scenario: dialling the frame off keeps the colour on screen

- **WHEN** the author sets the stroke width to 0 on a plate whose frame was green
- **THEN** the colour field still shows green, disabled, with the reason as its tooltip
- **AND** setting the width to 4 paints a green frame

### Requirement: A refusal about an unnamed plate does not repeat the kind as a name

A preflight refusal about a plate still wearing the factory name SHALL name it as "The unnamed Live
Source at (x, y)", never `Live Source "Live Source"`. A plate the author named SHALL be named.

#### Scenario: an unset, unnamed plate

- **WHEN** a freshly drawn plate at (200, 160) has no source
- **THEN** the refusal reads "The unnamed Live Source at (200, 160) has no source: …"

### Requirement: A new Live Source plate is created with NO source, and the refusal says so

A newly created Live Source plate SHALL be born with **no source**: its `routeKey` SHALL be absent,
never a generated `live-N`, never the first source the template declares, and never any other
value the author has not chosen. Creating a plate SHALL NOT add anything to a multi-frame group's
declared source list.

The element schema SHALL therefore permit an absent `routeKey`, so an unassigned plate is storable.
A look group's DECLARED source SHALL keep requiring one: a plate may not yet have a source, a
declaration always names one.

An unassigned plate SHALL be refused by the export preflight with `severity: 'error'` under its own
code, distinct from the code for a plate that references a source the group does not declare. The
two are different mistakes with different remedies and SHALL NOT share a message. The refusal SHALL
be raised whether or not the template declares a multi-frame group.

The refusal SHALL NOT be raised as a malformed-id error: an absent source is a deliberate state,
not a typo, and a message quoting `"undefined"` names a value the author never entered.

#### Scenario: Drawing a plate leaves it unassigned

- **WHEN** the author draws a Live Source with the canvas tool
- **THEN** the created element carries no `routeKey`
- **AND** the multi-frame group's declared source list is unchanged

#### Scenario: An unassigned plate blocks the export and is named

- **GIVEN** a plate with no source
- **WHEN** the preflight runs
- **THEN** exactly one issue is raised for that element, of severity `error`, whose code is the
  unassigned code and not the undeclared-reference code
- **AND** the message names the plate and states that it is pointed at nothing
- **AND** the message does not describe the id as malformed and does not quote `"undefined"`

#### Scenario: The refusal names the control that fixes it

- **WHEN** the template declares a multi-frame group **THEN** the message directs the author to the
  Inspector's Live Source panel and its `source` list
- **WHEN** the template declares none **THEN** the message directs the author to the same panel's
  free-text `source id` box instead

### Requirement: The source control shows what the plate holds, in all three states

The Inspector's Live Source control SHALL display the element's own `routeKey` and SHALL NEVER
substitute a different value for it.

It SHALL represent three states distinctly: a source the group declares, shown plainly; a source
the group does not declare, shown as itself and marked as undeclared; and no source at all, shown
as its own selectable entry. Choosing a declared source SHALL remain available in every state, and
SHALL be one action away.

Selecting the no-source entry SHALL store an absent `routeKey` rather than an empty string.
Rendering the control SHALL NOT modify the scene: an undeclared value is the author's to correct,
and SHALL NOT be repaired automatically.

#### Scenario: An undeclared source is shown as itself

- **GIVEN** a plate whose `routeKey` is not in its group's declared list
- **WHEN** the Inspector renders it
- **THEN** the control's value is the element's own `routeKey`, marked as undeclared
- **AND** the declared sources are offered alongside it, none of them selected in its place
- **AND** the element's stored `routeKey` is unchanged

#### Scenario: The unassigned state is selectable and round-trips

- **GIVEN** a plate with no source
- **THEN** the control shows a no-source entry as its value
- **WHEN** the author picks a declared source **THEN** it is stored and the refusal clears
- **WHEN** the author picks the no-source entry again **THEN** `routeKey` is absent once more, not
  an empty string, and the refusal returns

### Requirement: An export refusal is drawn in the error colour

Where a surface summarises preflight issues that BLOCK the export, it SHALL draw them in the design
system's existing `danger` token, not in `caution`.

`caution` denotes a state the operator should notice that is not an error; a blocked export is an
error, and the author cannot export at all while one stands. The same fact SHALL NOT be drawn in
two different severities by two different surfaces.

#### Scenario: The Looks panel matches the status bar

- **GIVEN** a template with at least one export-blocking Live Source issue
- **WHEN** the Looks panel renders its issue block
- **THEN** the block's summary and each issue row use the `danger` colour
- **AND** the summary does not reuse the neutral heading style shared by the panel's other group
  labels

### Requirement: A Live Source refusal names the remedy, not only the rule

A plate whose `routeKey` is not in its multi-frame group's declared source list SHALL keep being
refused by the export preflight with `severity: 'error'`, and the refusal SHALL keep naming the
plate, the referenced source, and the group's full declared list.

_ADDED rather than MODIFIED deliberately: the undeclared-source RULE itself is not yet in any living
spec — it belongs to the unarchived `multibox-layout-switch` change — so there is no requirement
here to modify. This states only what this change adds, the wording contract; the rule's own
severity and reasoning are untouched by it._

**The message SHALL also name the remedy — the control and the choice.** Because either side may be
what the author meant, it SHALL name BOTH legitimate remedies: choosing a declared source on the
plate, and declaring the referenced name on the group.

The refusal SHALL NOT offer to apply either remedy itself. Repairing the scene is the author's
action.

An UNASSIGNED plate SHALL NOT be reported under this requirement: it references nothing, so a
message saying it "references" anything would be false.

#### Scenario: The undeclared refusal names both remedies

- **GIVEN** a plate holding a source the group does not declare
- **THEN** the message names the plate, the referenced source, and the declared list
- **AND** it directs the author to the Inspector's `source` list
- **AND** it offers declaring the referenced name on the group as the alternative
- **AND** no control is offered that would change the scene on the author's behalf
