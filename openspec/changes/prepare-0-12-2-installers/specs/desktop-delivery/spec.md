# desktop-delivery

## MODIFIED Requirements

### Requirement: A candidate uses a new, internally consistent release identity

CG Control, CG Designer and CG Bridge SHALL carry `0.12.2` in every release-version source and every installer
surface derived from it. The system SHALL refuse a version mismatch. Because `0.12.1` already identifies
delivered artifacts, no artifact built from the current tree SHALL be labelled `0.12.1`. All three installers
SHALL be built as a matching set. The delivery SHALL identify CG Bridge and CG Control as required reinstalls
over a complete `0.12.1` set because `B-355` changes the production bridge as well as Control parity/feedback;
it SHALL identify Designer as optional only for that baseline. The owner's installed `0.11.6` SHALL be upgraded
with all three installers so it also receives the accumulated Designer changes.

#### Scenario: Candidate installers are built

- **WHEN** the on-demand Desktop workflow builds the candidate commit
- **THEN** all three installer filenames and their installed version records say `0.12.2`

#### Scenario: One source still says 0.12.1

- **WHEN** any of the nine version sources disagrees with `0.12.2`
- **THEN** the build stops before producing installers

#### Scenario: A complete 0.12.1 set receives the follow-up

- **WHEN** a station updates from the complete `0.12.1` set
- **THEN** CG Bridge and CG Control are both reinstalled, while that station's CG Designer may remain installed

#### Scenario: The owner's installed 0.11.6 is upgraded

- **WHEN** the owner applies this candidate over the installed `0.11.6`
- **THEN** CG Bridge, CG Control and CG Designer are all upgraded to `0.12.2`

### Requirement: The candidate proves its delivery and remains unpublished

The candidate SHALL include a Persian guide that names the exact `0.12.2` installer files, distinguishes the
two upgrade baselines above, and uses fresh version-bearing pictures captured from a preliminary Windows
`guide-shots` run. The full local gate and the Linux workspace and E2E jobs SHALL pass on the candidate commit.
An on-demand Desktop run, started by the final installer marker or a manual dispatch, SHALL build all three
installers from that exact commit and pass every applicable Windows smoke and acceptance job, including
`acceptance-upgrade-0116`. All three installers SHALL be downloaded and assembled with the final guide and
`SHA256SUMS.txt`; their exact filenames, byte sizes and SHA-256 hashes SHALL be recorded. The candidate SHALL
NOT create a tag, draft release or published release.

#### Scenario: Candidate verification completes

- **WHEN** the candidate is ready for Windows packaging
- **THEN** the Persian guide names its exact files, the full local gate is green, and Linux CI has completed its
  workspace and E2E jobs successfully on that commit

#### Scenario: The on-demand Windows build completes

- **WHEN** the final installer-marker push starts Desktop, or Desktop is manually dispatched for the candidate
- **THEN** all three installers are built from the exact candidate commit and every applicable Windows job,
  including the open-app `0.11.6` upgrade acceptance, runs and passes

#### Scenario: Candidate artifacts are handed over

- **WHEN** the final Desktop run is green
- **THEN** their three release-named executables, the final guide and `SHA256SUMS.txt` are assembled in the
  untracked `installers-ci-0.12.2/` folder and their exact filenames, byte sizes, SHA-256 hashes and Desktop run
  URL are recorded

#### Scenario: The candidate remains unpublished

- **WHEN** the on-demand candidate build completes without a release tag
- **THEN** no tag, draft release or published release is created
