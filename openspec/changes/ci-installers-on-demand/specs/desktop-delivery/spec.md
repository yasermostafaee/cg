## ADDED Requirements

### Requirement: The Windows pipeline SHALL build the installers on request only

The `installers` job of the Desktop workflow (`.github/workflows/desktop.yml`) SHALL run only when the
workflow was not started by a push (a manual run), when the ref is a tag `v*`, or when the head commit
message contains `[installers]`; on any other push it SHALL be skipped, and with it every job that needs
it. A tag SHALL build and check everything it did before this requirement, and the draft release SHALL
still be opened on a tag only. The Linux gate and `e2e` (`pr.yml`) are not governed by this and run on
every push. Where another requirement says "when the desktop workflow runs", it means a run in which the
`installers` job ran. `CI-INSTALLERS-ON-DEMAND-01`.

The three installers' artifacts SHALL be kept 30 days from a tag's run and 7 days from any other run, and
the engines (`installer-engines`, read only by the same run's smokes) 2 days.

#### Scenario: An ordinary push builds nothing on Windows

- **WHEN** a commit whose message does not contain `[installers]` is pushed to `dev` or `main` **THEN** the
  Desktop run shows `installers` and every job that needs it skipped, and uploads no artifact

#### Scenario: A manual run builds and checks everything

- **WHEN** the owner runs `gh workflow run Desktop --ref dev` **THEN** the installers are built and every
  smoke and acceptance job runs against them; the draft release is not opened

#### Scenario: The marker builds on a push

- **WHEN** a commit whose message contains `[installers]` is the head of a push to `dev` **THEN** the
  installers are built and every smoke and acceptance job runs

#### Scenario: A tag is unchanged

- **WHEN** a tag `v<version>` is pushed **THEN** the installers are built from the tagged commit, every
  smoke and acceptance job runs, and the draft release is opened once all of them pass, exactly as before

#### Scenario: Artifact lives

- **WHEN** the installers are built by a manual run or the marker **THEN** each installer artifact expires
  7 days later and `installer-engines` 2 days later; **WHEN** they are built by a tag **THEN** each
  installer artifact expires 30 days later
