# designer-playout-lifecycle (B-034 delta)

## ADDED Requirements

### Requirement: A hidden content element is inert

A content element marked `visible: false` SHALL be fully inert for playout: it SHALL NOT drive a
content-driven hold — neither its own scope's hold nor (via a parent's `holdOverrides`) a parent's —
regardless of `drivesHold`, and SHALL NOT be rendered, listed in the Playout hold checklist, counted
toward the infinite-repeat warning, or shown in the preview per-element timing controls. This is a
HARD gate that takes precedence over `drivesHold` and per-instance `holdOverrides`: so a hidden
`repeat: 'infinite'` ticker / sequence no longer freezes the graphic — a composition whose only
hold-driving content is hidden has NO effective drivers and resolves its hold to `timed` (B-032).
Unhiding the element restores all of the above.

#### Scenario: A hidden infinite driver does not force an infinite hold

- **WHEN** a content-driven composition's only hold-driving content is a `repeat: 'infinite'` ticker
  or sequence that is hidden (`visible: false`)
- **THEN** the hidden element does not drive the hold, so the composition has no effective drivers and
  resolves to a timed hold (honoring `holdMs`) and settles — it is not frozen until `stop()`

#### Scenario: A hidden element is absent from the hold checklist and preview timing

- **WHEN** a content element (ticker / sequence / countdown clock) is hidden
- **THEN** it is not listed in the Playout "which content closes the graphic?" checklist (own or
  nested), not counted toward the infinite-repeat warning, and not shown in the preview per-element
  timing controls

#### Scenario: A hidden element is not rendered

- **WHEN** a content element is hidden
- **THEN** it is not rendered (`display: none`) on the canvas, in the preview, and in exports

#### Scenario: The hidden gate overrides drivesHold and per-instance overrides

- **WHEN** a hidden content element has `drivesHold: true` (or a parent's `holdOverrides` would
  force-include it)
- **THEN** it is STILL inert (the `visible: false` gate wins) — it does not drive the hold
