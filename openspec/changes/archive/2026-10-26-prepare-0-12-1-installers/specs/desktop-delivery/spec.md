# desktop-delivery

## ADDED Requirements

### Requirement: A candidate uses a new, internally consistent release identity

CG Control, CG Designer and CG Bridge SHALL carry `0.12.1` in every release-version source and in every
installer surface derived from it. The system SHALL refuse a version mismatch. Because `v0.12.0` already
identifies different bytes, no artifact built from the current tree SHALL be labelled `0.12.0`.

#### Scenario: Candidate installers are built

- **WHEN** the manual Desktop workflow builds the candidate
- **THEN** all three installer filenames and their installed version records say `0.12.1`

#### Scenario: One source still says 0.12.0

- **WHEN** any of the nine version sources disagrees with `0.12.1`
- **THEN** the build stops before producing installers

### Requirement: The candidate proves the delivered upgrade and remains unpublished

The manual Desktop run SHALL prove a clean install and the in-place upgrade from `0.11.6` to `0.12.1`, with
CG Control and CG Designer open through the upgrade and the station usable afterwards. It SHALL produce
downloadable artifacts without creating or publishing a GitHub release.

#### Scenario: The owner upgrades from 0.11.6

- **WHEN** the matching candidate installers run over the installed `0.11.6` set
- **THEN** settings and station state remain and the upgraded station passes its driven acceptance

#### Scenario: A manual candidate build completes

- **WHEN** the workflow was dispatched without a release tag
- **THEN** installer artifacts are retained for download and no draft or published release is created
