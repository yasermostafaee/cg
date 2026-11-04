# designer-video-element — delta (validate-video-import-capability, 2026-11-03)

## ADDED Requirements

### Requirement: Video compatibility SHALL be explained and proved before conversion

The Designer SHALL disclose proven source presets before the operator commits to an import. The file
extension gate SHALL reject unlisted containers immediately. For a listed container, the bundled
converter SHALL decode at least one source frame before conversion is enabled; container or codec
names alone SHALL NOT be treated as proof. A failed mid-clip poster MAY fall back to a frame-zero
decode and proceed without a poster. No readable track, decode/file incompatibility and internal
converter failure SHALL remain distinct, actionable states, and none SHALL start the full encode.

#### Scenario: An unlisted extension is refused immediately

- **WHEN** the operator selects a file whose extension is not in the accepted video-container list
- **THEN** no Video-import modal or converter load starts
- **AND** the notice names proven re-export choices

#### Scenario: A listed container with an undecodable frame is refused before conversion

- **WHEN** metadata identifies a video track but neither poster nor fallback frame decode succeeds
- **THEN** the modal explains that the built-in converter could not decode the source
- **AND** `convertToWebm` is never called

#### Scenario: A poster-less but decodable source may proceed

- **WHEN** mid-clip poster extraction fails but the fallback source-frame decode succeeds
- **THEN** the modal becomes ready with numeric crop controls and no preview image

#### Scenario: A converter crash does not blame the source

- **WHEN** the probe worker or its filesystem fails
- **THEN** the UI identifies an internal converter problem and offers retry guidance
- **AND** it does not call the file or codec unsupported

### Requirement: Non-square source pixels SHALL become appearance-preserving square pixels

The probe SHALL retain coded dimensions and sample-aspect ratio. Preview SHALL use the resulting
display aspect while crop values remain coded-source coordinates. The canonical conversion SHALL crop
first, scale the cropped picture by that sample-aspect ratio and store `SAR 1:1`; verification SHALL
derive expected dimensions through the same rule. For non-1:1 sources, the operator MAY instead
choose coded-pixel dimensions when the source metadata is visibly wrong; that choice SHALL update the
preview immediately, store `SAR 1:1`, and participate in provenance and duplicate matching. A 1:1
source SHALL retain the filter-free fast path.

#### Scenario: A QTRLE MOV with non-square pixels imports without distortion

- **WHEN** a 1445×2120 QTRLE MOV reports SAR 2107:1445
- **THEN** its preview displays as 2107×2120 rather than a squeezed 1445×2120 picture
- **AND** the stored WebM is square-pixel 2107×2120, passes verification and can be placed

#### Scenario: Crop uses source coordinates and verifies the derived output

- **WHEN** the operator crops a non-square-pixel source
- **THEN** the crop controls continue to describe coded source pixels
- **AND** preview geometry, output scaling and expected stored dimensions use one shared derivation

#### Scenario: Square-pixel input stays on the fast path

- **WHEN** a source reports 1:1 sample aspect
- **THEN** conversion adds no geometry-normalization filter unless another authored option requires one

#### Scenario: The operator overrides incorrect picture-shape metadata

- **GIVEN** a non-square-pixel source whose file-defined display shape looks stretched
- **WHEN** the operator chooses `Pixel dimensions`
- **THEN** preview and stored output use the coded width and height with `SAR 1:1`
- **AND** the alternate output does not deduplicate against `From file`

### Requirement: Legacy QTRLE colour interpretation SHALL be explicit and consistent

For QTRLE+ARGB sources only, the Designer SHALL offer standard file colours and an opt-in legacy VLC
3 colour interpretation. Standard SHALL remain the default because the two interpretations cannot be
distinguished from source metadata. The selected interpretation SHALL update the preview, be baked
before alpha corrections, preserve alpha, and participate in provenance and duplicate matching.

#### Scenario: A QTRLE source is matched to VLC 3 intentionally

- **GIVEN** a QTRLE+ARGB source that appears green under the standard channel contract and purple in VLC 3
- **WHEN** the operator chooses `Match VLC 3 colors`
- **THEN** the preview changes to the VLC 3 interpretation before conversion
- **AND** conversion bakes the same channel mapping before optional un-premultiply/bleed processing
- **AND** output alpha is preserved

#### Scenario: Ordinary sources are not offered an unsafe colour permutation

- **WHEN** the probed source is not QTRLE+ARGB
- **THEN** the legacy VLC colour control is absent
- **AND** no colour-channel permutation is added to conversion
