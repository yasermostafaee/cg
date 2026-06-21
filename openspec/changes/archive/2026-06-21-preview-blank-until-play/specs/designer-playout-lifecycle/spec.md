# designer-playout-lifecycle (delta)

## ADDED Requirements

### Requirement: The Preview modal opens loaded-but-unpainted until Play

The Preview modal SHALL open with the composition loaded but **unpainted** — the runtime in
its native pre-play `cg-pending` state with no graphic on the stage — exactly like an on-air
template after `CG ADD` and before `CG PLAY`. It SHALL NOT auto-render a static frame and
SHALL NOT auto-play. **Play** SHALL reveal the stage and run the intro → hold lifecycle (via
the runtime's existing `cg-pending` clear), and **Stop** SHALL run the outro and settle the
stage blank again. The pre-play (blank) and post-play (painted) states SHALL be identical
between the preview and the on-air / exported runtime, since both run the same runtime
source. This blank-until-play behaviour applies to the **Preview modal only**: the editor
canvas, which shares the same preview harness, SHALL keep rendering the static authoring
frame so the operator can see what they are building before any Play.

#### Scenario: The modal opens blank

- **WHEN** the operator opens the Preview modal on a composition with a painted element
- **THEN** the stage shows no graphic (the runtime is in its `cg-pending` pre-play state),
  with the composition loaded underneath ready to play

#### Scenario: Play paints the stage and runs the lifecycle

- **WHEN** the operator presses Play in the Preview modal
- **THEN** the stage reveals and runs the intro → hold lifecycle, painting the composition;
  the painted result matches what the exported composition shows once playing

#### Scenario: Stop re-blanks the stage

- **WHEN** the operator presses Stop after Play
- **THEN** the outro runs and the stage settles blank again (back to the `cg-pending` state)

#### Scenario: The editor canvas is unaffected

- **WHEN** a composition is rendered on the editor canvas (not the Preview modal)
- **THEN** it still shows the static authoring frame immediately — the blank-until-play
  behaviour does not change the canvas, only the Preview modal

#### Scenario: Pre-play and post-play states match the export

- **WHEN** a composition is previewed and then exported
- **THEN** both surfaces are blank before Play and paint the same frames once playing — the
  preview no longer diverges from the on-air/export pre-play state
