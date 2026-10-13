## ADDED Requirements

### Requirement: The channel tabs are a finished control whose active channel is unmistakable

The header's channel tabs SHALL be styled by class from the token home, with no rule under the
strip and none under an inactive tab. The active tab SHALL be a filled box — the reference channel
switcher's own fill and line (`docs/ui-reference/runtime-redesign/01-template-picker.html:202-205`)
— with text at AA contrast or better, and SHALL still read with an amber or red strip mark on
either tab. Inactive tabs SHALL be neutral. A single declared channel SHALL render as one active
tab. The arrow keys SHALL move focus between the tabs, Home and End to the ends, with focus
visible; Enter or Space selects.

#### Scenario: The active tab differs measurably and carries no underline

- **WHEN** two channels are declared and channel 1 is selected
- **THEN** the active tab's background and text colour differ from the inactive tab's, and neither
  the strip nor the inactive tab draws a bottom border
- **AND** selecting channel 2 moves the active state to it (the control)

#### Scenario: Arrows move focus between tabs

- **WHEN** a channel tab has focus and the operator presses ArrowRight
- **THEN** focus moves to the next tab and stays visible, and the selected channel changes only on
  Enter or Space

### Requirement: The picker's divider spans the body whatever the list's length

The line between the picker's list and its details aside SHALL run from under the tools row to the
footer, whatever the number of templates, by the dialog's layout and never by a fixed height.

#### Scenario: One template, many templates

- **WHEN** the picker lists one template, and again when it lists many
- **THEN** the aside's height equals the layout's height, which fills the body down to the footer

### Requirement: Channels are picked with checkboxes, in first-run and in Change channel

Each channel offered by first-run's channel step and by Station setup → `Change channel…` SHALL be a
row with a checkbox — the shared `Checkbox` primitive in `renderer/ui/`, a native checkbox styled
only by tokens — its name in its own `<bdi>`. Clicking the row or the box, or Space on the focused
box, SHALL toggle it, with focus visible. Both surfaces SHALL render the ONE `ChannelStep`
component. Every existing rule SHALL hold: first-run preselects nothing; `Change channel…` starts
with the declared channels checked; the "already on air" warning and `Use these channels anyway`;
the label `Use this channel` / `Use these channels` follows the count; a channel the account may
not hold or the lock covers is refused as before.

#### Scenario: Two can be checked

- **WHEN** the operator checks two channels
- **THEN** both boxes are checked and the button reads `Use these channels`
- **AND** with one checked it reads `Use this channel` (the control)

#### Scenario: Space toggles the focused row

- **WHEN** a channel's checkbox has focus and the operator presses Space
- **THEN** it toggles

### Requirement: A passing check line's mark is a calm green that is not the on-air green

A passing line of the connection check SHALL carry its ✓ in the `checkPass` token — a green of lower
saturation and brightness than `onAir`, at AA contrast or better on the panel ground — wherever
`ConnectionCheckList` renders. Only the pass icon SHALL use it: the line's text keeps its ink, and
`fail`, `warn`, `wait`, `skip` and `checking` are unchanged. `onAir` SHALL stay reserved for air.

#### Scenario: Pass is green, fail is still the error ink

- **WHEN** a passing line and a failing line render
- **THEN** the passing icon's colour is `checkPass`, which is not `onAir`, and its text colour is
  unchanged
- **AND** the failing line still uses the error ink (the control)

### Requirement: Every channel name carries its output state, and the playlist is information only

The console SHALL show the Playout's `output` for a channel before every name of it — the header's
tabs, the channel rows of first-run and `Change channel…`, and Station setup's channel subtitle:
`on-air` a small filled dot in the `onAir` green; `off` a small hollow neutral ring;
`unknown`, a missing field, an unknown value, a failed read or an unreachable Playout NO dot — no
element at all, so nothing can read as a grey ring. The dot's `title` and accessible name SHALL
read `On air` / `Off air`, then the playlist state's tag when there is one; `Output unknown` is said
by the PROGRAM head's tag. The playlist state SHALL NEVER change a
colour, except `unlicensed`, which also raises the channel's AMBER strip mark and one
channel-scoped line: `Unlicensed in the Playout — this channel is cleared every minute.` The dot
SHALL never mean the console's own connection. The alarm mark SHALL stay after the name, the dot
before it.

The PROGRAM monitor's head SHALL be green (`onAir`) only while its channel's `output` is `on-air`,
and neutral otherwise, with a neutral `Output unknown` tag when it is unknown; the playlist state
SHALL be a small neutral tag in the head in the Playout's own words, never changing the green. The
return-feed words stay as they are.

#### Scenario: The owner's multi-box case

- **WHEN** a channel's `output` is `on-air` and its `playlist` is `stopped`
- **THEN** its dot is filled green and the PROGRAM head is green, with a neutral `Playlist stopped`
  tag

#### Scenario: Off and unknown

- **WHEN** `output` is `off`
- **THEN** a grey ring and a neutral head
- **WHEN** `output` is `unknown`, missing, or the read failed
- **THEN** no dot, a neutral head and the `Output unknown` tag

#### Scenario: Only output changes the colour

- **WHEN** only `playlist` changes
- **THEN** the tag changes and no colour does
- **WHEN** `output` changes
- **THEN** the dot changes after the next read (the control)

#### Scenario: Unlicensed raises the amber mark

- **WHEN** a channel's `playlist` is `unlicensed`
- **THEN** its tab carries the amber strip mark and the channel's view shows the one line; the
  other channel's view shows only the mark
