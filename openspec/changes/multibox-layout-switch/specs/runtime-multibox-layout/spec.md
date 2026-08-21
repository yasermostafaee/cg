# runtime-multibox-layout

> ✅ **All eight owner gates are answered** (`design.md` §12), so this capability's requirements are
> no longer partial. The work is carried by two PRD items on the D-137/C-015 precedent — `R-057`
> (operator) and `D-152` (authoring) — and is BLOCKED on `B-145`.
>
> ⚠ **Vocabulary.** A **COUNT** is how many boxes (1, 2, 3, 4…). It is **DERIVED** from how many
> source toggles are lit — the operator does not address it. An **ARRANGEMENT** is a named geometry
> for a count; a count may have several, one of which is the authored default.

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

### Requirement: At most ONE multi-box template is on air per channel, refused at every door

At most one item carrying a multi-box template SHALL be on air on a given channel at any moment. A
second one SHALL be **refused**, at every path that can reach air, and the refusal SHALL name both
what is already on air and what was refused.

A template is **multi-box** when its Live Source carrier declares more than one box. A template
whose carrier is ABSENT (`unknown`) SHALL NOT count as multi-box: nothing can read it, it seats no
plates, and treating it as multi-box would refuse a station's whole pre-carrier rundown on upgrade.

The condition SHALL be decided by **ONE predicate**, called from every door. `design.md` §8 records
that a restore never passes through a take, so there are two call sites by necessity — and a second
local copy of the condition is the drift `CLAUDE.md` golden rule 6 exists to prevent.

A refusal SHALL mutate nothing: no slot taken, no ledger entry, no wire traffic.

#### Scenario: A second multi-box take is refused, naming the incumbent

- **WHEN** an operator takes a multi-box template while another multi-box template is already on air
  on that channel
- **THEN** the take is refused with `multibox-already-on-air` and a message naming the template and
  item already on air, and nothing about the refused item reaches the wire

#### Scenario: A restore after reconnect cannot re-seat a second one

- **WHEN** a reconnect restores retained rows and two of them carry multi-box templates in the
  on-air state on one channel
- **THEN** the first is restored and the second is skipped with `multibox-already-on-air`, carrying
  the same sentence the take refusal gives, and holds no slot afterwards

#### Scenario: A single-box template is not refused

- **WHEN** an operator takes a template declaring one box, or none, while a multi-box template is on
  air
- **THEN** the take is accepted — the rule is about multi-box templates, not about live plates in
  general

#### Scenario: A row that is not coming back on air still restores

- **WHEN** a reconnect restores a multi-box row whose retained state is `loaded` or `cleared` while
  another multi-box row restores on air
- **THEN** it is restored normally, because it puts nothing on the channel and dropping it would
  silently remove a row the operator can see

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

### Requirement: A row FREEZES its template assignment at TAKE

A row that is ON AIR SHALL NOT change what any of its plates shows because the TEMPLATE ASSIGNMENT
was edited. The take SHALL capture the template's `{plate → catalog entry}` answer, and every later
resolution on that row — a look switch, an emergency source swap, a field UPDATE, a reconcile after
a bridge restart — SHALL resolve that level from the captured snapshot rather than from the live
assignment store.

The snapshot SHALL be released when the row goes off air by a landed `out` or `stop`, and SHALL be
dropped when the row is removed. A subsequent take SHALL capture the assignment then in force, so
re-taking a row is how an operator adopts an edited default.

A failed or refused teardown SHALL NOT release the snapshot: the graphic may still be on air, and
a row whose state cannot be established SHALL stay pinned.

The snapshot SHALL survive a bridge restart, carried by the browser's retention alongside the row's
other operator intent. A restored row with no snapshot SHALL resolve from the live store, which is
the behaviour of a row that was never pinned.

Three levels SHALL NOT be frozen, and each SHALL remain in force on a pinned row:

- the installation's **CATALOG** — the snapshot names which catalog ENTRY a plate uses, never what
  that entry resolves to, so re-pointing or retiring an entry still reaches the row;
- the row's **PER-LOOK BINDINGS**, which SHALL continue to reach air in one action;
- the row's **PER-PLATE EMERGENCY OVERRIDE**, which SHALL continue to reach air in one action and
  SHALL continue not to write back to the template assignment.

The operator surface that edits the template assignment SHALL state, per plate and only where the
two disagree, that a row on air is resolving the captured value rather than the one displayed. That
statement SHALL be suppressed where an emergency override is in force for that plate, because the
override outranks the assignment and two answers to one question are worse than none.

#### Scenario: An assignment edited during a show does not reach the row on air

- **GIVEN** a row is on air, with a plate showing the source its take resolved
- **WHEN** the template's assignment for that plate is changed, from any surface
- **AND** the operator switches the row to another look
- **THEN** no producer change is issued for that plate, and the switch is a geometry move alone

#### Scenario: A re-take adopts the edited assignment

- **GIVEN** a row is on air and its template's assignment has since been changed
- **WHEN** the operator takes the row again
- **THEN** the plate is seated on the new source, and the row's snapshot is the new assignment

#### Scenario: A second row of the same template is pinned by its own take

- **GIVEN** a row of a template is on air, and the template's assignment is then changed
- **WHEN** a second row of the same template is taken
- **THEN** the second row resolves the new assignment and the first still resolves its own, with
  both on air at the same time

#### Scenario: An off-air row is not pinned

- **GIVEN** a row is loaded but not on air
- **WHEN** the template's assignment is changed
- **THEN** the row's next take uses the new assignment

#### Scenario: The emergency swap still reaches air on a pinned row

- **GIVEN** a row is on air and pinned to the assignment its take captured
- **WHEN** the operator points one of its plates at a different source as an emergency substitution
- **THEN** the substitution is on air in one action, and the row's snapshot is unchanged

#### Scenario: A bridge restart does not thaw a row that is on air

- **GIVEN** a row is on air and pinned, and the assignment has since been edited
- **WHEN** the bridge restarts and the row is restored from the browser's retention
- **THEN** the row still resolves the assignment its take captured, and the edit does not arrive

#### Scenario: The assignment editor says what a pinned row is actually on

- **GIVEN** a row is on air and the template's assignment for one of its plates has since changed
- **WHEN** the operator looks at that template's plate list
- **THEN** the picker shows the current assignment, and beside it the plate names the captured
  source and says it was frozen at take
- **AND** no such statement appears for a plate whose captured source and current assignment agree

### Requirement: The layout switch and the live-source change are ONE mechanism

A layout switch and a source change SHALL be served by a **single** reconcile. Changing which plates
exist and where, and changing what one plate shows, are the same operation: resolve the desired
live-plate set for the row, then apply the delta against what is currently seated.

That reconcile SHALL resolve plates through the SAME resolver a take uses. A layout switch that
resolved plates its own way would be a second spelling of "which producer is behind this hole", and
the two would eventually disagree about a plate that is on air — the argument the existing
`swapLiveSource` already makes for itself, applied one level up.

Under LOOKS (§14) the reconcile's INPUT is the active look's `{routeKey → rect}` map. A source
ABSENT from that map is absent from the look: the carrier never emits a zero-area rect, so absence
is the only spelling of "not shown here" and is what triggers the release rule below.

A plain look switch SHALL re-seat NO producer. A `PLAY` creates a fresh producer, and a live input
re-acquires visibly, so a switch that re-seated would produce exactly the re-acquire the held-source
rule exists to avoid. Only plates whose SEAT has changed — a different layer, or a different
producer — may be played; every other plate receives its new geometry and nothing else.

A TAKE is the same reconcile against an empty prior set, with two differences that both follow from
the single fact that the row is not yet on air: it re-asserts every plate (a re-take is the
operator's repair verb, and the ledger is a claim rather than a confirmation), and a failure rolls
back every layer it touched rather than only the plate that failed.

For every mutation the reconcile performs — the plate set, the punch mask, the fit, and the layer
allocation — the corresponding INVERSE SHALL exist and be exercised by a test.

#### Scenario: A layout switch and a source swap take the same path

- **WHEN** a layout switch and a per-plate source swap each change what is on air
- **THEN** both are applied by the one reconcile, and neither has a seating path of its own

#### Scenario: The mask follows the plates it belongs to

- **WHEN** a layout switch removes a plate from the active layout
- **THEN** the hole that plate punched is removed in the same change, so nothing below shows
  through where the plate used to be

#### Scenario: A plain look switch issues no re-seat

- **GIVEN** a row on air whose template authors several looks
- **WHEN** the operator switches to a look that shows a different set of sources
- **THEN** no `PLAY` is issued for any plate whose layer and producer are unchanged, and the layer
  allocation is identical before and after

#### Scenario: The fit is re-derived per look

- **GIVEN** a source whose box has a different size in the target look
- **WHEN** the look becomes active
- **THEN** that plate's `FILL` and `CLIP` are recomputed for the new box, so a change of box
  aspect changes the crop rather than leaving the previous look's crop on a picture that still
  renders

#### Scenario: A failure mid-switch leaves the working plates alone

- **GIVEN** a row on air, and a look that brings in a source that will not play
- **WHEN** the switch is applied
- **THEN** the switch is refused, only the plate that failed is undone, and every plate that was
  already on air keeps its producer — while the same failure during a TAKE rolls the whole row back,
  because a half-placed layer is worse on air than a black one

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

SEAT and PUNCH are separate mutations, on separate machines, and the held state SHALL be
representable as such: the bridge keeps the producer seated and records that the plate is not on
screen, while the page stops punching that plate's hole. A consequence is that a look switch never
frees a band layer, so the declared band must hold every DECLARED source rather than the largest
single look.

A plate the template NO LONGER DECLARES SHALL be torn down rather than held: no look can bring it
back, so holding it would strand a producer that neither teardown nor the orphan sweep will reach.

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

#### Scenario: A media clip is the kind that cannot be held

- **GIVEN** a plate assigned to a media clip, and a neighbouring plate assigned to a live input
- **WHEN** the operator switches to a look showing neither
- **THEN** the live input is held while the clip is torn down and announced with its reason, because
  a clip held across a look runs to its end and would come back black

### Requirement: The seated live-source layers are VISIBLE, and an adopted one is distinguishable from a stranded one

The layers the bridge itself has seated to composite live sources SHALL be **listed on an operator
surface**, and each row SHALL name the coordinate, the symbolic plate, the producer actually sent,
and **the stack item that owns it**.

This is `B-145` acceptance 1's first half. Its second half — that those layers are controllable —
is satisfied by the ITEM-scoped verbs that already reach a seated layer by `itemId`; the listing is
what makes them reachable, because an operator who cannot see which row owns a lit layer cannot use
them. A ledger that survives a restart while remaining invisible leaves a live face on air with no
handle to it, which is the defect the item describes.

The surface SHALL be **distinct from the surface that lists the station's own reserved layers**, and
the band SHALL NOT be surfaced by adding it to the reserved set. The two make opposite claims about
ownership — one says _these are not ours to touch_, the other says _we put that producer there_ —
and the reserved set additionally fences a layer out of placement, reservation and clearing, so a
band inside it would be unplaceable by the very allocator that must place it.

A live layer whose owning item the stack still carries SHALL offer **no destructive control on this
surface**; its verbs are its row's, and the operator-facing layer clear SHALL continue to refuse a
live-source coordinate by name. A live layer whose owning item the stack NO LONGER carries — a
**stranded** layer — SHALL be distinguishable at a glance and SHALL be releasable, through the same
item-scoped teardown rather than through a new coordinate-addressed clear.

The list SHALL be **pushed when the ledger changes** rather than polled, from the same single write
path that persists it, so a seat, a release, a hold and the boot adoption reach the surface by the
call that records them.

🔴 **The stranded verdict SHALL be withheld whenever the stack is not KNOWN, and not merely
whenever it is empty.** "Stranded" is decided by an item being ABSENT from the stack, and the ledger
and the stack are two independent snapshots that land separately — so a surface reading the stack
before it has arrived would report EVERY seated layer as stranded and offer to cut a guest who is
perfectly well owned. Not-yet-arrived and genuinely-absent are opposite statements about our
knowledge, and the surface SHALL say which it is.

Where the link to the bridge is down, or the stack has not yet arrived, the rows SHALL read as
**unknown** and offer nothing, and SHALL NOT raise attention: not knowing is not a claim that
anything is wrong. The precedence between those two conditions SHALL have ONE implementation, so two
surfaces cannot order them differently.

🔴 **A record ADOPTED from the persisted ledger SHALL be shown as unconfirmed until the bridge
itself writes it again.** The boot adoption reconciles against occupancy that is not knowable at
that moment — no session exists — so after a restart every record is a file claim and the server
may have come back black. Presenting one in the present tense would be the surface asserting an
on-air fact it cannot back, which is the demotion rule the stack status already obeys. The mark
SHALL clear on a first-hand write (a take, a look reconcile, a swap), not on a second reading of
occupancy, so the ledger keeps exactly one authority.

🔴 **A release offered here SHALL name every layer it will clear.** The teardown it invokes is
ITEM-scoped and an item may own several layers, so a control that named one coordinate while
clearing two would take a second source off air without telling the operator.

The stranded verdict SHALL be re-read at the moment the destructive step is taken, not only when
the control was drawn: an operator may leave a confirmation open, and a verdict that expired in
the meantime must not authorise a teardown.

An EMPTY list SHALL distinguish "nothing is seated" from "nothing has been read yet". The
per-row masking above cannot speak for an empty list, and a console that has never received the
ledger — because the link is down, or because the first read has not returned — must not report
that no live source is on air.

#### Scenario: An unarrived stack is not read as a stranded layer

- **GIVEN** seated live layers whose ledger has arrived and a stack snapshot that has not
- **WHEN** the operator opens the live-sources surface
- **THEN** the rows read as unknown and offer no release, rather than reading as stranded

#### Scenario: A reconnect does not strand everything

- **GIVEN** a restarted bridge serving its adopted ledger before the console has re-delivered its
  stack
- **WHEN** the operator opens the live-sources surface
- **THEN** no row reads as stranded and no release is offered, because an empty stack cannot
  distinguish "not delivered yet" from "nothing here"

#### Scenario: An adopted record is not asserted as on air

- **GIVEN** a bridge that has restarted and adopted its persisted ledger
- **WHEN** the operator opens the live-sources surface
- **THEN** each adopted row is shown as unconfirmed rather than as on screen, and says that
  taking its row again confirms it

#### Scenario: A release names every layer it clears

- **GIVEN** a stranded item owning two seated layers
- **WHEN** the operator releases one of them
- **THEN** the confirmation names both layers and states that releasing one releases both

#### Scenario: An empty list does not claim nothing is on air

- **GIVEN** a console whose link to the bridge is down, so the ledger has never been read
- **WHEN** the operator opens the live-sources surface
- **THEN** it says the state cannot be checked, rather than reporting that no live source is
  seated

#### Scenario: A seated live layer appears in a layer list

- **GIVEN** a row on air whose template declares live-source plates
- **WHEN** the operator opens the live-sources surface
- **THEN** each seated layer is listed with its coordinate, its plate, its producer and the row that
  owns it

#### Scenario: An adopted layer survives a bridge restart visibly

- **GIVEN** live plates seated and the bridge restarted
- **WHEN** the ledger is rebuilt from the persisted claim, corrected by the server
- **THEN** the adopted layers are listed and remain controllable through their owning row, rather
  than being invisible to every code path

#### Scenario: A producer that vanished server-side is not listed as seated

- **GIVEN** a persisted record whose layer the server reports as empty at boot
- **WHEN** the ledger is rebuilt
- **THEN** that layer does not appear in the list, because the server is the authority on what is on
  it

#### Scenario: A layer whose row is gone is shown as stranded and can be released

- **GIVEN** a seated layer whose owning item the stack no longer carries
- **WHEN** the operator opens the live-sources surface
- **THEN** the layer reads as stranded, and releasing it clears the layer through the item-scoped
  teardown

#### Scenario: A layer whose row exists offers no clear here

- **GIVEN** a seated layer whose owning item is on the stack
- **WHEN** the operator opens the live-sources surface
- **THEN** no clear is offered for it, and the row that owns it is named and reachable instead

#### Scenario: The list moves with the ledger

- **GIVEN** a console already showing the live-sources surface
- **WHEN** a plate is seated, released or held
- **THEN** the list changes without the console asking again

### Requirement: The operator switches a running row's look from a picker that IS the on-air readout

A row whose template authors looks SHALL carry an always-visible control that both STATES which
look is on air and SWITCHES it, in one action. The two SHALL be the same object: a readout that
could disagree with the control is the mistake the operator must not be able to make.

The control SHALL offer only AUTHORED looks and SHALL mark exactly one, so an invalid combination
is unrepresentable rather than defended against. It SHALL NOT offer an "off" entry — taking the row
off air remains the stop and clear verbs' job.

A row whose template authors NO looks SHALL carry no such control, and SHALL NOT be refused
anything on that account. A template that has a look group authoring ZERO looks is a different case
and SHALL be refused at the take, naming what is missing: it resolves no geometry, so every box
would go to air empty. **Having no look group and having a group with no looks SHALL be
distinguishable**, because the first describes every template authored before looks existed and
refusing those would take an installation's whole existing rundown off air.

Switching SHALL drive one path: the seated live sources are reconciled against the chosen look's
geometry, the page is told which look on the same payload that carries its data, and only then is
the look recorded — so the holes it punches and the fills behind them are one computation. The page
SHALL be told only after the reconcile succeeds, so a refused switch leaves the previous look intact
rather than painting new holes over producers at the old geometry.

**A REFUSED SWITCH SHALL LEAVE NOTHING BEHIND.** The record of which look a row is on is what every
later reconcile resolves its geometry from — including a source swap, which changes one plate and
tells the page nothing. A look recorded but never delivered to the page is therefore not an inert
note of intent; it is the geometry the next unrelated action will seat. So the record SHALL name the
look the PAGE IS PUNCHING and nothing else: it SHALL be written only where that is true, which is
when the page has been successfully told, or when there is no page yet and the next build will enter
that look from its own payload. A refused switch SHALL leave the row on the look it is showing, and
the control SHALL go on marking that look rather than the one that did not happen.

The switch SHALL be a cut, and therefore SHALL itself be the immediate action: v1 offers no other
transition mode, so there is no mode to choose and none to escape.

**Preset-then-take.** The operator SHALL be able to re-point a source BEFORE switching to the look
that shows it. A source with no place in the active look is held, so re-pointing it records the
change without moving anything on air, and it becomes visible at the moment of the switch. A source
that IS in the active look SHALL move immediately — that is the live repoint, and the two SHALL NOT
be conflated.

Where the operator cannot reach the playout server, the control SHALL remain PRESENT and become
disabled with the reason, never disappear: its absence means "this template has no looks", a
permanent fact, while unreachability is transient. It SHALL continue to show which look is live
while it cannot switch.

**An active per-row source override SHALL be visible wherever the surface states a plate's source.**
A surface that says when an assignment takes effect while showing the wrong current source is a
half-repair; the surface that carries the assignment SHALL also name the live path for changing what
is on air now.

#### Scenario: The picker states the live look before anyone has touched it

- **GIVEN** a row on air whose template authors several looks
- **WHEN** the operator looks at the row
- **THEN** the control marks the authored default, which is the look the take entered

#### Scenario: One action switches, and the readout follows

- **WHEN** the operator picks a different look
- **THEN** the live sources move to that look's geometry, the page is told which look, and the
  control marks the new look

#### Scenario: A switch between looks sharing no sources

- **GIVEN** one look showing two sources and another showing two entirely different ones
- **WHEN** the operator switches between them
- **THEN** the departing sources are held and the arriving ones are shown, each on its own layer

#### Scenario: A refused switch does not move a later source swap

- **GIVEN** a row on air whose switch to another look was refused
- **WHEN** the operator later re-points one source, an action that mentions no look
- **THEN** only that source's producer changes, every other box stays where the page is punching
  its hole, and the row is still on the look it was showing

#### Scenario: A preset applies on the switch, not before

- **GIVEN** a source with no place in the active look
- **WHEN** the operator points it at a different input
- **THEN** nothing on air changes, and the new input is showing once the operator switches to a look
  that includes that source

#### Scenario: A template with no looks authored is refused at the take

- **GIVEN** a template whose look group authors no looks
- **WHEN** the operator takes it
- **THEN** it is refused, naming that the template has no looks rather than failing silently

#### Scenario: A template predating looks is unaffected

- **GIVEN** a template authored without a look group
- **WHEN** the operator takes it
- **THEN** it goes to air as before and carries no look control

#### Scenario: An unreachable server disables the picker rather than removing it

- **GIVEN** a row with looks and no route to the playout server
- **WHEN** the operator looks at the row
- **THEN** the control is still there, still shows which look is live, and says why it cannot switch

#### Scenario: A patched row says so where its source is stated

- **GIVEN** a row whose plate has been pointed at a different source than its template assignment
- **WHEN** the operator opens the panel that states that plate's source
- **THEN** it shows what is actually on air and that this row is patched

### Requirement: The operator's primitive is ONE TOGGLE PER DECLARED SOURCE; the COUNT is derived

The row's always-visible control SHALL be **one toggle per declared source**, and **which toggles are
lit SHALL BE what is on air**. The operator SHALL NOT address a count directly: the count SHALL be
**derived** from how many toggles are lit.

The control SHALL NOT be a menu. The client's requirement is that the operator cannot be mistaken,
and a control that must be opened to reveal what is live gives no way to be sure without opening it.

On any toggle change the system SHALL resolve the derived count, activate **that count's authored
default arrangement**, and seat the lit sources into its cells in **declared order**. Exactly one
arrangement of one count SHALL be active at a time.

Choosing a **non-default arrangement** for the current count SHALL be possible and SHALL be an
**explicit** secondary action. The common case — changing which sources are on air — SHALL remain the
toggle itself, and SHALL NOT require choosing an arrangement.

Per-cell assignment is deliberately not provided: it introduces a cell as a separately addressable
identity, and the need for it is unproven.

#### Scenario: The operator solos one box of three

- **GIVEN** a running row with three sources lit
- **WHEN** the operator unlights two of them
- **THEN** the derived count is 1, that count's default arrangement is on air, and the single
  remaining source occupies its cell — in one action, with no arrangement chooser in the way

#### Scenario: Any combination is reachable, not just any count

- **GIVEN** a template declaring four sources
- **WHEN** the operator lights the first and the third only
- **THEN** those two are on air in the 2-box arrangement's cells in declared order, and the operator
  never had to express "two boxes" as a separate idea

#### Scenario: What is lit is what is on air

- **WHEN** the operator looks at the row without opening anything
- **THEN** the lit toggles are the sources on air, because the control is the state readout and the
  switch in one object

#### Scenario: A non-default arrangement is reachable but explicit

- **GIVEN** a count with more than one authored arrangement
- **WHEN** the operator wants the non-default one
- **THEN** they can select it explicitly, and the default is what a plain toggle change still gives

### Requirement: A shape the template does not have is REFUSED legibly, never truncated

Three situations SHALL be refused by **ONE refusal family**, with the same wording discipline: naming
what was asked for and what exists.

- Lighting **more toggles than the largest arrangement holds** SHALL be refused, naming **the number
  lit** and **the largest available**.
- Reaching a **count for which no arrangement is authored** SHALL be refused the same way, naming the
  count reached and the counts the template does author. Arrangements are NOT required for every
  count.
- **ALL TOGGLES OFF (count 0)** SHALL be treated as an ordinary count: if the template authors a
  0-cell arrangement it is activated, and if it does not, all-off SHALL be refused by this same
  family with the same wording.

None SHALL be resolved by silently dropping sources or by silently substituting another count. A
truncation would put a source off air without saying so, which is the failure the refusal exists to
prevent.

🔴 **All toggles off SHALL NOT be an implicit way to take the row off air.** The row already has a
STOP verb. A second, implicit route to off-air would be the quietest possible one — reached by an
operator unlighting the last box under time pressure — and STOP and CLEAR are the two verbs this
product deliberately inverts relative to the reference product, so a third spelling of off-air is
precisely the drift that must not be introduced.

#### Scenario: More sources than any arrangement can hold

- **WHEN** the operator selects five sources and the largest authored arrangement is 4-box
- **THEN** the action is refused with a message naming both the five requested and the 4-box maximum,
  and no source is silently dropped

#### Scenario: A count with no arrangement

- **WHEN** the operator's toggles reach a 3-box count on a template that authors only 1-box and 2-box
- **THEN** the change is refused in the same family and with the same wording discipline, rather than
  falling back to another count

#### Scenario: All toggles off, with no 0-cell arrangement authored

- **GIVEN** a template that authors 1-box, 2-box and 3-box arrangements and no 0-cell one
- **WHEN** the operator unlights the last lit source
- **THEN** the change is refused by the same family with the same wording, the row stays as it was,
  and the row is NOT taken off air — STOP remains the only way to do that

#### Scenario: All toggles off, with a 0-cell arrangement authored

- **GIVEN** a template that authors a 0-cell arrangement — the background alone
- **WHEN** the operator unlights the last lit source
- **THEN** that arrangement is on air, exactly as any other count's would be
