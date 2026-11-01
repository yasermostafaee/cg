## ADDED Requirements

### Requirement: A homogeneous Live Source multi-selection exposes the plates' appearance controls

When every selected element is a Live Source plate, the multi-selection Inspector SHALL expose
aspect, keep aspect, fit mode, poster, frame stroke colour and frame stroke width in addition to the
shared transform controls. These plate-only controls SHALL be absent from a mixed-kind selection.
An agreeing value SHALL be shown normally; a differing value SHALL show a neutral mixed state and
SHALL NOT modify any plate until the author commits a replacement.

Every committed document value SHALL fan out to all selected plates as ONE undo entry. A frame colour
edit SHALL preserve each plate's own width and a width edit SHALL preserve each plate's own colour.
Keep aspect SHALL remain the existing per-plate session preference: a mixed press locks all eligible
plates, and a fully locked press frees all. Repair to aspect SHALL calculate each plate independently
from its own transform and declared aspect, changing only plates that need repair, as one undo entry.

#### Scenario: Differing appearance values are truthful and inert

- **WHEN** selected Live Source plates have different aspect, fit, poster or frame values
- **THEN** each differing control reads mixed and no plate changes until a replacement is committed

#### Scenario: One edit updates every plate in one undo

- **WHEN** the author commits a fit, poster, stroke colour or stroke width
- **THEN** every selected plate receives that value as one undo entry, while each stroke's other
  component is preserved

#### Scenario: Repair respects each plate

- **WHEN** selected plates declare different aspects and Repair to aspect is used
- **THEN** each plate is fitted to its own declaration, already-matching plates stay unchanged, and
  one undo restores the whole selection

#### Scenario: Mixed-kind selections do not claim plate controls

- **WHEN** the selection contains a Live Source and any other element kind
- **THEN** the Live Source appearance sections are absent

### Requirement: Poster fitting SHALL be independent from the live picture

When a Live Source has a poster, the Designer SHALL offer `contain` (Fit whole poster) and `cover`
(Fill frame, crop edges) presentation for that authoring image. The poster mode SHALL be distinct
from the plate's live-picture fit mode and SHALL affect authoring/Preview only. An absent poster mode
SHALL resolve to `cover` so stored templates retain their former appearance. A homogeneous Live
Source multi-selection SHALL show a mixed poster mode truthfully and SHALL fan out a committed mode
as one undo entry.

#### Scenario: A complete reference image is visible without changing air

- **GIVEN** a Live Source poster whose aspect differs from its plate
- **WHEN** the author chooses `Fit whole poster`
- **THEN** the complete poster is visible inside the authoring plate
- **AND THEN** the plate's on-air live-picture fit remains unchanged

#### Scenario: Existing posters remain fill-and-crop

- **GIVEN** a stored Live Source poster with no poster-fit field
- **WHEN** it renders in the Designer or Preview
- **THEN** it uses `cover`, matching the historical behaviour
