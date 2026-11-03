## MODIFIED Requirements

### Requirement: The PROGRAM monitor shows the programme return, and says so when it cannot

The PROGRAM pane SHALL show the programme return of the channel on screen, served by the bridge same-origin, and SHALL always offer A, B and A + B display modes, including before a backup is configured. A is server A's physical channel N and B is server B's mapped physical channel M; those labels SHALL remain stable when the current primary changes. In A + B, both equally sized pictures SHALL be visible together and the operator SHALL be able to arrange them horizontally (default) or vertically; this console-local choice SHALL be remembered and SHALL NOT be overridden by a narrow panel. Each tile SHALL carry its own physical server/channel label and signal state. Without a valid B mapping, the B tile SHALL remain present as a black `B · CH —` position with **"No return signal"**, while no B picture, sound or meter resource is requested.

Each tile SHALL show its picture ONLY while the bridge reports that engine/channel `live` over a live bridge link. Otherwise that tile SHALL hide the picture and say **"No return signal"** (connecting, unreachable, unconfigured or unavailable) or **"Return feed stalled"** (the feed stopped delivering frames) — never a frozen frame as if it were live. The pane SHALL carry no explanatory prose; the strip keeps the rows-on-air count beside the signals, so "no return signal" is never read as "nothing on air". With no valid backup, B controls and its selected layout position SHALL remain visible but no B resource SHALL be requested.

#### Scenario: The live pictures appear together

- **WHEN** channel N has a valid backup M, A + B is selected, and both relays deliver frames
- **THEN** PROGRAM shows two live pictures labelled `A · CH N` and `B · CH M`

#### Scenario: One stalled feed does not make the other stale

- **WHEN** A keeps delivering frames and B stops delivering them
- **THEN** A remains visible, B hides its last frame and reads "Return feed stalled", and B returns independently when its frames resume

#### Scenario: The operator chooses the A+B arrangement

- **WHEN** A + B is selected and the operator chooses the vertical layout
- **THEN** B is placed below A, the choice is remembered on that console, and choosing horizontal places B beside A without reconnecting either feed

#### Scenario: No backup mapping keeps an honest reserve position

- **WHEN** server B is absent or channel N has no valid mapped M
- **THEN** A, B and A + B remain available, a selected B position is black and labelled `B · CH —` with "No return signal", and no B picture, sound or meter request is made

#### Scenario: Failover does not rename physical feeds

- **WHEN** current primary changes from A to B while both pictures are visible
- **THEN** the tile fed by server A remains `A · CH N` and the tile fed by server B remains `B · CH M`

### Requirement: The PROGRAM return is requested only while the PROGRAM pane is shown

The console SHALL request only the programme-return pictures selected by the current display mode and only while PROGRAM is rendered. It SHALL release each picture when its tile is hidden, the channel or mode changes, the backup mapping disappears, or PROGRAM is hidden, so a console with the monitors hidden — the boot state — pulls nothing. It SHALL do so in every build of the console: a development build — the one the dev station's Vite serves, where React's StrictMode mounts each component twice — SHALL request each visible picture exactly as a production build does.

#### Scenario: Hiding the monitors releases both returns

- **WHEN** A + B is visible and PROGRAM is hidden
- **THEN** both feed viewers detach; showing PROGRAM reconnects only the pictures selected by the saved mode

#### Scenario: Changing from both to one releases the other

- **WHEN** A + B is visible and the operator selects A
- **THEN** A remains watched and B is released within the relay's normal linger bound

#### Scenario: The dev station shows both returns through Vite

- **WHEN** the fake pair maps channel N to M and PROGRAM selects A + B
- **THEN** both ticketed pictures keep arriving through Vite's proxy and an independently stopped feed reports only its own loss

### Requirement: The PGM monitor SHALL play one programme sound on request and SHALL show that source's Playout meter

A speaker toggle on the PGM monitor SHALL be off by default and remembered per console (`cg.runtime.pgm-audio.v1`; remembered ON after a reload, the sound starts at the first press or key on the page, as a browser requires). A separate local source preference SHALL always offer `Follow primary` (default), A and B. `Follow primary` SHALL resolve to the engine CG Bridge reports as current primary; an explicit A or B selection SHALL remain physical across failover. Exactly one resolved, available engine SHALL own sound, loudness and VU at a time, and changing it SHALL stop the previous sound before starting the next. Selecting B while it is unmapped SHALL leave the meter/loudness unknown and open no B sound or meter resource; it SHALL NOT silently play A. Nothing in this control SHALL change the on-air mix.

While on, it SHALL play the resolved engine's mapped channel sound by the Playout client's method: a streaming `fetch`, the 44-byte header skipped, whole 4-byte frames of s16le stereo at 48 kHz, each chunk scheduled on the `AudioContext` clock, a buffer that starts at 30 ms and grows by 15 ms after 3 underruns within 10 s up to 90 ms and never shrinks during a connection, and chunks dropped whenever more than 150 ms is scheduled ahead. No timestamp SHALL be added.

The one meter SHALL draw that same resolved engine/channel's first 8 bus levels and scale as the Playout's `VuMeterTall` does: a fixed green / yellow / red gradient revealed by `clip-path` (green to −18 dBFS, yellow to −7.2 dBFS, red above), 32 segment lines, a linear −60…0 scale labelled 0, −6, −12, −18, −30, −40, −60 under `dBFS`, values written to the DOM with no render per tick, no peak hold, bus 1 the left bar whatever the page's direction, and in the meter's own three hues, never the air green. Where the panel is too narrow for eight bars it SHALL show the first two. A stale stream SHALL read −60. The loudness badge SHALL show the same selected source's short-term loudness with one decimal: green within −23 ± 1, amber within ± 2, red outside, pulsing while the limiter reduces gain by more than 0.1 dB, silence at or below −70, and unknown when no loudness has arrived for a second.

#### Scenario: One selected source owns sound and meter

- **WHEN** A + B is visible, sound is on, and the operator selects B
- **THEN** only B/M's sound request exists and the loudness badge and VU consume only B/M readings; A remains visible but unheard and unmetered

#### Scenario: Follow primary changes without mixing

- **WHEN** the audio source is Follow primary and current primary changes from A to B
- **THEN** A's decoder stops before B's starts, meter/loudness reset while B is acquired, and no interval contains mixed A+B audio

#### Scenario: Explicit source remains physical

- **WHEN** the operator explicitly selects A and failover makes B current primary
- **THEN** the local sound and meter stay on A until the operator chooses another source

#### Scenario: The speaker remains local

- **WHEN** the operator turns monitor sound on, off, or changes A/B source
- **THEN** no AMCP or Playout output-setting command is sent and the on-air audio is unchanged

#### Scenario: A stale selected meter

- **WHEN** no level arrives from the selected engine longer than the stale limit
- **THEN** every bar reads −60 and loudness is unknown, not the last value
