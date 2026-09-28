## ADDED Requirements

### Requirement: Source defaults SHALL belong to a channel

A template's Source defaults SHALL be kept per channel: an assignment carries the channel it belongs to, and the
store SHALL be keyed (channel, template, plate). Changing a default on one channel SHALL NOT change any other
channel's. Every reader — the take, a look switch, a swap, a restore, the Inspector's `Default (…)`, the Source
defaults dialog and the preview — SHALL read a plate's default through ONE function over the row's own channel,
so no two of them can disagree about which default a plate uses.

An assignment written without a channel (a file from before this requirement) SHALL answer on a channel only where
that channel holds no entry of its own for that plate.

On the first load of a station's assignments file, every station-wide entry SHALL become one entry per declared
channel, and the file SHALL be written back at once. Nothing on air changes: on every channel the same source
answers as before. A second load SHALL copy nothing.

A channel that joins the declared set later SHALL start from a copy of each template's current defaults, taken
whole from the lowest previously declared channel that holds defaults for that template, and the copy SHALL be
persisted. A plate the joining channel already holds SHALL be kept.

The Source defaults dialog SHALL edit the defaults of the channel of the row it was opened from, and its title
SHALL name that channel.

#### Scenario: A change on channel 2 leaves channel 1 unchanged

- **WHEN** a plate's default is changed on channel 2 **THEN** channel 1's default for that plate is unchanged, and
  a take on channel 1 plays channel 1's input
- **WHEN** the same template is taken on channel 2 **THEN** it plays the new default (the control)
- **WHEN** a row on channel 1 is taken **THEN** what it freezes is channel 1's defaults, not the entry written
  for channel 2

#### Scenario: The one-time copy on the first load

- **WHEN** a station's assignments file holds station-wide entries and two channels are declared **THEN** each
  channel holds its own copy of every entry, the file is rewritten with them, and a take plays exactly what it
  played before
- **WHEN** the same file is loaded a second time **THEN** nothing is copied and its bytes are unchanged

#### Scenario: A channel added later starts from a copy

- **WHEN** a second channel is declared after channel 1's defaults were set **THEN** channel 2 holds a copy of
  them, persisted, and a plate channel 1 never set is not invented on channel 2
- **WHEN** a station moves from one channel to another (one bank for one) **THEN** its defaults move with it

#### Scenario: The dialog names and edits its row's channel

- **WHEN** the Source defaults dialog is opened from a row on channel 2 **THEN** its title reads
  `Source defaults · CH 2`, it shows channel 2's defaults, and saving writes channel 2's entries and leaves every
  other channel's as they were
