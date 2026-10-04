# designer-live-source

🔴 **SUPERSEDED IN PART by `derive-look-sources` (`B-188`), 2026-08-29.** The multi-frame group no
longer DECLARES its sources — the list is derived from the plates — so every clause below that
turns on a declared list has been overtaken. Specifically:

- _"A look group's DECLARED source SHALL keep requiring one"_ — there is no `LookSource` to require it.
- The refusal's two-way remedy (_"the `source` list"_ with a group, _"the `source id` box"_ without)
  — there is ONE control now, and one sentence.
- _"a source the group does not declare, shown as itself and marked as undeclared"_ — the
  `(undeclared)` mark is gone with the concept it named.
- The whole requirement _"A Live Source refusal names the remedy, not only the rule"_ — its subject,
  `look-source-undeclared`, is DELETED.

⚠ **The text is left INTACT rather than rewritten**, because this change is the record of what IT
shipped and its `tasks.md` is ticked against these words. `derive-look-sources`'s own delta carries
the replacements. What survives here unchanged and is NOT superseded: a new plate is born with no
source; `live-source-unset` blocks the export in DOCUMENT scope; the control never substitutes a value
and never repairs the scene; an export refusal is drawn in `danger`.

## ADDED Requirements

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
