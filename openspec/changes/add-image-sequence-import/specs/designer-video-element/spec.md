## ADDED Requirements

### Requirement: A numbered image sequence SHALL import as ONE video asset and ONE video element

The Assets panel SHALL offer `Image sequence…` (many PNG or TGA files) and `Image sequence folder…`
(a whole folder). A chosen sequence SHALL go through the SAME converter and import modal as a clip —
mounted without copying its frames, read by ffmpeg's `image2` input, conformed to the project's rate,
cropped, verified before it is stored — and SHALL produce ONE `video` asset and ONE `video` element.
No new element type SHALL be introduced. The asset's provenance SHALL record the sequence: its first
and last file names, the number of frames converted and the rate given (`sequence`, optional, so every
asset stored before it still parses). A pick holding no numbered PNG or TGA frame SHALL say so and
open nothing.

#### Scenario: A folder of frames becomes one video layer

- **WHEN** the author picks a folder holding `f_01.png … f_10.png` through `Image sequence folder…`,
  continues and converts
- **THEN** one `video` asset named `f.webm` is stored and one `video` element is placed, and the
  asset's provenance reads `sequence = { firstFile: f_01.png, lastFile: f_10.png, frameCount: 10, fps }`

#### Scenario: The placed element is an ordinary video

- **WHEN** the sequence's element is on the timeline
- **THEN** it is a `video` element — the same phases, hold, scrub, exports and on-air path as any
  imported clip — and the Inspector shows `sequence  N frames · R fps`

#### Scenario: A pick with no frame opens nothing

- **WHEN** the picked files hold no PNG or TGA whose name carries a number
- **THEN** a notice says so and no import step opens

### Requirement: A pick SHALL reach the import however long it takes, and one picture SHALL never silently become a sequence

A file pick SHALL reach the import whatever its size and however long the file dialog stays open:
the picker's input SHALL be held until its pick settles, so it cannot be garbage-collected while the
dialog is open (`B-345`, `DELTA-RUN-NEXT-VERSION-01-G`). A multi-select or a folder SHALL import
ONE sequence or say why not — never nothing. A single picture picked through `Image sequence…`
SHALL be refused with a sentence that names the right door (`Image…`), and the import step SHALL
show the same fact with Continue disabled.

#### Scenario: A long pick still imports

- **WHEN** the author picks a folder of frames and the browser collects garbage while the dialog is
  open
- **THEN** the import step opens with every frame

#### Scenario: One picture is not a sequence

- **WHEN** the author picks one PNG through `Image sequence…`
- **THEN** a notice says one picture is not a sequence and names `Image…`, and nothing is imported

### Requirement: Sequence frames SHALL be ordered by the number in their names, in any digit set

A frame's number SHALL be the LAST run of digits in its name, read in Latin, Persian or Arabic-Indic
digits. Frames sharing a folder, the text around the number and the extension SHALL form one
sequence, ordered by that number — never by the name's text.

#### Scenario: f2 comes before f10

- **WHEN** `f10.png`, `f2.png` and `f1.png` are picked
- **THEN** the frames convert in the order `f1`, `f2`, `f10`

#### Scenario: Persian digits are numbers

- **WHEN** `فریم۱۰.png`, `فریم۲.png` and `فریم۱.png` are picked
- **THEN** the frames convert in the order `۱`, `۲`, `۱۰`

### Requirement: Gaps and odd frames SHALL be named before converting, and Continue SHALL hold them

Before anything converts, the sequence step SHALL name, by file: every missing number (written as the
file it would have been), every frame whose pixel size differs from the size most frames have (read
from each frame's header), every frame whose header cannot be read, and every second file carrying a
number already taken. The author SHALL continue or cancel. On Continue, the converter SHALL take ONE
frame per number from the first to the last: a missing or left-out frame SHALL show the frame before
it (the first usable frame before the first), so every frame keeps its time; a frame SHALL never be
scaled, and a gap SHALL never be closed up. A sequence with no readable frame SHALL not continue.

#### Scenario: A gap and an odd-size frame are named and held

- **WHEN** `f1, f2, f4, f5` are picked at 64 × 64 and `f4` is 32 × 32
- **THEN** the step names `f3.png` as missing and `f4.png (32×32)` as not 64 × 64, and on Continue the
  frames converted are `f1, f2, f2, f2, f5`

#### Scenario: Cancel at the sequence step imports nothing

- **WHEN** the author cancels the sequence step
- **THEN** nothing is converted or stored, and the project is unchanged

### Requirement: A pick holding several sequences SHALL let the author choose one

When the picked files form more than one sequence, the step SHALL list every sequence, largest first,
and SHALL convert only the one the author picks.

#### Scenario: Two sequences in one folder

- **WHEN** a folder holds `a_1 … a_3.png` and `b_1 … b_2.png`
- **THEN** the step lists `a_1.png … a_3.png (3 frames)` then `b_1.png … b_2.png (2 frames)`, and
  choosing the second converts `b_1, b_2` only

### Requirement: A sequence SHALL play at the rate the author gives, by default the project's

The sequence step SHALL ask for the rate, defaulting to the project's channel rate. The `image2`
input SHALL take it as its frame rate (never re-timing the input), and the output SHALL be conformed
to the project's rate as any clip is.

#### Scenario: The default rate is the project's

- **WHEN** the step opens in a 50 fps project
- **THEN** the rate reads 50, and 10 frames become a 0.2 s clip

#### Scenario: A typed rate is the one used

- **WHEN** the author types 30 and continues
- **THEN** the sequence is read at 30 fps, recorded as `sequence.fps = 30`, and conformed to the
  project's rate

### Requirement: A sequence's straight alpha SHALL survive conversion exactly

A PNG or TGA sequence's straight (non-premultiplied) alpha SHALL be kept with no pixel math on the
default path: a white-to-transparent ramp SHALL composite over black as its own alpha and over white
as white, within the lossy alpha plane's error, in the Designer and on air.

#### Scenario: The ramp over black and over white

- **WHEN** a sequence of a white ramp (alpha 255 at the left edge, 0 at the right, white under every
  alpha) is converted and its stored clip is drawn over black and over white
- **THEN** over black every column reads the ramp's alpha within 8 / 255, and over white every column
  reads at least 247 — no darkened edge

### Requirement: Re-importing the same frames at the same rate and crop SHALL skip the encode

The pre-convert dedupe key of a sequence SHALL be a hash over its ordered frames — each frame preceded
by its byte length, a held frame counted where it plays — together with the given rate and the crop
(beside the target rate, corrections and converter revision every clip's key carries). A matching
asset SHALL be offered instead of a second encode. The same frames at another rate SHALL be a
different clip, and a clip SHALL never match a sequence. A single file's hash SHALL be unchanged.

#### Scenario: The same frames twice

- **WHEN** the same sequence is imported twice at the same rate and crop
- **THEN** the second import offers the existing asset before any encode, and the project holds one
  video asset

#### Scenario: Another rate is another clip

- **WHEN** the same frames are imported at another rate
- **THEN** no duplicate is offered and the sequence converts

### Requirement: A sequence's conversion SHALL count progress in frames, and Cancel SHALL leave the project unchanged

While a sequence converts, the progress SHALL read `Converting… frame N of M`, `M` being the number
of frames converted and `N` ffmpeg's encoded count carried back to the given rate, never past `M`.
Cancel SHALL stop the conversion and store nothing, exactly as a clip's does.

#### Scenario: Progress in the sequence's frames

- **WHEN** a 4-frame sequence at 25 fps converts in a 50 fps project and ffmpeg has encoded 4 frames
- **THEN** the progress reads `frame 2 of 4`

#### Scenario: Cancel during the conversion

- **WHEN** the author cancels while the sequence converts
- **THEN** no asset is stored, no element is placed, and the modal returns to its convert step

### Requirement: An imported clip SHALL be placed with its box centred in the scene

`Place element` after an import SHALL place the clip's fitted box with its centre at the scene's
centre: a full-frame clip at `0, 0`, a smaller clip around the centre, a larger clip fitted to the
frame and then centred. The drag-from-assets door SHALL keep placing at the drop point (`B-342`).

#### Scenario: A full-frame clip fills the frame

- **WHEN** a 1920 × 1080 clip (or image sequence) is imported into a 1920 × 1080 project and placed
- **THEN** its element sits at `0, 0`, size `1920 × 1080`

#### Scenario: A smaller clip sits in the middle

- **WHEN** a 640 × 360 clip is placed in a 1920 × 1080 project
- **THEN** its element sits at `640, 360`, its centre at the scene's centre
