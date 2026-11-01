# desktop-delivery

## MODIFIED Requirements

### Requirement: A candidate uses one fresh release identity

CG Control, CG Designer and CG Bridge SHALL carry `0.12.4` in every release-version and installer surface.
Because `0.12.3` already identifies delivered bytes, current artifacts SHALL NOT reuse it. All three installers
SHALL be built from one commit and delivered as one matching set.

#### Scenario: Matching candidate is built

- **WHEN** the on-demand Desktop workflow builds the candidate
- **THEN** all three filenames and installed version records say `0.12.4`

#### Scenario: One source drifts

- **WHEN** any release-version source disagrees with `0.12.4`
- **THEN** packaging stops before producing installers

### Requirement: The installed Designer proves native text-source access

The installed Designer smoke SHALL invoke a confined text-source command and prove that the call reaches the
Rust file reader instead of being refused by Tauri ACL.

#### Scenario: Packaged command crosses ACL

- **WHEN** the installed-app smoke invokes the text-source reload command with a deliberately absent path
- **THEN** the reader returns its path-resolution error and no `not allowed by ACL` refusal occurs

### Requirement: The candidate proves delivery and remains unpublished

The full local gate and E2E lane SHALL pass, together with Linux workspace/E2E and every applicable Windows
installer, smoke and upgrade job. The exact installer artifacts SHALL be downloaded, checksummed and placed in
the local handoff folders. The candidate SHALL NOT create a tag, draft release or published release.

#### Scenario: Delivery completes

- **WHEN** the exact candidate commit is green on Linux and Windows
- **THEN** its three release-named installers and checksums are retained locally with the run evidence

#### Scenario: Candidate remains unpublished

- **WHEN** the installer build completes without a release tag
- **THEN** no release is published
