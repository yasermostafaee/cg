# designer-playout-lifecycle (D-112 delta)

## MODIFIED Requirements

### Requirement: The Playout checklist surfaces nested-composition hold-driving content (read-only)

When the active composition's hold is content-driven, the Playout section SHALL surface the
hold-driving content (`ticker` / `sequence` / countdown `clock`) inside each IMMEDIATE nested
composition instance as **WRITABLE** rows — not read-only. Each row SHALL show a checkbox reflecting
the element's EFFECTIVE participation in THIS parent's hold (the instance's per-instance override if
set, else the element's own `drivesHold`; absent ⇒ drives). Toggling a row SHALL write a per-instance
override on the parent's composition-instance element (NOT on the shared child), so other instances of
the same child are unaffected. The instance's drill-in SHALL remain (to edit the shared child or a
deeper instance level); deeper nested content (inside the instance's OWN nested instances) is edited by
drilling in, one level at a time. Rows for a finite countdown clock and finite/infinite ticker /
sequence are all listed; wall/countup clocks never appear (they cannot end a hold).

#### Scenario: Nested content is listed with a writable toggle

- **WHEN** a parent nests a composition instance whose referenced composition contains hold-driving
  content
- **THEN** the parent's content-driven checklist lists that content with a writable "drives the hold"
  checkbox (not a read-only indicator), reflecting its effective participation, plus the drill-in

#### Scenario: Toggling a nested row writes a per-instance override

- **WHEN** the operator toggles a nested row off (or on) in the parent
- **THEN** the change is stored as `holdOverrides[elementId]` on the parent's composition-instance
  element, leaving the shared child element's own `drivesHold` untouched

#### Scenario: Deeper nested content is edited by drilling in

- **WHEN** the nested instance itself contains a deeper composition instance with hold-driving content
- **THEN** the parent surfaces the immediate level's content as writable rows and the operator drills
  into the instance to edit the deeper level's per-instance overrides there

#### Scenario: A content-driven (coordinator) nested child stays read-only

- **WHEN** the immediate nested child is itself content-driven (a coordinator — the parent awaits its
  settle, so a per-instance override on its content would be inert)
- **THEN** the parent surfaces that child's content READ-ONLY (a drill-in, not writable rows); the
  operator edits the child's own participation by drilling in

## ADDED Requirements

### Requirement: Nested content participation is a per-instance override on the parent

A nested content element's participation in its parent hold SHALL resolve to the composition-instance's
optional `holdOverrides[id]` (keyed by the nested content element's stable id) when that key is defined,
else the element's own `drivesHold !== false` (absent ⇒ drives, `false` ⇒ excluded). The
override SHALL affect ONLY the parent's hold aggregation — never the shared child element, never the
child composition's OWN hold, never whether the content starts / runs / is visible (an excluded looping
element keeps running until the parent's exit). Each composition-instance level overrides only its
referenced composition's OWN direct content (recursing containers, NOT deeper instances); a deeper
instance carries its own `holdOverrides`, applied at its level (cascade per level). The field is
OPTIONAL and additive — scenes without it are unchanged, it round-trips through `.vcg` and single-file
HTML export, and the schema version is NOT bumped.

#### Scenario: An instance override excludes a nested element from the parent hold

- **WHEN** a parent nests a child with a finite ticker and a `repeat: 'infinite'` sequence, and the
  parent sets `holdOverrides[sequenceId] = false` on that instance
- **THEN** the parent's content-driven hold ends when the finite ticker completes (then plays its
  outro), while the looping sequence keeps running until the parent's exit — matching the
  single-composition behaviour of unchecking the sequence

#### Scenario: Per-instance isolation

- **WHEN** the same child composition is instanced in two parents (or twice in one parent) and only the
  first instance sets `holdOverrides[id] = false`
- **THEN** the second instance's hold is unaffected — its element resolves to the element's own
  `drivesHold`

#### Scenario: Fallback when no override

- **WHEN** a nested content element has no `holdOverrides` entry on its instance
- **THEN** its effective participation falls back to its own `drivesHold` (absent ⇒ drives, `false` ⇒
  excluded) — backward compatible with pre-D-112 scenes

#### Scenario: Overrides survive round-trips

- **WHEN** a scene with per-instance `holdOverrides` is packed to `.vcg` and unpacked, or exported as
  single-file HTML and re-parsed
- **THEN** the `holdOverrides` survive unchanged and the scene validates

### Requirement: An infinite-repeat hold driver is flagged on own and nested rows (supersedes D-111)

When the hold is content-driven, the Playout section SHALL flag any hold driver — an own-content row OR
a writable nested row — whose element has `repeat: 'infinite'` and is EFFECTIVELY participating (own:
`drivesHold !== false`; nested: the per-instance effective value is `true`): such a driver never
completes, so the graphic holds until `stop()` (it won't auto-close). The flag SHALL be inline on that
row and SHALL clear when the element is excluded (own `drivesHold === false`, or the nested override
turns it off) or given a finite `repeat`. When EVERY effective hold driver of the composition (own plus
those reached through nested instances, overrides applied) is infinite-repeat, the warning SHALL be
PROMINENT at the checklist level (an alert), not only per-row. A finite-repeat driver SHALL show no
warning (no false positives). This is presentation only — the runtime behaviour (infinite content ⇒
hold until `stop()`) is unchanged.

#### Scenario: An effectively-driving infinite nested row is flagged

- **WHEN** a writable nested row's element has `repeat: 'infinite'` and is effectively driving the
  parent's hold (override unset or `true`)
- **THEN** the row shows an inline warning that the graphic won't auto-close

#### Scenario: Excluding the infinite nested element via override clears the warning

- **WHEN** the operator toggles that nested infinite row off (per-instance override `false`)
- **THEN** the inline warning clears and the element no longer counts toward the prominent
  all-infinite alert

#### Scenario: A finite nested driver shows no warning

- **WHEN** a nested hold driver's `repeat` is finite (or it is a countdown clock, always finite)
- **THEN** no warning is shown for it (no false positives)
