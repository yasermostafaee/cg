## MODIFIED Requirements

### Requirement: Per-composition Preview and Export live on a dedicated action bar

The action bar SHALL export the open composition and its nested closure while suggesting the containing project's name for the output file. During export it SHALL expose a busy/progress state and prevent a duplicate action. A successful write SHALL use a success notice; a failed write SHALL use a persistent error notice.

#### Scenario: Project-named export

- **WHEN** composition `Lower third` in project `News package` is exported **THEN** the save dialog suggests `News-package.vcg` while the package still contains only `Lower third` and its closure

#### Scenario: Honest progress and result

- **WHEN** export runs and succeeds **THEN** the action remains busy until completion and the final notice uses the success treatment
