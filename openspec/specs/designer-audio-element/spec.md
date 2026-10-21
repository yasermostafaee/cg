# designer-audio-element Specification

## Purpose

TBD - created by archiving change add-audio-element. Update Purpose after archive.

## Requirements

### Requirement: A template SHALL carry sound effects that its own page plays on air

An `audio` element SHALL reference a stored sound and SHALL be played by the template page itself on
CasparCG; no AMCP command SHALL be sent for it. The page layer's existing volume rule decides when it
is heard: silent while the row is cued, audible from the take through the exit animation.

#### Scenario: A sound reaches the channel's output

- **WHEN** a template with an entrance sound at 0 dB over a −6.02 dBFS asset is taken on CasparCG
- **THEN** the channel's own audio meter reads −6.02 dBFS while it plays, and silence before and after

#### Scenario: The bridge sends nothing for it

- **WHEN** a template with sound is loaded, taken and stopped
- **THEN** the AMCP traffic is the same as for the same template without sound

### Requirement: A sound SHALL import as ONE 48 kHz stereo WAV, measured and never normalised

`Audio…` in the Assets panel SHALL convert each picked sound (WAV, MP3, OGG, M4A, and OPUS, AAC, FLAC
by extension) in-app into one stored form — 16-bit PCM WAV, 48 kHz, stereo — and SHALL record its
length and its peak level in dBFS, measured from the stored bytes, shown on the asset's tile. A mono
sound SHALL keep its level in both channels. Nothing SHALL be normalised. A file that does not
convert SHALL be named, and the other files SHALL still import.

#### Scenario: Four formats, one stored form

- **WHEN** a WAV, an MP3, an OGG and an M4A of a 0.5 s tone are imported together
- **THEN** four `audio` assets are stored as 48 kHz stereo WAVs, each with its length (0.5 s) and the
  peak its source carries

#### Scenario: A mono sound keeps its level

- **WHEN** a −6 dBFS mono WAV is imported
- **THEN** the stored stereo WAV's peak is −6.0 dBFS, not the −9 dBFS a −3 dB pan law would give

#### Scenario: A file that is not a sound

- **WHEN** a picked file cannot be read as sound
- **THEN** it is named in one notice and nothing of it is stored; the other files import

### Requirement: A sound SHALL start at the entrance, a time after it, or the exit — once per occurrence

An `audio` element's `start` SHALL be the graphic's entrance (its take), a time in ms after the
entrance, or its exit (`CG STOP`, an auto-exit). It SHALL play once per occurrence: a hold SHALL NOT
repeat it, and it SHALL NOT drive a hold. A pause SHALL hold a timed sound's countdown; a timed sound
whose moment has not come when the exit begins SHALL NOT start.

#### Scenario: Entrance, time and exit

- **WHEN** a template with an entrance sound, a sound at 300 ms and an exit sound is played, held and
  stopped
- **THEN** the entrance sound starts at the play, the timed one 300 ms later, and the exit sound only
  at the stop

#### Scenario: The exit is not held by its sound

- **WHEN** a template with an exit sound longer than its exit animation is stopped
- **THEN** the graphic leaves on its own timing, and the exit sound plays to its end

### Requirement: No exit SHALL mean no exit sound, and nothing silent SHALL make a sound

A hard Clear (the page removed without an exit) SHALL play no sound. A scrub of the timeline SHALL
play no sound. A hidden `audio` element SHALL never play, and a sound inside a look that is not on
screen SHALL be silenced.

#### Scenario: A hard Clear

- **WHEN** a template with an exit sound is cleared without a stop
- **THEN** the channel stays silent

#### Scenario: A scrub and a hidden sound

- **WHEN** the timeline is scrubbed, or a template with a hidden sound is played
- **THEN** no sound starts

### Requirement: A sound's volume and fades SHALL be applied on playback

`volumeDb` SHALL be applied as a gain, −60…+6 dB (default 0, the sound as imported); a value outside
the range SHALL be clamped by the Inspector and refused by the schema. Optional fades SHALL ramp from
the sound's start and to its end.

#### Scenario: Volume on air

- **WHEN** the same −6.02 dBFS sound plays at −12 dB and at +6 dB on CasparCG
- **THEN** the channel reads −18.02 dBFS and −0.02 dBFS

### Requirement: A sound SHALL be authored on the timeline and in the Inspector, never on the canvas

Dropping a sound's tile on the canvas SHALL place one `audio` element, named after its file, starting
at the entrance at 0 dB, and select it. It SHALL have no box on the canvas — not drawn, not hittable,
no selection gizmo — and the Inspector SHALL show its own Sound section (length and peak as facts;
starts, volume, fade in, fade out) instead of a Transform section.

#### Scenario: Placing a sound

- **WHEN** a sound's tile is dropped on the canvas
- **THEN** one `audio` element is added and selected, and the Inspector shows its Sound section and no
  Transform section

### Requirement: The Preview and the timeline's Play SHALL be heard under ONE Sound switch; scrubbing SHALL be silent

The Preview SHALL play a template's sounds. The timeline's Play SHALL play them too (`B-346`,
`DELTA-RUN-NEXT-VERSION-01-G`): each sound starts at its place from wherever the playhead is,
through the page's own audio graph, and stops with the playhead; the Play click itself SHALL resume
the page's audio output, since a browser starts audio only inside a user gesture. Scrubbing and
stepping SHALL stay silent. ONE Sound switch SHALL serve both — in the timeline's transport and in the
Preview, shown when the composition makes sound, ON by default, its state always visible
(`Sound on` / `Sound off`); switching it off SHALL mute both at once. A sound longer than its
composition SHALL play to its end in the Preview, as on air; the timeline's Play SHALL stop it with
the playhead.

#### Scenario: The timeline's Play is heard

- **WHEN** a composition with a sound is played from the timeline's transport
- **THEN** the sound starts at its place, and stops when the playhead stops

#### Scenario: Scrubbing is silent

- **WHEN** the author drags the playhead across a sound
- **THEN** nothing is heard

#### Scenario: One switch for both

- **WHEN** the author presses the transport's `Sound on`
- **THEN** it reads `Sound off`, the timeline is muted, and the Preview opens muted with its switch
  reading the same

### Requirement: Both exports SHALL carry a sound's WAV

The `.vcg` SHALL pack each sound's stored WAV as `assets/audio/<sha>.wav` with a `kind: 'audio'` index
entry; the single-file HTML SHALL inline it as `data:audio/wav`. A sound whose asset is missing SHALL be
a preflight error.

#### Scenario: The package carries the sound

- **WHEN** a template with a sound is exported as `.vcg`
- **THEN** the package holds the WAV under `assets/audio/` with an `audio/wav` index entry, and the
  element round-trips with its start and volume
