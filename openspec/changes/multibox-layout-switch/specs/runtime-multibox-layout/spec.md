# runtime-multibox-layout

> ✅ **All eight owner gates are answered** (`design.md` §12), so this capability's requirements are
> no longer partial. The work is carried by two PRD items on the D-137/C-015 precedent — `R-057`
> (operator) and `D-152` (authoring) — and is BLOCKED on `B-145`.
>
> ⚠ **Vocabulary.** A **COUNT** is how many boxes (1, 2, 3, 4…) and is what the operator picks. An
> **ARRANGEMENT** is a named geometry for a count; a count may have several, one of which is the
> authored default.

## ADDED Requirements

### Requirement: Exactly ONE multi-box layout is active at a time

A template that declares more than one multi-box layout SHALL have **exactly one** of them active at
any moment. The operator SHALL be able to switch which one is active, and SHALL NOT be able to reach
a state in which two are active together.

Exclusivity SHALL be **structural** — a property of the single layout state a row carries, not a
rule enforced only by the operator surface. A surface-only rule can be violated by any path that
does not pass through that surface, and `design.md` §8 records two such paths that exist today
(`take()` and `restore()`).

The layout state SHALL have exactly ONE authority, read by the switch, by the mask and by the
live-plate reconcile. A second copy of "which layout is active" is precisely the drift this repo
forbids.

#### Scenario: The operator switches from the 3-box layout to the 2-box layout

- **WHEN** the operator switches a running row from its 3-box layout to its 2-box layout
- **THEN** the 2-box layout is the only one on air, and no part of the 3-box layout remains visible
  — neither its painted frames nor the holes its plates punched

#### Scenario: Switching back restores the previous layout exactly

- **WHEN** the operator switches back from 2-box to 3-box
- **THEN** the 3-box layout is the only one on air, and each box shows the same source it showed
  before the switch away

#### Scenario: No path reaches two active layouts on one row

- **WHEN** any path changes a row's layout — the operator control, a take, or a restore after
  reconnect
- **THEN** the row still has exactly one active layout, because the change replaces the single
  layout state rather than adding to a set

### Requirement: Source assignment SURVIVES a layout switch

A source the operator has assigned to a box SHALL remain on the corresponding box after a layout
switch. Switching 3-box → 2-box SHALL NOT scramble which source appears in which box.

Assignment SHALL continue to be keyed by `(templateId, plateId)`, where `plateId` is the element's
symbolic `routeKey` — never an element id, a plate index, or any other layout-local identity.

A layout SHALL be a set of **geometries and visibilities over the SAME plate set**, not a separate
set of plate elements per layout. A box therefore keeps ONE identity across every layout, so the
assignment tuple cannot change when the layout does. Separate plate sets are refused: two layouts of
the same screen area necessarily overlap, and overlapping holes are an export-blocking fault
(`live-source-overlap`) whose runtime consequence is that which source shows is a z-order accident.

#### Scenario: Camera 1 stays on the first box across a switch

- **GIVEN** the operator has assigned camera 1 to the first box of the 3-box layout
- **WHEN** the operator switches to the 2-box layout, in which that same plate takes a new rect
- **THEN** the box shows camera 1 at its new position and size, with no operator action

#### Scenario: A box with no counterpart in the target layout does not displace another source

- **GIVEN** a 3-box layout whose third box has a source assigned
- **WHEN** the operator switches to the 2-box layout, which has no third box
- **THEN** the two surviving boxes still show the sources they showed before, and the dropped box's
  source is not reassigned onto either of them

### Requirement: The layout switch and the live-source change are ONE mechanism

A layout switch and a source change SHALL be served by a **single** reconcile. Changing which plates
exist and where, and changing what one plate shows, are the same operation: resolve the desired
live-plate set for the row, then apply the delta against what is currently seated.

That reconcile SHALL resolve plates through the SAME resolver a take uses. A layout switch that
resolved plates its own way would be a second spelling of "which producer is behind this hole", and
the two would eventually disagree about a plate that is on air — the argument the existing
`swapLiveSource` already makes for itself, applied one level up.

For every mutation the reconcile performs — the plate set, the punch mask, the fit, and the layer
allocation — the corresponding INVERSE SHALL exist and be exercised by a test.

#### Scenario: A layout switch and a source swap take the same path

- **WHEN** a layout switch and a per-plate source swap each change what is on air
- **THEN** both are applied by the one reconcile, and neither has a seating path of its own

#### Scenario: The mask follows the plates it belongs to

- **WHEN** a layout switch removes a plate from the active layout
- **THEN** the hole that plate punched is removed in the same change, so nothing below shows
  through where the plate used to be

#### Scenario: Every mutation has an enumerated inverse

- **WHEN** the reconcile seats a plate, punches a hole, sets a fit, or allocates a layer
- **THEN** a corresponding release, un-punch, fit-clear and de-allocation exists and is covered by a
  test, so no half of a pair can ship without the other

### Requirement: The transition between layouts has SELECTABLE MODES, and its curve rule binds the PLATES only

A layout switch SHALL offer several transition modes, including an **immediate cut with no
transition**. The author SHALL set the default mode and its duration; the operator SHALL always have
an immediate cut available as an escape, whatever the authored default.

A transition SHALL move **the backgrounds as well as the boxes** where an author has given
arrangements different backgrounds. **ONE shared background is the default and is sufficient**; a
per-arrangement background is an ordinary element visible in one arrangement, and requires no concept
beyond per-arrangement element visibility.

Where a plate's geometry or opacity is animated, **both sides SHALL use `linear`** — the page's CSS
transition and the server's `MIXER` tween. A plate is the only thing with a server-side counterpart
that must agree with the page, the two run on independent clocks, and `linear` is the ONLY curve
name the two vocabularies both denote: the CasparCG tween names and the CSS timing functions
otherwise share none, and the nearest same-sounding pair separates hole from picture by ~36 px on a
1920 raster.

A CSS transition on a plate that OMITS its timing function SHALL be refused by lint or test. The CSS
default is `ease`, which is 580–835 px from every CasparCG tween — over a third of the frame width —
and it is what gets written by accident.

The `linear` rule SHALL NOT be applied to backgrounds, titles, or any other page-only content. Those
have no server-side counterpart and therefore no second clock to agree with, so any easing and any
duration is correct for them.

Where a mode fades a box rather than moving it, it SHALL fade **the mask's luminance** rather than the
producer's opacity. A luminance-keyed mask makes a grey hole a partly-open hole, so the backdrop
progressively re-covers the picture — which keeps the whole transition on the page, with no server
tween and therefore no second clock. Fading the producer's opacity while the hole stays open would
reveal what lies under the live layer, which is black.

#### Scenario: The operator cuts between layouts with no transition

- **WHEN** the operator switches layouts using the immediate-cut mode
- **THEN** the new layout is on air with no tween on either the page or the server, and the operator
  can reach that mode whatever transition the author set as the default

#### Scenario: A moving plate's hole and picture stay together

- **WHEN** a layout switch animates a plate from one position to another
- **THEN** the page's hole and the server's picture follow the same `linear` curve over the same
  duration, so the live picture never appears outside its frame

#### Scenario: A fade needs no server tween and shows no black

- **WHEN** a transition fades a box out
- **THEN** the mask's luminance is what fades, so the backdrop re-covers the picture progressively
  and no black rectangle appears where the hole was

#### Scenario: A background transition is not held to the plate curve

- **WHEN** an author gives a per-layout background an eased crossfade
- **THEN** it is accepted, because a background has no server-side counterpart to disagree with —
  while a plate transition that omits its timing function is still refused

#### Scenario: Both backdrops keep their holes through a crossfade

- **WHEN** an outgoing and an incoming background are both visible during a crossfade
- **THEN** both carry the current mask, so neither is opaque over a plate's hole for any part of the
  fade

### Requirement: A source with no box in the target layout is HELD, or its teardown is NAMED

A live source whose box does not exist in the target layout SHALL be **held muted and idle** rather
than torn down, so switching back is immediate. Its producer stays seated on its live-source band
layer while its plate stops punching a hole.

Where a source kind cannot be held open, the fallback to teardown SHALL be a **named, observable
behaviour** — never a silent difference. An operator whose switch-back is not immediate SHALL be
able to see that the source was released rather than held, so the inconsistency does not read as a
fault in the switch.

#### Scenario: Switching away and back restores the dropped box immediately

- **GIVEN** a 3-box layout whose third box has a source assigned
- **WHEN** the operator switches to the 2-box layout and then back
- **THEN** the third box shows its source again without a re-seat, because the producer was held

#### Scenario: A source that cannot be held says so

- **GIVEN** a source kind that cannot be held open while hidden
- **WHEN** the operator switches to a layout without that box
- **THEN** the source is torn down and that is surfaced, rather than the switch-back silently taking
  longer than it does for every other source

### Requirement: The operator picks a COUNT in one action, and gets that count's default arrangement

Exactly one arrangement of one count SHALL be active at a time. A template MAY declare several
**arrangements** for the same box **count**.

Picking a count SHALL be **ONE operator action**, and SHALL activate that count's **authored default
arrangement**. Choosing a non-default arrangement SHALL be possible and SHALL be an **explicit**
additional step — the common case must not pay for the rare one.

Sources SHALL be matched to cells in **declared order**. Per-cell assignment is deliberately not
provided: it introduces a cell as a separately addressable identity, and the need for it is unproven.

#### Scenario: Switching to a 2-box count takes one action

- **WHEN** the operator picks the 2-box count on a running row
- **THEN** that count's default arrangement is on air, in one action, with no arrangement chooser in
  the way

#### Scenario: A non-default arrangement is reachable but explicit

- **GIVEN** a count with more than one authored arrangement
- **WHEN** the operator wants the non-default one
- **THEN** they can select it explicitly, and the default is what a plain count pick still gives

### Requirement: A shape the template does not have is REFUSED legibly, never truncated

Two situations SHALL be refused by ONE refusal family, with the same wording discipline: naming what
was asked for and what exists.

- Selecting **more sources than the largest arrangement holds** SHALL be refused, naming the count
  selected and the largest available.
- Selecting a **count for which no arrangement is authored** SHALL be refused the same way.
  Arrangements are NOT required for every count.

Neither SHALL be resolved by silently dropping sources or by silently substituting another count. A
truncation would put a source off air without saying so, which is the failure the refusal exists to
prevent.

#### Scenario: More sources than any arrangement can hold

- **WHEN** the operator selects five sources and the largest authored arrangement is 4-box
- **THEN** the action is refused with a message naming both the five requested and the 4-box maximum,
  and no source is silently dropped

#### Scenario: A count with no arrangement

- **WHEN** the operator picks a 3-box count on a template that authors only 1-box and 2-box
- **THEN** the action is refused in the same family and with the same wording discipline, rather than
  falling back to another count
