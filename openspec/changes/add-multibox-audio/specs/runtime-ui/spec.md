# runtime-ui

## ADDED Requirements

### Requirement: Every seated live plate shows its audio state without opening anything

The LIVE SOURCES tab SHALL show, for every seated live plate, an **audio strip** carrying: a
**state pill**, a **fader**, an **ON/OFF** control, a **SOLO** control and a **percentage
readout**.

The strip SHALL read the intent the bridge published (`plateVolumes`), never a locally derived
guess, so that what the console shows and what the bridge holds cannot disagree.

The fader SHALL commit on RELEASE, not on every drag frame — one AMCP command per decision
rather than one per pixel.

An intent of `0` SHALL read as a chosen silence and SHALL NOT be rendered as "no value".

#### Scenario: A raised plate is legible from the panel alone

- **WHEN** a plate's published intent is `1`
- **THEN** its row in LIVE SOURCES shows an audible state pill and a readout of `100%`, with no
  dialog opened

#### Scenario: A muted plate is distinguishable from one nobody has set

- **WHEN** one plate's published intent is `0` and a sibling has no entry at all
- **THEN** both read as silent and neither is shown as carrying a raised volume

### Requirement: A HELD plate reads as armed-but-not-audible, and its controls stay live

A plate that the bridge reports as **held** SHALL read as **armed, not audible — hidden by this
look**. It SHALL NOT read as silent-and-fine, and it SHALL NOT be greyed out.

Grey reads as disabled. The control stays live because **arming a held plate's audio before
switching to the look that shows it** is precisely the affordance the mute rule exists to
preserve.

#### Scenario: A held plate with a raised intent

- **WHEN** a plate is held and its recorded intent is `1`
- **THEN** its strip says it is armed and not currently audible because the active look does not
  show it, and its fader, ON/OFF and SOLO controls remain operable

### Requirement: ON/OFF returns to full volume and says so

The **OFF** control SHALL write `0`. The **ON** control SHALL write `1`.

**ON SHALL NOT restore the fader value that was in force before OFF.** The surface SHALL state
this in words, so an operator is not left to discover it under pressure.

#### Scenario: OFF then ON does not return to the previous fader value

- **WHEN** a plate is at `40%`, OFF is pressed, and ON is pressed
- **THEN** the plate's intent is `1` (full volume), and the control's own labelling has already
  told the operator that ON means full rather than "back to where it was"

### Requirement: SOLO and PANIC are single presses that promise no restore

**SOLO** SHALL raise the chosen plate and silence every sibling plate of the same item in ONE
action. **PANIC** SHALL silence every plate of every item the console reads as on air, from the
head of the LIVE SOURCES panel.

Neither SHALL present an undo, an "un-solo", or any wording that implies the previous levels
are remembered.

PANIC SHALL report what it addressed, so that a press that reached nothing cannot read as a
success.

#### Scenario: SOLO leaves one plate up

- **WHEN** SOLO is pressed on one plate of a four-plate row
- **THEN** that plate's intent is `1`, its three siblings' intents are `0`, and no control
  offers to restore the previous levels

#### Scenario: PANIC silences the on-air rows

- **WHEN** PANIC is pressed while two rows are on air and one is idle
- **THEN** every plate of the two on-air rows is set to `0` and the operator is told how many
  plates were silenced

### Requirement: The layer row carries a compact read-only audio summary, outside the verb grid

A row whose template declares live plates SHALL carry a **compact, read-only** audio summary
(for example `audio 2/4`), so an operator scanning the table can see that a row has sound
without opening anything.

It SHALL be **read-only** and SHALL sit **outside** the row's six-column verb block. It SHALL
NOT add a column to the row grid, SHALL NOT change the verb count, and SHALL NOT introduce a
conditional control into that block — the sticky header prints the word above each glyph, and a
control that appears and vanishes puts every header word above the wrong glyph.

#### Scenario: A four-plate row with two plates raised

- **WHEN** a row's template declares four live plates and two of them carry a non-zero intent
- **THEN** the row shows `audio 2/4` beside its name, the verb block still renders exactly six
  buttons, and each header word still sits above its own glyph

### Requirement: The PVW overlay marks each box with its audio state

The PVW live-plate overlay SHALL carry, per box, a small **audio glyph** reading **audible**,
**silent** or **held**.

It SHALL sit inside the existing placeholder chip and SHALL NOT weaken the placeholder's
unmistakably-not-a-picture rendering.

#### Scenario: A rehearsing row's boxes say whether they have sound

- **WHEN** a row is rehearsing with one plate raised and one muted
- **THEN** each box's placeholder carries a glyph saying which of the two it is

### Requirement: No audio surface in this change is drawn as a meter

Every audio state indicator introduced here SHALL be a **PILL**. There SHALL be **no bar, no
needle and no meter shape** anywhere in this change.

An **intent** pill states what was asked for. A **meter** would state that sound is present.
They are different claims, and until the plant measurement establishes that a per-input level
is available at all, only the first is knowable — a pill drawn as a meter would be a
confidently-wrong surface.

#### Scenario: A plate raised to 100% with a dead input

- **WHEN** a plate's intent is `1` and its input is carrying silence
- **THEN** the console shows a raised INTENT, and shows nothing that claims sound is present
