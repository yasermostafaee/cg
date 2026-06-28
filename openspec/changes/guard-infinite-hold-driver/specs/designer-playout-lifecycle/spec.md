# designer-playout-lifecycle (D-111 delta)

## ADDED Requirements

### Requirement: The Playout checklist warns when an infinite-repeat element drives the hold

When the hold is content-driven, the Playout section SHALL flag any hold-driving content
element whose `repeat` is `'infinite'` (a ticker or sequence that still participates —
`drivesHold !== false`): such an element never completes, so the content-driven hold (a
`Promise.all` over its drivers) runs until `stop()` and the graphic does not auto-close. The
flag SHALL appear inline on the element's checklist row (D-107) and, READ-ONLY, on the
nested-composition indicator row (D-108) for an instance that reaches an infinite-repeat
driver, so the operator can open the composition where it lives. When EVERY hold driver of the
composition — its own PLUS those reached through nested instances — is infinite-repeat (so
nothing can end the hold on content), the warning SHALL be PROMINENT at the checklist level (an
alert), not only per-row. The warning SHALL clear when the element is excluded
(`drivesHold === false`) or given a finite `repeat`, and SHALL NOT appear for a finite-repeat
element (no false positives). This is presentation only: the runtime behaviour (infinite content
⇒ hold until `stop()`, D-104) is unchanged.

#### Scenario: An infinite-repeat driver is flagged on its checklist row

- **WHEN** a content element with `repeat: 'infinite'` participates in a content-driven hold
  (`drivesHold !== false`)
- **THEN** its checklist row shows an inline warning that the element makes the hold run until
  stop (the graphic won't auto-close)

#### Scenario: An infinite-repeat driver inside a nested composition is flagged read-only

- **WHEN** the nested-content indicator (D-108) includes an instance that reaches an
  infinite-repeat hold driver
- **THEN** that nested row shows the same warning (read-only), pointing the operator to the
  composition where it lives

#### Scenario: Every driver infinite ⇒ a prominent alert

- **WHEN** every hold driver of the composition (own + nested) is infinite-repeat, so the hold
  can never end on content
- **THEN** the warning is prominent at the checklist level (an alert), not only per-row

#### Scenario: Excluding or making the element finite clears the warning

- **WHEN** the operator excludes the infinite-repeat element (`drivesHold === false`) or gives it
  a finite `repeat`
- **THEN** the warning clears

#### Scenario: A finite-repeat driver shows no warning

- **WHEN** a hold-driving element's `repeat` is finite (or it is a countdown clock, which is
  always finite)
- **THEN** no warning is shown for it (no false positives)
