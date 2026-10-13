# runtime-ui

## ADDED Requirements

### Requirement: The Inspector states a row's timing and offers the operator's half of it

The Inspector SHALL present a Timing section for a selected row whose template carries timing metadata.

The section SHALL state `mode` and `hold` as non-interactive FACTS, and SHALL offer controls for
the pass count and the gap between passes ONLY where the MODE IT STATES is `loop-cycle`.

⚠ **AMENDED 2026-09-16 (owner) — this used to read "only where the template actually loops",
meaning the derived `loops` bit, and that was wrong on the plant.** `loops` answers "does ANY
scope in this template repeat", and the honest answer is often "yes, a decoration does". On the
news ticker the section stated `Auto-out` / `Content-driven` while offering a count that reached
only a nested blinking dot, so the operator changed the numbers and nothing he could see
happened. A control that steers another scope is worse than no control.

The HOLD SHALL NOT decide: `loop-cycle` with a timed hold and `loop-cycle` with a content-driven
hold both keep the controls.

The facts SHALL be stated in the short form, with any longer wording reachable only from
the element's `title`.

#### Scenario: A loop-cycle template gets facts and controls

- **WHEN** the operator selects a row whose template states mode `loop-cycle`
- **THEN** the section states the mode and the hold source, and offers a pass control
  and a gap control

#### Scenario: The hold source does not decide

- **WHEN** the stated mode is `loop-cycle` and the hold source is content-driven
- **THEN** the pass control and the gap control are still offered

#### Scenario: A manual, auto-out or static template gets facts and no pass controls

- **WHEN** the operator selects a row whose stated mode is `manual`, `auto-out` or `static`
- **THEN** the section states the mode and the hold source, and offers neither a pass
  control nor a gap control

#### Scenario: Something looping INSIDE a non-looping graphic changes nothing

- **WHEN** the row's stated mode is not `loop-cycle` and a nested scope in the same template does loop
- **THEN** no pass control and no gap control are offered, and no authored default count is stated

### Requirement: The rehearsal preview plays the operator's pass timing

PVW SHALL play the pass count and the between-pass gap the operator has set, exactly as a take would.

The value SHALL be the EFFECTIVE one — the staged draft layered on the stored override — through
the SAME builder that decides what an UPDATE press sends, so a row whose pass controls are hidden
gets no timing in the preview either. A row with NO override SHALL reach the page with no timing
at all, so the page runs its authored default.

⚠ **ADDED 2026-09-16 (owner).** PVW ran the authored defaults: its payload carried the fields and
the active look and nothing else, so a row set to `Count 1` rehearsed at whatever the author
wrote, and pressing `Update` changed nothing there either.

The timing SHALL ride the PLAY always, because a play seats the count as a total. It SHALL ride an
UPDATE only on the first boot and when the timing value itself changes. It SHALL NOT ride an
update carrying an unrelated field or look change: on a running page the count is "passes
remaining from now", so re-sending it with every keystroke would re-arm the run.

#### Scenario: A rehearsing row is told the operator's count

- **WHEN** a row whose template loops has a pass count set and is put on PVW
- **THEN** the preview page is told that count, before it is played

#### Scenario: A field edit does not re-arm a running preview

- **WHEN** the operator types into an unrelated field while a rehearsing page is running
- **THEN** the field edit reaches the page and the number of pushes carrying timing does not change

#### Scenario: A row whose pass controls are hidden gets no timing in the preview

- **WHEN** a row whose stated mode is not `loop-cycle` is put on PVW
- **THEN** its preview payload carries no timing member

#### Scenario: The preview payload still carries no take token

- **WHEN** any row is put on PVW
- **THEN** the payload carries no take token, so the preview can neither spend nor fire a real row's completion

### Requirement: The pass control states which reading it is in

The pass control's label SHALL change with the row's air state: ON AIR it is PASSES
REMAINING FROM NOW — the pass on screen is not one of them, and `0` means "out after this
pass" — and OFF AIR it is the count for the next take. The same field means two different
quantities, and the label is what says which.

ON AIR the control SHALL display NO number, neither as a value nor as a placeholder,
because no return path carries the page's live counter: the console can only ever know
what it SENT. It SHALL instead state what was sent, as a fact about the past.

OFF AIR the control SHALL display the stored count, and SHALL name an inherited value as
inherited rather than showing it bare, so an operator can tell a value they chose from one
they were given.

#### Scenario: On air the label is remaining and the box is empty

- **WHEN** the row is on air
- **THEN** the control is labelled for passes remaining, shows no number and no
  numeric placeholder, and a separate line states what this console last sent

#### Scenario: Off air the label is the next take and the box shows the stored count

- **WHEN** the row is off air and a count is stored for it
- **THEN** the control is labelled for the next take and shows that count

#### Scenario: An inherited value is shown as inherited

- **WHEN** the operator has stored no count and the template authored one
- **THEN** the control names the inherited value as a default rather than showing it
  as though the operator had chosen it

### Requirement: The infinite choice is a labelled two-state control

The choice between "run a count" and "run until stopped" SHALL be a labelled two-state
control that SHOWS which of the two is selected, and SHALL NOT be a bare glyph. The
selected state SHALL be carried by one attribute that both the paint and a screen reader
read, so the two can never disagree.

The count input SHALL belong to the count state and SHALL NOT be rendered beside the
until-stop state.

#### Scenario: Both states are named and the selection is visible

- **WHEN** the operator opens the Timing section on a looping row
- **THEN** both states are named in words, the selected one is visibly distinguished
  from the unselected one, and the distinction follows the selection when it changes

#### Scenario: Choosing until-stop removes the count box

- **WHEN** the operator chooses the until-stop state
- **THEN** no count input is rendered

### Requirement: A timing edit is a draft, spent by the row's one commit

A typed count or gap, and a choice of the two-state control, SHALL stage as a DRAFT. The
section SHALL send nothing on blur, on focus loss or on a row change. The row's `Update` /
`Update on air` SHALL spend the draft together with the row's field and position edits in
ONE press, and `Discard` SHALL drop it with them. The commit bar's dirty mark SHALL answer
for a staged timing edit.

A typed value SHALL remain visible after a blur, and a REFUSED value SHALL remain in the
box for the operator to correct.

After an accepted send the draft SHALL be cleared; after a REFUSED send it SHALL be kept.

#### Scenario: A blur sends nothing and keeps the value

- **WHEN** the operator types a count and clicks elsewhere on the panel
- **THEN** no command is sent, and the typed value is still visible

#### Scenario: Update spends the draft once

- **WHEN** the operator presses Update with a timing edit staged
- **THEN** exactly one timing command is sent, carrying the staged values

#### Scenario: Discard drops it with the rest

- **WHEN** the operator presses Discard with a timing edit staged
- **THEN** the draft is gone and a later Update sends no timing command

#### Scenario: A refusal keeps the draft

- **WHEN** a timing command is refused
- **THEN** the refusal is reported on the persistent surface and the draft is kept,
  so the operator's value is still theirs to retry

### Requirement: An operator surface states facts and refusals, and does not teach

The Timing section SHALL carry no explanatory prose: labels, values, state facts and
refusal sentences only. A sentence explaining how the feature works belongs in the docs
and in training, and the long form of a word belongs in its `title` at most.

A non-count SHALL be refused with a reason and SHALL NEVER be silently rewritten to a
plausible number. `0` is an instruction, not an absence, and SHALL reach the bridge.

#### Scenario: No explanatory sentence is rendered

- **WHEN** the Timing section is rendered in any air state
- **THEN** it contains no sentence explaining how passes, gaps or modes work

#### Scenario: A non-count is refused with a reason

- **WHEN** the operator types text that is not a pass count
- **THEN** the refusal says so, nothing is sent, and no value is rewritten

#### Scenario: Zero is an instruction

- **WHEN** the operator sets a count of `0`
- **THEN** it is accepted and carried, rather than treated as an empty box

### Requirement: A template whose timing metadata is absent or stale says why

The section SHALL state that a template needs re-importing where its timing metadata is
absent or was produced by a superseded derivation — rather than rendering nothing, and
rather than stating the stale facts. A record from a superseded
derivation is WRONG, not merely old, and a console that is confidently wrong is the one
thing an operator cannot defend against.

While the template's metadata has not yet been fetched, the section SHALL state nothing —
"not known yet" is not "known to be old", and flashing the sentence at every row selection
would make it noise.

#### Scenario: An old import asks for a re-import

- **WHEN** the selected row's template carries no timing metadata
- **THEN** the section states that the controls appear after a re-import, and states
  no mode or hold facts

#### Scenario: A stale derivation is refused, not displayed

- **WHEN** the metadata was produced by a derivation older than the current one
- **THEN** it is treated exactly as absent

#### Scenario: Nothing is said while the metadata is still being fetched

- **WHEN** the template metadata has not yet arrived
- **THEN** the section renders nothing at all

### Requirement: The audit log records a timing set and the value asked for

An accepted per-row timing set SHALL be written to the audit log as its own action, at its
real outcome, carrying the row's ids and the values the operator ASKED FOR — not the row's
resulting merged state. A REFUSED set SHALL be recorded as a refusal with its existing
reason code. A call that states neither a count nor a gap SHALL write NO entry.

The record SHALL hold the values as data; the SURFACE SHALL do the wording.

#### Scenario: An accepted set is recorded with its value

- **WHEN** an operator sets a pass count on a row
- **THEN** one entry is written naming the row, the template, the layer and the count

#### Scenario: An off-air set is recorded too

- **WHEN** an operator sets a count on a row that owns no live seats
- **THEN** an entry is still written, because the next take carries the value

#### Scenario: A no-op writes nothing

- **WHEN** a timing call states neither a count nor a gap
- **THEN** no entry is written
