## MODIFIED Requirements

### Requirement: A sound SHALL import as ONE 48 kHz stereo WAV, measured and never normalised

`Audio…` in the Assets panel SHALL convert each picked sound (WAV, MP3, OGG, M4A, and OPUS, AAC, FLAC
by extension) in-app into one stored form of 16-bit PCM WAV, 48 kHz, stereo. It SHALL record the
length and sample peak in dBFS measured from the stored bytes, and show them on the asset tile.
It SHALL also record the ITU-R BS.1770-4 gated integrated loudness in LUFS and the 4× oversampled true peak in dBTP.
A sound shorter than one 400 ms block SHALL be measured over its own length. A sound under the
−70 LUFS gate SHALL have no integrated loudness measurement. A mono sound SHALL keep its level in
both channels. Normalisation SHALL require an explicit action on a placed Sound layer. A file that
does not convert SHALL be named, and the other files SHALL still import.

#### Scenario: Four formats, one stored form

- **WHEN** a WAV, an MP3, an OGG and an M4A of a 0.5 s tone are imported together
- **THEN** four `audio` assets are stored as 48 kHz stereo WAVs, each with its length (0.5 s) and the
  peak its source carries

#### Scenario: A mono sound keeps its level

- **WHEN** a −6 dBFS mono WAV is imported
- **THEN** the stored stereo WAV's peak is −6.0 dBFS

#### Scenario: Loudness is measured at import

- **WHEN** a 1 kHz tone at −6 dBFS is imported
- **THEN** its loudness reads about −6 LUFS and its true peak about −6 dBTP, and the samples retain their source level

#### Scenario: A file that is not a sound

- **WHEN** a picked file cannot be read as sound
- **THEN** the import notice names it, the unreadable file is skipped, and the other files import

### Requirement: A sound's Sound section SHALL offer normalisation to −23 LUFS, never past −1 dBTP

The Sound section SHALL show loudness, sample peak and true peak for the selected layer. A sound
without stored loudness measurements SHALL be measured from its WAV. When the gain toward
−23 LUFS is at least 0.5 dB in magnitude, using a −1 dBTP estimated true peak ceiling, the section
SHALL offer `Normalise to <level> LUFS` and show the calculated gain in the button tooltip.
Pressing it SHALL save an independent gain on that audio element in one undo step. The layer and
any other placements SHALL continue referencing their original assets. The runtime SHALL apply the
normalisation gain along with the independent manual fader and fades. Once applied, the Sound
section SHALL show the gain and estimate the three readouts before manual volume and fades.
`Remove normalisation` SHALL remove the gain in one undo step.

#### Scenario: Two layers share a loud sound

- **WHEN** the author normalises one placement of a sound at −14 LUFS
- **THEN** that placement receives −9 dB and estimates −23 LUFS
- **AND** the other placement keeps its previous gain, both placements retain their asset, and the project still stores one WAV

#### Scenario: Peaks stop the gain short

- **WHEN** a sound at −30 LUFS has a true peak of −3 dBTP
- **THEN** the offer shows a gain of +2 dB and an estimated level of −28 LUFS

#### Scenario: A quiet sound has headroom for a larger boost

- **WHEN** a sound at −35 LUFS has a true peak of −25 dBTP
- **THEN** the selected layer receives +12 dB independently of its manual volume

#### Scenario: Remove or undo the adjustment

- **WHEN** the author removes or undoes the normalisation
- **THEN** the selected layer returns to its source measurements and keeps its manual volume

#### Scenario: A sound already matches the target or has no measurement

- **WHEN** a sound needs less than 0.5 dB of adjustment or is too quiet to measure
- **THEN** the Sound section leaves its measured level as shown

#### Scenario: Export a normalised layer

- **WHEN** a template with a nonzero normalisation gain is exported as `.vcg`
- **THEN** the package carries the layer gain, the original WAV, and a minimum template runtime version of 1.2.1
