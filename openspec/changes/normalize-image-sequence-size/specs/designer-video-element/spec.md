## MODIFIED Requirements

### Requirement: Gaps and odd frames SHALL be named before converting, and Continue SHALL hold them

Before conversion, the sequence step SHALL identify missing numbers, different-size readable frames, unreadable frame headers and files that duplicate a frame number. It SHALL display how many readable frames match the most common size, followed by the count and names of the files with different dimensions.

When readable frames differ in size, the step SHALL offer **Keep matching frames** and **Resize all readable frames**. The default SHALL keep the most common size. Resize SHALL retain all readable pictures, preserve aspect ratio and center each picture on a transparent frame of the chosen output size. The initial width and height SHALL come from the first readable frame in sequence order. Both dimensions SHALL be editable. The step SHALL reject a resize plan that exceeds the browser's conversion budget before the converter starts.

Continue SHALL keep one frame per number from the first to the last. A missing or excluded frame SHALL repeat the preceding usable frame. Slots before the first usable frame SHALL repeat that first frame. A sequence with no readable frames SHALL be refused.

#### Scenario: A gap and an odd-size frame are named and held

- **WHEN** `f1, f2, f4, f5` are picked at 64 × 64 and `f4` is 32 × 32
- **THEN** the step names `f3.png` as missing and `f4.png (32×32)` as one of four readable frames with a different size
- **WHEN** the author keeps the matching frames and continues
- **THEN** the frames converted are `f1, f2, f2, f2, f5`

#### Scenario: Mixed-size frames fit into a chosen output size

- **WHEN** the first readable frame is 64 × 32, and the remaining readable frames are 64 × 64
- **AND** the author chooses Resize
- **THEN** the output size fields show 64 × 32 initially
- **WHEN** the author changes the output size and continues
- **THEN** every readable frame contributes its picture at the same frame number, fitted inside the chosen size with transparent padding

#### Scenario: The chosen output size exceeds the conversion budget

- **WHEN** the selected output dimensions and number of frame slots exceed the conversion budget
- **THEN** the sequence step states the limit and disables Continue

#### Scenario: Cancel at the sequence step imports nothing

- **WHEN** the author cancels the sequence step
- **THEN** Designer discards the import request

### Requirement: Re-importing the same frames at the same rate and crop SHALL skip the encode

The sequence's pre-convert key SHALL cover its ordered frame bytes and boundaries, including each held slot, plus its input rate, crop, target rate, corrections, converter revision and normalization settings. A matching asset SHALL be offered before encoding. An import with different normalization settings or a different input rate SHALL produce a separate asset. A single file's hash SHALL remain independent of sequence imports.

#### Scenario: The same frames twice

- **WHEN** the same sequence is imported twice at the same rate, crop and output size settings
- **THEN** the second import offers the existing asset before encoding

#### Scenario: Another rate is another clip

- **WHEN** the same frames are imported at another rate
- **THEN** Designer offers to convert a new clip

#### Scenario: Another output size is another clip

- **WHEN** the same frames are imported with different normalization settings
- **THEN** Designer offers to convert a new clip
