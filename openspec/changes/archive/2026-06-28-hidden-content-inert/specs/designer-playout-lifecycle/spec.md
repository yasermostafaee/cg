# designer-playout-lifecycle (B-034 delta)

## ADDED Requirements

### Requirement: A hidden content element is inert

A content element marked `visible: false` SHALL be fully inert for playout: it SHALL NOT drive a
content-driven hold — neither its own scope's hold nor (via a parent's `holdOverrides`) a parent's —
regardless of `drivesHold`, and SHALL NOT be rendered, listed in the Playout hold checklist (own or
nested), counted toward the infinite-repeat warning, shown in the preview per-element timing
controls, raised as an export preflight diagnostic, or (a hidden sequence) make the scene steppable
via the preview transport Next control. This is a HARD gate that takes precedence over
`drivesHold` and per-instance `holdOverrides`: so a hidden `repeat: 'infinite'` ticker / sequence no
longer freezes the graphic — a composition whose only hold-driving content is hidden has NO effective
drivers and resolves its hold to `timed` (B-032). Because the gate is applied where each runtime
content-driver is BUILT (so a hidden element is absent from the unfiltered `contentDrivers` array a
parent override re-filters), a parent `holdOverrides` force-include CANNOT resurrect a hidden nested
element. Unhiding the element restores all of the above.

Visibility PROPAGATES through ancestors: a composition INSTANCE or container marked `visible: false`
makes its ENTIRE subtree inert — EVERY descendant content element, regardless of the descendant's own
`visible`. The hold aggregation, the checklist walks (own + nested), the preview per-element timing,
the export preflight, and the transport-step (`canStepScene`) predicate SHALL all SHORT-CIRCUIT the
whole subtree the moment they descend into a hidden instance/container, BEFORE collecting any
descendant driver — mirroring render (a hidden instance is `display: none`, so its subtree is not
drawn). So a VISIBLE infinite sequence inside a HIDDEN instance does not keep the parent open.

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

#### Scenario: A parent override cannot resurrect a hidden nested driver

- **WHEN** a parent composition instances a child whose only content is a hidden `repeat: 'infinite'`
  driver, and the parent sets a per-instance `holdOverrides` entry force-including that driver
- **THEN** the override is a no-op (the hidden element is absent from the runtime's `contentDrivers`),
  so the parent has no effective drivers and resolves its hold to `timed` and settles
- **AND** the parent's nested hold checklist shows no row for that hidden driver; un-hiding it restores
  the row and its hold participation

#### Scenario: A hidden finite ticker raises no export preflight diagnostic

- **WHEN** a composition has a TIMED hold and a finite-repeat ticker that is hidden
- **THEN** the single-file exporter does not emit the `ticker-finite-with-timed-hold` info diagnostic
  for it (a hidden ticker is inert, so there is nothing to warn about)

#### Scenario: A hidden sequence does not make the scene steppable

- **WHEN** the only sequence in the scene (or its compositions) is hidden
- **THEN** the preview transport's Next control is disabled (the scene is not steppable) — un-hiding
  the sequence re-enables it

#### Scenario: A hidden composition instance makes its whole subtree inert

- **WHEN** a content-driven parent instances a child whose own content is VISIBLE (e.g. a
  `repeat: 'infinite'` sequence) but the INSTANCE is hidden (`visible: false`), and a separate VISIBLE
  finite driver is what should close the parent
- **THEN** the hidden instance's whole subtree drives nothing — the parent settles when the visible
  finite driver completes (it is NOT held open by the hidden instance's visible infinite content)
- **AND** the hidden instance contributes no checklist rows, no preview-timing scope, and no render;
  un-hiding the instance restores its subtree's participation
