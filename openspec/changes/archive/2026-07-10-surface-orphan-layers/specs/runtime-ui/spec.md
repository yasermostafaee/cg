# runtime-ui (surface orphan layers — R-009)

## ADDED Requirements

### Requirement: Orphan-layer warning surface with per-layer Clear

The Runtime UI SHALL surface the bridge's orphan-layer set as a persistent
warning strip: one row per orphan naming the channel-layer ("Layer 1-60 is on
air but not on your stack"), rendered with `role="alert"`, visible while the
orphan persists (no auto-dismiss), and rendered NOT AT ALL when the set is
empty — no idle noise. The surface SHALL subscribe to the pushed orphan set
and load the initial state on mount.

Each row SHALL offer an explicit Clear control gated by a confirmation; on
confirm the UI issues `layers.clear` for that layer, surfaces a failure via
the command-error channel, and treats the row's disappearance (the bridge's
observed-empty resolution) as success. The UI SHALL never clear a layer
without the operator's explicit confirmation.

#### Scenario: Orphans appear and are named; idle is quiet

- **WHEN** the bridge publishes a non-empty orphan set **THEN** the warning
  strip appears naming each channel-layer
- **WHEN** the orphan set is empty **THEN** no warning surface is rendered

#### Scenario: Confirm-gated Clear

- **WHEN** the operator clicks a row's Clear and confirms **THEN** the UI
  issues `layers.clear` for exactly that layer, and the row disappears when
  the bridge resolves it on observed empty
- **WHEN** the operator cancels the confirmation **THEN** nothing is sent
