# runtime-ui

## ADDED Requirements

### Requirement: Every audio control of a box showing the playlist output SHALL be disabled, and its pill SHALL read locked at 0

Every audio control SHALL be disabled for a plate bound to the Playout's playlist output — AUDIO → ON, the
fader, SOLO and the rest — with `Programme sound is already on air` in its `title`, and the audio pill SHALL
read the plate locked at 0. A plate bound to a camera route SHALL keep its audio controls.

#### Scenario: The locked pill

- **WHEN** a plate is bound to the playlist output **THEN** its pill reads `LOCKED · 0` and ON, the fader and
  SOLO are disabled with the reason
- **AND** a camera plate beside it keeps its controls (the control)

### Requirement: The console SHALL show the CG license's state

A channel whose D4 `cgLicensed` is `false`, or every channel while the license reads `licensed: false`, SHALL
be marked on the channel strip with the Playout's `message` on hover. In `grace` a station admin SHALL see one
line naming `graceUntil`; an operator SHALL not. A take refused for the license SHALL show the Playout's
message on the row.

#### Scenario: A channel outside the cap

- **WHEN** D4 reads `cgLicensed: false` for CH 2 **THEN** CH 2's chip is marked and its title carries the reason
- **AND** CH 1's chip is not (the control)

#### Scenario: Grace

- **WHEN** the license reads `playoutState: grace` **THEN** an admin console shows one line with `graceUntil`,
  and an operator console shows none

### Requirement: The PGM monitor SHALL play the programme's sound on request and SHALL show the Playout's meter

A speaker toggle on the PGM monitor SHALL be off by default and remembered per console; on, it SHALL play the
channel's sound by the Playout client's method: a streaming `fetch`, the 44-byte header skipped, whole 4-byte
frames of s16le stereo at 48 kHz, each chunk scheduled on the `AudioContext` clock, a buffer that starts at 30
ms and grows by 15 ms after 3 underruns within 10 s up to 90 ms and never shrinks during a connection, and
chunks dropped whenever more than 150 ms is scheduled ahead. No timestamp SHALL be added. Beside the monitor a
meter SHALL draw the channel's first 8 bus levels and the scale, as the Playout's `VuMeterTall` does: a fixed
green / yellow / red gradient revealed by `clip-path` (green to −18 dBFS, yellow to −7.2 dBFS, red above), 32
segment lines, a linear −60…0 scale labelled 0, −6, −12, −18, −30, −40, −60 under `dBFS`, values written to the
DOM with no render per tick, no peak hold. A stale stream SHALL read −60. A badge SHALL show the short-term
loudness with one decimal: green within −23 ± 1, amber within ± 2, red outside, pulsing while the limiter
reduces gain by more than 0.1 dB, and silence at or below −70.

#### Scenario: The audio buffer

- **WHEN** a recorded WAV stream underruns 3 times within 10 s **THEN** the buffer grows from 30 to 45 ms
- **AND WHEN** more than 150 ms is scheduled ahead **THEN** incoming chunks are dropped back to the buffer size

#### Scenario: The meter's colours

- **WHEN** a bar reads −18 dBFS **THEN** it reaches 70 % of its height, the top of green
- **AND** −7.2 dBFS reaches 88 %, the top of yellow

#### Scenario: A stale stream

- **WHEN** no level arrives for longer than the stale limit **THEN** every bar reads −60, not the last value
