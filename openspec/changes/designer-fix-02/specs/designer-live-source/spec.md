## RENAMED Requirements

- FROM: `### Requirement: A new Live Source plate is created with NO source, and the refusal says so`
- TO: `### Requirement: A drawn Live Source plate is named automatically and says so, and a plate with no source is refused`

## MODIFIED Requirements

### Requirement: A drawn Live Source plate is named automatically and says so, and a plate with no source is refused

A Live Source plate drawn with the canvas tool SHALL be named automatically (`B-187`, the owner's
decision 2026-10-14, Q2 (c)): its `routeKey` SHALL be the next free `live-N` IN ITS LOOK — free
among the keys of the plates that are on air with it: the look's own plates and the plates outside
every look when it is drawn inside a look's composition, and every plate in the project otherwise —
and the plate SHALL carry `routeKeyAuto: true` until the author keeps the name or commits another
id. The Inspector SHALL mark such an id "auto" — a fact, titled "Named automatically when the plate
was drawn. Keep it, or type your own." — beside a control that keeps it. An unchanged commit of the
field SHALL NOT confirm it; committing a different id SHALL make it the author's; clearing the field
SHALL unassign the plate and drop the mark. Nothing reaches air differently: the Live Source carrier
never emits `routeKeyAuto`, and the operator maps the id in CG Control as any other. A plate created
any other way (the element factory, a paste) SHALL still be born with no source. Creating a plate
SHALL NOT add anything to a multi-frame group's source list.

The element schema SHALL therefore permit an absent `routeKey`, so an unassigned plate is storable.
A look group's DECLARED source SHALL keep requiring one: a plate may not yet have a source, a
declaration always names one.

An unassigned plate SHALL be refused by the export preflight with `severity: 'error'` under its own
code, distinct from the code for a plate that references a source the group does not declare. The
two are different mistakes with different remedies and SHALL NOT share a message. The refusal SHALL
be raised whether or not the template declares a multi-frame group.

The refusal SHALL NOT be raised as a malformed-id error: an absent source is a deliberate state,
not a typo, and a message quoting `"undefined"` names a value the author never entered.

#### Scenario: Drawing a plate names it automatically, marked auto

- **WHEN** the author draws a Live Source with the canvas tool in an empty template
- **THEN** the created element carries `routeKey: "live-1"` and `routeKeyAuto: true`, its bars read
  `live-1`, the Inspector marks the id "auto", and the export is not blocked
- **AND** the multi-frame group's source list is unchanged

#### Scenario: Two drawn plates get two names

- **WHEN** the author draws two plates in one template without looks
- **THEN** they are named `live-1` and `live-2`, and neither one-seat refusal fires

#### Scenario: A name is free per look

- **WHEN** look A holds `live-1` and `live-2`, look B holds `live-1`, and the author draws a plate
  in look B's composition
- **THEN** it is named `live-2`; drawn in look A's it is named `live-3`; a plate outside every look
  takes its key out of every look's sequence

#### Scenario: Keeping, renaming and clearing

- **WHEN** the author keeps the automatic id **THEN** the mark goes and the id stays
- **WHEN** the author types another id **THEN** the mark goes and the typed id is the plate's
- **WHEN** the field is only focused and left **THEN** the mark stays
- **WHEN** the author clears the field **THEN** the plate has no source and no mark, its bars read
  `no source`, and the export refuses it

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

## ADDED Requirements

### Requirement: One source on several plates is refused in a template without looks

The export preflight SHALL refuse, as an error, a template WITHOUT a look group in which more
than one rendered plate names the same source id (`live-source-repeated`), whether the plates
are copies of one composition instanced more than once or separate plates set to one source.
Every plate in such a template is on air at once, and one source is one seat, so all but one of
the plates would stay empty on air. The refusal SHALL name every copy in the author's words —
a copy of a composition by its instance's name (or, unnamed, by where it sits), a separate plate
by its own name — SHALL name the composition when the copies are of one composition, and SHALL
say what to do instead. Each copy SHALL be marked on the canvas. A template WITH a look group is
judged per look by `look-source-duplicate` instead, where the same source in different looks is
legitimate. The code SHALL NOT be the bridge's `live-source-duplicate`.

#### Scenario: Two copies of one box composition are refused, naming both

- **WHEN** a template without a look group instances one composition holding a plate on
  `guest-1` twice, as "Box left" and "Box right"
- **THEN** export is refused with one error per copy, each reading: Source "guest-1" is shown in
  2 places — "Box left" and "Box right", copies of composition "Guest box". One source is ONE
  seat, so only one of them can get the picture and the others stay empty on air. Make one
  composition per box, each plate with its own source id.
- **AND** both copies are marked on the canvas

#### Scenario: Two separate plates on one source are refused the same way

- **WHEN** two separate plates in a template without a look group are both set to `guest-1`
- **THEN** export is refused naming both plates, ending "Give each plate its own source id."
- **AND** setting the second plate to `guest-2` clears the refusal and both marks

#### Scenario: One instance is not refused

- **WHEN** a template has one instance of a box composition
- **THEN** nothing is refused for its source

#### Scenario: Two different compositions with distinct sources are not refused

- **WHEN** two different compositions each hold a plate with its own source id
- **THEN** nothing is refused, because that is the correct authoring shape
