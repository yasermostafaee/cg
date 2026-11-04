## ADDED Requirements

### Requirement: Inspector SHALL keep teaching contextual

The Designer Inspector SHALL keep controls, values, concise current state, errors and blocking
conditions visible. Instructional or one-time explanatory copy SHALL be reachable through an Info
action that opens a readable help surface instead of remaining as persistent paragraph text.

#### Scenario: Playout controls at rest

- **WHEN** the Playout Inspector renders
- **THEN** ownership groups, out point, content start and hold-loop state are visible compactly
- **AND** their longer explanations are absent from the resting Inspector
- **AND** each necessary explanation is reachable through a labelled Info action

#### Scenario: Help is activated

- **WHEN** an author activates one of the Playout Info actions
- **THEN** the shared help modal presents the complete explanation and remedy at reading size

#### Scenario: Real errors remain visible

- **WHEN** a Playout setting has a blocking error
- **THEN** the error remains visible and is not hidden as ordinary instructional help

#### Scenario: Infinite content keeps a compact warning

- **WHEN** a selected content driver repeats forever and prevents automatic close
- **THEN** its `loops forever` badge and a compact `Holds until stop` state remain visible
- **AND** the full consequence and remedies are available through the aligned Info action rather
  than a persistent paragraph-sized callout

## MODIFIED Requirements

### Requirement: An infinite-repeat hold driver is flagged on own and nested rows (supersedes D-111)

When the hold is content-driven, the Playback section SHALL flag any hold driver — an own-content
row OR a writable nested row — whose element has `repeat: 'infinite'` and is EFFECTIVELY
participating (own: `drivesHold !== false`; nested: the per-instance effective value is `true`). The
row SHALL retain a compact `loops forever` badge and SHALL clear it when the element is excluded or
given a finite repeat. When EVERY effective hold driver is infinite-repeat, the checklist SHALL show
a compact `Holds until stop` state with an aligned Info action containing the full consequence and
remedies; it SHALL NOT reserve the resting Inspector for a paragraph-sized alert. Runtime behaviour
is unchanged.

#### Scenario: An effectively-driving infinite nested row is flagged

- **WHEN** a writable nested row's element has `repeat: 'infinite'` and is effectively driving the
  parent's hold
- **THEN** the row shows a compact `loops forever` badge

#### Scenario: Excluding the infinite nested element via override clears the warning

- **WHEN** the author toggles that nested infinite row off
- **THEN** its badge clears and it no longer counts toward the checklist-level state

#### Scenario: Every effective driver repeats forever

- **WHEN** every effective hold driver repeats forever
- **THEN** the checklist shows the compact `Holds until stop` state
- **AND** activating its aligned Info action presents the full consequence and remedies
- **AND** no persistent paragraph-sized callout is present

#### Scenario: A finite nested driver shows no warning

- **WHEN** a nested hold driver's repeat is finite
- **THEN** that row shows no infinite-repeat badge
