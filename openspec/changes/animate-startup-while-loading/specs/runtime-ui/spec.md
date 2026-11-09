## MODIFIED Requirements

### Requirement: The phase readout names real boot steps and advances by completed phase

The splash SHALL name initialization, bridge selection and interface start as they occur.
The rail and percentage SHALL reflect completed phases. The percentage SHALL be monotone and reach
100% when bootstrap completes. The phase label SHALL fade out with the splash.

#### Scenario: A bridge selection stalls

- **WHEN** the console is still waiting for bridge selection
- **THEN** the name and percentage continue to report that unfinished phase
- **AND** a CSS animation indicates that startup is ongoing when motion is allowed

#### Scenario: Boot completes

- **WHEN** bridge selection resolves and the shell commits
- **THEN** the rail and readout reach 100% and the label leaves with the splash

## REMOVED Requirements

### Requirement: The splash hold has a cold floor, a warm floor, and a hard ceiling

**Reason:** P-078 supersedes the fixed minimum presentation time with the real startup duration.
**Migration:** Use the bootstrap-completion requirement below. The 20-second backstop still applies.

## ADDED Requirements

### Requirement: Splash dismissal follows bootstrap completion

The splash SHALL begin dismissing when the platform resolves and the first application shell commits,
or when the absolute 20-second ceiling expires. It SHALL release pointer input immediately when
dismissal begins. A refused bridge SHALL count as resolved. Duplicate completion signals SHALL be
idempotent. Stack, health and lock snapshots SHALL be outside this gate.

#### Scenario: First launch and reload

- **WHEN** boot completes before the backstop on a first launch or a reload
- **THEN** dismissal and input release begin at that instant

#### Scenario: Boot never completes

- **WHEN** the backstop expires
- **THEN** the splash dismisses without claiming that the remaining work finished
