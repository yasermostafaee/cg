# desktop-delivery

## MODIFIED Requirements

### Requirement: A candidate uses one fresh release identity

CG Control, CG Designer and CG Bridge SHALL carry `0.12.6` in every release-version and installer
surface. Because `0.12.5` already identifies built candidate bytes, current artifacts SHALL NOT
reuse it. All three installers SHALL be built from one commit and delivered as one matching set.

#### Scenario: Matching candidate is built

- **WHEN** the on-demand Desktop workflow builds the candidate
- **THEN** all three filenames and installed version records say `0.12.6`

### Requirement: The candidate proves installed service access to fixed files

The Windows Bridge smoke SHALL prove that an external local `textSourceRoot` grants
`NT SERVICE\CGBridge` inherited read/execute access without write/modify/full control. It SHALL remove
that grant before an upgrade without `/TEXTSOURCEROOT=` and prove that Setup restores it from the
preserved configuration.

#### Scenario: Upgrade repairs the local text-root grant

- **WHEN** the service grant is removed from the configured local root
- **AND WHEN** the same installer upgrades Bridge without a new root argument
- **THEN** the stored root remains unchanged and inherited read/execute-only access is restored

### Requirement: The candidate proves delivery and remains unpublished

The full local gate and E2E lane SHALL pass, together with Linux workspace/E2E and every applicable
Windows installer, smoke and upgrade job. The exact installer artifacts SHALL be downloaded,
checksummed and placed in the local handoff folders. The candidate SHALL NOT create a tag, draft
release or published release.

#### Scenario: Verified candidate is assembled locally

- **WHEN** Linux workspace/E2E and all applicable Windows installer jobs finish green for the exact
  candidate commit
- **THEN** the three installers and `SHA256SUMS.txt` are downloaded into the local handoff folders
  without publishing a release

### Requirement: Installed product identity SHALL be clear before the app opens

CG Bridge, CG Control and CG Designer Setup SHALL remain recognisably related while using distinct
product grounds. Bridge SHALL use an executable/tile icon that is not CG Control's icon. CG Control
and CG Designer startup splashes SHALL show their real package version prominently before the main
UI is ready. The `0.0.0` development placeholder SHALL NOT be presented as a release.

#### Scenario: Support identifies the installed app during startup

- **WHEN** an installed app is still on its startup splash
- **THEN** the operator can read `0.12.6` without waiting for the main UI or opening Windows settings

### Requirement: The Persian guide SHALL be readable and current

The `0.12.6` Persian guide SHALL use visibly relaxed line and paragraph spacing and SHALL contain
fresh version-bearing Setup captures from the candidate. Every rendered page SHALL be visually
checked for clipping, overlap and stale release identity.

#### Scenario: The current guide is ready for handoff

- **WHEN** the `0.12.6` guide is rebuilt from fresh Setup captures
- **THEN** every rendered page has readable spacing, no clipping or overlap, and no earlier release
  identity

## ADDED Requirements

### Requirement: Locked Live Source multi-selection SHALL not offer deforming Scale edits

The Designer SHALL keep the shared Scale controls visible but disabled when any selected element is
a Live Source with a declared aspect and its aspect lock enabled, including when the remaining
selected elements are other kinds such as rectangles. The shared Scale controls SHALL remain
available only when every selected Live Source is unlocked.

#### Scenario: Every selected plate is aspect-locked

- **WHEN** the author selects multiple Live Sources whose aspect locks are all enabled
- **THEN** `Scale X` and `Scale Y` are disabled and identify the aspect lock as the reason

#### Scenario: A locked plate and a rectangle are selected together

- **WHEN** the author selects an aspect-locked Live Source together with a rectangle
- **THEN** `Scale X` and `Scale Y` are disabled for the mixed selection

#### Scenario: One aspect-locked plate is selected

- **WHEN** the author selects one Live Source whose aspect lock is enabled
- **THEN** `Scale X` and `Scale Y` remain visible but disabled
- **AND WHEN** the author disables `keep aspect`
- **THEN** both Scale controls become available

### Requirement: Live Sources SHALL remain axis-aligned on every authoring surface

The Designer SHALL not offer a canvas rotation gesture for a Live Source whose Rotation control is
withheld in the Inspector. Move and resize gestures SHALL remain available.

#### Scenario: A Live Source is selected on the canvas

- **WHEN** the author selects one Live Source
- **THEN** its Gizmo has resize handles but no outside-corner rotation zones
- **AND** a rotation gesture cannot be started for that plate

### Requirement: Selected Live Sources SHALL support symmetric automatic layout

When two or more Live Sources are selected, the Designer SHALL offer an automatic layout that
preserves every declared aspect, centres the result and commits the complete arrangement as one Undo
entry. The author SHALL be able to set horizontal and vertical gaps independently, arrange two
plates side by side or top/bottom, and reverse the plates' spatial seat order without changing their
layer/z order. When balanced rows have a remainder, the author SHALL be able to place the fuller row
at the top or bottom. Gap edits and a two-plate direction change SHALL update the arrangement
immediately without requiring a separate Arrange action.

#### Scenario: Three plates become a balanced 2+1 layout

- **WHEN** the author selects three Live Sources and chooses `More frames on top`
- **THEN** two aspect-correct plates share the top row, one plate is centred below them, and all
  horizontal and vertical gaps are equal
- **AND THEN** one Undo restores all three previous transforms

#### Scenario: Two mixed-aspect plates trade seats

- **WHEN** a portrait and a wide Live Source are arranged side by side and the author chooses
  `Swap frame order`
- **THEN** the two plates exchange left/right positions, retain their own aspects and requested gap,
  and their layer order is unchanged

#### Scenario: A two-plate layout may be vertical

- **WHEN** two Live Sources choose `Top and bottom`
- **THEN** they form two centred rows with the requested vertical gap and symmetric outer spacing
- **AND WHEN** the author changes the vertical gap
- **THEN** the visible arrangement updates immediately

### Requirement: Selection SHALL remain distinct from canvas errors

The Designer SHALL preserve red dashed outlines as error marks and SHALL show selected elements with
a separate bright-blue outer indication. The selection treatment SHALL remain visible on overlapping
frames without changing the geometry used by move, resize or layout commands.

#### Scenario: An overlapping frame is also selected

- **GIVEN** a frame carries the red dashed overlap mark
- **WHEN** the author selects that frame alone or as part of a multi-selection
- **THEN** the red error edge remains identifiable and a separate bright-blue selection halo is
  visible outside it
