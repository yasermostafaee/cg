# designer-countdown-steps Specification

## Purpose

TBD - created by archiving change add-azan-countdown. Update Purpose after archive.

## Requirements

### Requirement: A countdown's steps are ordered records of changes to elements

A `countdown` clock SHALL accept optional `steps`: an optional **Before** step, and an ordered list
of steps each with a `name`, an `atMs` threshold on REMAINING time, a list of CHANGES and an
optional transition. A positive `atMs` SHALL mean "when this much or less remains", `0` SHALL mean
**At zero**, and a negative `atMs` SHALL mean "this long after zero". Thresholds SHALL validate as
STRICTLY DECREASING across zero, and the validation SHALL name the offending row by its path.

A change SHALL name an element, a property and a value. The properties SHALL be show / hide,
opacity, text colour, background colour, fill, stroke, blink and picture; an element kind SHALL
offer only the properties it owns (`changePropertiesOf`), and a Live Source or a sound SHALL own
none. A step SHALL hold at most one change per property per element. The change record SHALL be
independent of what produced it, so a later rule engine (`D-139`) can produce the same records.

A step's transition SHALL be a cut or a fade of 1–10000 ms, 300 ms by default. Step names SHALL be
editable and SHALL default to `Step 1`, `Step 2` …; no product copy SHALL name an event.

Steps and the after-zero choice SHALL be countdown-only: the schema SHALL reject them on `wall` /
`countup`, and switching a clock away from countdown SHALL drop both.

#### Scenario: Thresholds out of order are refused, naming the row

- **WHEN** a step's threshold is not below the step above it
- **THEN** validation fails at that step's path, and nothing invalid is stored

#### Scenario: A kind offers only what it owns

- **WHEN** a change targets a rectangle
- **THEN** the properties offered are show / hide, opacity, fill, stroke and blink — never a text
  colour — and a Live Source is never offered as a target

#### Scenario: The preset names no event

- **WHEN** the author applies the preset
- **THEN** three steps at 60 / 30 / 10 minutes are written as ONE undo entry, each turning the
  countdown's own digits yellow, orange and red, named `60 min`, `30 min`, `10 min`

### Requirement: The active step is published once per crossing at the scope root

The clock driver SHALL publish the active step of a countdown as ONE attribute on the scope root of
the composition that owns it, written behind a latch — only when the selected step changes — so a
crossing flips the DOM exactly once and the per-second repaint discipline is unchanged.

The step SHALL be selected on the SAME signed one-second quantum the digits paint, before and after
zero, so a step changes on exactly the frame the digits reach its threshold. `reset()` SHALL clear the
attribute so a fresh run re-enters at the correct step.

#### Scenario: One write per crossing

- **WHEN** a countdown with steps at 60, 30 and 10 minutes runs from 62 minutes through zero
- **THEN** the step attribute is written three times, in order — and never between crossings

### Requirement: A change sets one property of one element and reverts when its step is left

Entering a step SHALL apply its changes; leaving it SHALL return each changed property to its
authored value unless the step entered sets that same property. Colours SHALL resolve through
inherited custom properties; opacity, show / hide and blink SHALL act on a layout-transparent wrapper
so a step's opacity multiplies the element's animated opacity; a picture swap SHALL be a cut. An
element authored hidden that a step shows SHALL be built visible and rest at opacity 0.

#### Scenario: Leaving a step reverts what the next one does not set

- **WHEN** step 1 turns a rectangle red and hides a label, and step 2 turns the rectangle orange
- **THEN** on entering step 2 the rectangle turns orange and the label shows again

### Requirement: A countdown reaches its own composition and the instances inside it, and the nearest wins

A countdown's steps SHALL reach the elements of its own composition and of compositions instanced
inside it, but NOT the elements inside a nested composition that has a countdown with steps of its
own — that countdown SHALL govern its own subtree. The Designer SHALL offer as targets exactly the
elements a step can reach, each named by its layer name, with the instances it sits inside.

#### Scenario: A nested countdown governs its own subtree

- **WHEN** a host composition and a nested one both have countdowns with steps
- **THEN** the host's steps never change an element inside the nested composition, and the Designer
  never offers one

### Requirement: Showing or hiding a composition instance plays its own entrance or exit

A show / hide change on a composition instance SHALL cue the instance's OWN entrance or exit through
the existing nested lifecycle — never a second lifecycle, and never the step's fade. An instance MAY
be authored **Starts hidden**; the Designer SHALL state that as a fact on the canvas's layer row and
in the Inspector. At Take, an instance the current step shows SHALL enter with the graphic; at the
graphic's exit, shown instances SHALL exit by the cascade. A step change arriving mid-entrance or
mid-exit SHALL take the engine's own behaviour (a hide mid-entrance jump-cuts to the exit; a show
mid-exit restarts the entrance). No step SHALL change an element's geometry directly (owner's
decision, recorded in the PRD).

#### Scenario: A hidden instance enters on its step

- **WHEN** an instance that starts hidden is shown by the 10-minute step
- **THEN** it becomes visible at that crossing and its own entrance runs

### Requirement: What the countdown does after zero is the author's choice

A countdown SHALL offer four after-zero behaviours, authored in the Designer and read-only elsewhere:
**Hold at zero** (the default, stored as nothing), **Count past zero** (`−00:12`; it SHALL NOT end a
content-driven hold), **Hide the digits**, and **Close the graphic** (the At-zero step, then the
existing content-driven completion path — the page reports completion and the bridge sends its
existing `CG <channel>-<layer> STOP 0`; no `CLEAR` the operator did not cause). When the composition's
hold cannot be ended that way, the Designer SHALL state it as a FACT, never as a disabled control.
Steps after zero SHALL be reached with count-past, hold and hide, and with close only during the exit.

#### Scenario: Count past zero keeps the hold

- **WHEN** a countdown counting past zero drives a content-driven hold
- **THEN** the digits read `−00:12` twelve seconds after zero and the graphic stays

#### Scenario: Close under a hold it cannot end is a stated fact

- **WHEN** the author chooses Close the graphic in a composition whose hold is manual
- **THEN** the Inspector shows the fact "Hold is not content-driven — the graphic stays"

### Requirement: Steps are compiled from the scene by the runtime, identically in preview and on air

The step stylesheet SHALL be compiled from the scene by the runtime at build time and injected
beside the baseline stylesheet; neither exporter SHALL carry a steps code path beyond collecting a
step's picture as an asset, so the Designer preview and the exported page run the same compiler over
the same scene. The compiled CSS SHALL stay within the CasparCG CEF floor (Chromium 71) and SHALL
NOT place author strings in selector or property positions. The bridge SHALL send nothing new.

#### Scenario: Preview equals export

- **WHEN** the same scene is previewed and exported
- **THEN** both compile byte-identical step rules, and the export's step-image assets are present

### Requirement: D-141 zones migrate to steps with the same on-air result

A scene authored with D-141 v1's `zones` and `zoneOverrides` SHALL open and render as before: a
registered scene migration (`migrateCountdownZones`) SHALL rewrite each zoned countdown's zones into
steps (the base zone into Before, each zone into a step at its threshold, keeping the zones' 400 ms
morph as a fade) and every override into the change it stood for, through the same reach and the
same palette the zone stylesheet used, dropping what that stylesheet dropped. The legacy keys SHALL
stay parseable so a template exported before this change still loads. Two deviations SHALL be
stated, not hidden: a loop restart returns an element to its authored colours by a cut where zones
morphed, and two zoned countdowns in ONE composition each get the changes for their own keys.

#### Scenario: A zoned scene renders the same after migration

- **WHEN** a scene with a 4-zone countdown and opted-in elements is opened
- **THEN** it renders the same colours at the same thresholds, now stored as steps

### Requirement: The Designer edits steps in one Steps dialog and the Inspector keeps a summary

The Inspector SHALL show a SUMMARY only. On the countdown: After zero, one line per step
(`30 min · ≤ 30 min · 1 change`) and `Edit steps…`. On an element a step changes: one line per step
that changes it, with each change as a chip (a colour shown with its own swatch), and
`Edit in steps…`, which opens the same dialog filtered to that element. No inline editor and no bare
icon SHALL remain in the Inspector.

The Steps dialog (the shared Modal) SHALL hold the countdown's name, After zero, the preset and a
rehearse strip; the steps as a list — the **Default** row (the look before the first step, the
schema's Before) pinned first and ALWAYS offered, so the countdown's default colours can be chosen
even before it changes anything, At zero pinned between the steps before
and after zero — reordered by a drag handle or ↑ / ↓ on it, each with a `⋯` menu of WORDS
(`Duplicate step`, `Delete step`); and the selected step in short lines (name; when; transition) with
its changes as a table (`Element | Property | Value | ⋯`, the menu saying `Delete change`), a
composition instance's values reading `Show (entrance)` / `Hide (exit)`. Every icon button's
accessible name and tooltip SHALL name its object. Every edit SHALL apply at once as ONE undo step,
`Ctrl+Z` SHALL work with the dialog open, and an undo SHALL never close it; a destructive action SHALL
say so with its own Undo. A reorder SHALL move a step's name, changes and transition while the
thresholds stay in order. The dialog SHALL fit at 1280 × 720 and at 200 % text, in RTL, with its
footer inside it.

#### Scenario: The Inspector shows the summary only

- **WHEN** a countdown with the preset is selected
- **THEN** its Steps section lists three lines and `Edit steps…`, with no threshold input, no change
  row and no remove icon

#### Scenario: An element opens the dialog filtered to itself

- **WHEN** the author presses `Edit in steps…` on a rectangle
- **THEN** the dialog opens with the element filter set to that rectangle and its changes only

#### Scenario: A delete is undone with the dialog open

- **WHEN** the author deletes a change by its `⋯` menu and presses `Ctrl+Z`
- **THEN** the change returns and the dialog stays open

### Requirement: Steps can be rehearsed without waiting for real time

The Designer SHALL rehearse steps three ways, all session-only and never saved or exported: a
TIME-COMPRESSION rehearsal in the Preview through the runtime's injectable clock (the real driver,
the real thresholds, in order); a forced step in the Preview (Before → steps → At zero) with nothing
running; and the Steps dialog's rehearse strip, which shows a step on the CANVAS while the dialog is
open and hands the countdown back to live when it closes.

#### Scenario: A compressed rehearsal crosses every step in order

- **WHEN** the author rehearses a 60 / 30 / 10-minute countdown at ×600
- **THEN** every threshold is crossed in order, each written once

#### Scenario: The rehearse strip drives the canvas

- **WHEN** the author picks `10 min` on the strip and then closes the dialog
- **THEN** the canvas shows the 10-minute step's changes, and live again after closing
