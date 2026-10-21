## MODIFIED Requirements

### Requirement: A sound SHALL import as ONE 48 kHz stereo WAV, measured and never normalised

`Audio…` in the Assets panel SHALL convert each picked sound (WAV, MP3, OGG, M4A, and OPUS, AAC, FLAC
by extension) in-app into one stored form — 16-bit PCM WAV, 48 kHz, stereo — and SHALL record its
length and its peak level in dBFS, measured from the stored bytes, shown on the asset's tile. It SHALL
also record its integrated loudness (ITU-R BS.1770-4, gated, in LUFS; a sound shorter than one 400 ms
block measured over its own length; absent for a sound under the −70 LUFS gate) and its true peak
(4× oversampled, in dBTP). A mono sound SHALL keep its level in both channels. Nothing SHALL be
normalised at import: normalisation is offered per sound, in its Sound section. A file that does not
convert SHALL be named, and the other files SHALL still import.

#### Scenario: Four formats, one stored form

- **WHEN** a WAV, an MP3, an OGG and an M4A of a 0.5 s tone are imported together
- **THEN** four `audio` assets are stored as 48 kHz stereo WAVs, each with its length (0.5 s) and the
  peak its source carries

#### Scenario: A mono sound keeps its level

- **WHEN** a −6 dBFS mono WAV is imported
- **THEN** the stored stereo WAV's peak is −6.0 dBFS, not the −9 dBFS a −3 dB pan law would give

#### Scenario: Loudness is measured, not applied

- **WHEN** a 1 kHz tone at −6 dBFS is imported
- **THEN** its loudness reads about −6 LUFS and its true peak about −6 dBTP, and its samples are unchanged

#### Scenario: A file that is not a sound

- **WHEN** a picked file cannot be read as sound
- **THEN** it is named in one notice and nothing of it is stored; the other files import

## ADDED Requirements

### Requirement: A sound's Sound section SHALL offer normalisation to −23 LUFS, never past −1 dBTP

The Sound section SHALL show the sound's `loudness` and `true peak`; a sound stored before they were
recorded SHALL be measured from its bytes. When the gain that takes the sound to −23 LUFS without its
true peak crossing −1 dBTP is 0.5 dB or more, the section SHALL offer `Normalise to <level> LUFS`,
naming the level the sound will land on (short of −23 when its peaks stop it) with the gain in its
title. Pressing it SHALL store the normalised sound as a new asset named `<name> (<level> LUFS).wav`,
measured like any import, and SHALL point every `audio` element that played the original at it, in one
undo step; the original asset SHALL be left unchanged. A sound already there, or too quiet to measure,
SHALL be offered nothing.

#### Scenario: A loud sound

- **WHEN** a sound at −14 LUFS is normalised
- **THEN** a new asset at −23.0 LUFS is stored, both elements that played the original play it, and
  one undo puts both back

#### Scenario: Peaks stop it short

- **WHEN** a sound at −30 LUFS has a true peak of −3 dBTP
- **THEN** the gain is +2.0 dB and the offer names the level it lands on, not −23

#### Scenario: Nothing to offer

- **WHEN** a sound is within 0.5 dB of −23 LUFS, or too quiet to measure
- **THEN** no Normalise is offered
