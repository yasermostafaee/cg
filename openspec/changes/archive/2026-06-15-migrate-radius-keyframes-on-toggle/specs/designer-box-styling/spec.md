# designer-box-styling

## RENAMED Requirements

- FROM: `### Requirement: Collapsing per-corner to uniform drops the extra corner tracks in one undo`
- TO: `### Requirement: Toggling between uniform and per-corner migrates keyframes`

## MODIFIED Requirements

### Requirement: Toggling between uniform and per-corner migrates keyframes

Toggling a border-radius control between uniform and per-corner SHALL migrate the value and its keyframes between the uniform `cornerRadius` track and the four per-corner sub-tracks (`cornerRadius.tl/tr/br/bl`) in ONE undo step, never silently dropping a live keyframe, and SHALL leave no orphaned track that drives the runtime into a different mode than the inspector. uniform→per-corner copies the uniform value and keyframes into all four corners (lossless) and clears the uniform track; per-corner→uniform keeps the value and keyframes when all four corners are identical, otherwise takes the top-left corner as the representative and drops the other three.

#### Scenario: Uniform to per-corner copies the value and keyframes into all four corners

- **WHEN** the operator toggles a uniform border-radius (with one or more keyframes) to per-corner
- **THEN** all four sub-tracks (`cornerRadius.tl/tr/br/bl`) receive an equal-by-value copy of the uniform keyframes (same frame / value / easing / bezier) with distinct ids, the static value becomes the four-corner spread `[u,u,u,u]`, and the uniform `cornerRadius` track is cleared (nothing orphaned)

#### Scenario: Uniform to per-corner with no keyframes just spreads the static value

- **WHEN** the operator toggles a uniform border-radius that has NO keyframes to per-corner
- **THEN** the static value becomes `[u,u,u,u]` and no keyframe tracks are created (today's behavior is preserved)

#### Scenario: Per-corner to uniform keeps the value and keyframes when all four corners are identical

- **WHEN** the operator collapses a per-corner radius to uniform and all four corners are identical (equal static entries AND equal sub-tracks by value)
- **THEN** the shared value and keyframes are migrated onto the single `cornerRadius` track and the four sub-tracks are removed (no loss)

#### Scenario: Per-corner to uniform takes the top-left representative when corners differ

- **WHEN** the operator collapses a per-corner radius to uniform and the corners differ
- **THEN** the static value becomes the top-left value and the `cornerRadius.tl` keyframes migrate onto the single `cornerRadius` track, while the `tr/br/bl` corners are dropped (approved lossiness — discarded even if top-left has no keyframes)

#### Scenario: Either toggle is a single undo that restores the prior value and tracks

- **WHEN** the operator toggles in either direction and then presses undo once
- **THEN** the pre-toggle value SHAPE and its keyframe tracks are fully restored in ONE step (no orphaned still-applied tracks — the B-014 class), and a keyframe selection that referenced a dropped track is cleared rather than left dangling

#### Scenario: After either toggle the runtime mode matches the inspector

- **WHEN** either toggle completes
- **THEN** the runtime's track-presence mode (per-corner iff any `cornerRadius.tl/tr/br/bl` track exists, else uniform) matches the inspector's value-shape mode (per-corner iff the stored value is a tuple) — no orphaned track drives the wrong mode
