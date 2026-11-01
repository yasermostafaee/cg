# desktop-delivery

## MODIFIED Requirements

### Requirement: A candidate uses one fresh release identity

CG Control, CG Designer and CG Bridge SHALL carry `0.12.5` in every release-version and installer
surface. Because `0.12.4` already identifies built candidate bytes, current artifacts SHALL NOT
reuse it. All three installers SHALL be built from one commit and delivered as one matching set.

#### Scenario: Matching candidate is built

- **WHEN** the on-demand Desktop workflow builds the candidate
- **THEN** all three filenames and installed version records say `0.12.5`

#### Scenario: One source drifts

- **WHEN** any release-version source disagrees with `0.12.5`
- **THEN** packaging stops before producing installers

### Requirement: The candidate proves installed shared-text-root configuration

The windowed Bridge setup and silent installer smoke SHALL each configure a non-default
`textSourceRoot`, and the resulting service configuration SHALL contain the exact supplied folder.

#### Scenario: Setup writes the chosen root

- **WHEN** the setup-window smoke supplies an existing folder containing spaces
- **THEN** `cg-bridge.json` stores the complete folder without truncation

### Requirement: The candidate proves delivery and remains unpublished

The full local gate and E2E lane SHALL pass, together with Linux workspace/E2E and every applicable
Windows installer, smoke and upgrade job. The exact installer artifacts SHALL be downloaded,
checksummed and placed in the local handoff folders. The candidate SHALL NOT create a tag, draft
release or published release.

#### Scenario: Delivery completes

- **WHEN** the exact candidate commit is green on Linux and Windows
- **THEN** its three release-named installers and checksums are retained locally with run evidence
