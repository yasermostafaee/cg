## ADDED Requirements

### Requirement: Playback phase boundaries use compact semantic actions

The Designer SHALL present `contentStart` as Hold start and `outPoint` as Outro start without
changing persisted scene fields. Each singleton boundary SHALL use a short visible action in an
equal-sized button and a complete accessible name.

#### Scenario: Hold start switches between automatic and explicit

- **WHEN** Hold start is automatic
- **THEN** the row offers a visible Set action named `Set hold start`
- **WHEN** Hold start is explicit
- **THEN** the row offers a visible Clear action named `Clear hold start`

#### Scenario: Outro start is added or removed

- **WHEN** no Outro start exists
- **THEN** the row offers a visible Set action named `Set outro start`
- **WHEN** an Outro start exists
- **THEN** the row offers a visible Clear action named `Clear outro start`

#### Scenario: Narrow Inspector remains aligned

- **WHEN** any phase action renders in the narrow Inspector
- **THEN** its hit area is at least 28 pixels high, all phase actions use equal width, and the final
  Info column remains aligned with neighbouring rows

#### Scenario: Timeline marker tooltips remain concise

- **WHEN** an author hovers the Hold-start or Outro-start timeline marker
- **THEN** the tooltip contains only the corresponding phase name

#### Scenario: Setting Hold start seeds a playable Middle frame

- **WHEN** Outro start exists, Hold start is not explicit, and the author activates `Set hold start`
- **AND** there is no earlier entrance-settle frame
- **THEN** the new explicit Hold start is seeded one frame before Outro start when the active range
  permits that separation

#### Scenario: Either boundary carries its partner when crossing

- **WHEN** an author drags Outro start left through an explicit Hold start
- **THEN** Hold start moves left with it and MAY share the requested frame
- **WHEN** an author drags Hold start right through Outro start
- **THEN** Outro start moves right with it and MAY share the requested frame
- **AND** both markers stay inside the active range

#### Scenario: Coincident authored boundaries remain visible

- **WHEN** Hold start and Outro start occupy the same frame
- **THEN** both full-height timeline boundary lines remain present
- **AND** a small display-only offset makes the two colours distinguishable without changing either
  stored frame

### Requirement: Hold markers are visually distinct from the playhead

Hold start's action/icon, timeline marker and boundary line, and the Loop range SHALL use the
existing semantic green. The playhead/current-frame indicator SHALL remain blue and Outro start
SHALL remain orange. Color changes SHALL NOT change authored frames or playback behavior.

#### Scenario: Green Hold start and range remain distinct from the blue playhead

- **WHEN** an author views an explicit or automatic Hold start alongside the playhead
- **THEN** the Hold-start marker and line, related Inspector action/icon, and Loop range use green
- **AND** the playhead/current-frame indicator remains blue and Outro start remains orange
- **AND** marker dragging, coincident-boundary separation and persisted values are unchanged

#### Scenario: The Loop range is visible over colored element rows

- **WHEN** the green Loop range crosses strongly colored timeline element rows
- **THEN** its span remains visibly identifiable through a restrained plain fill without diagonal
  hatching or thick boundary halos
- **AND** underlying layer colors, labels and keyframes remain readable
- **AND** the green Hold-start and orange Outro-start lines remain uncovered and visibly distinct
- **AND** the treatment neither captures pointer input nor changes the blue playhead or range frames
