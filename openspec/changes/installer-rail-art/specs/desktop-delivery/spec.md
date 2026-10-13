## ADDED Requirements

### Requirement: Each installer's step rail SHALL carry its own product's art

Each installer's setup window SHALL draw, at the foot of its step rail above Help, its own product's art and
no part of another product's. CG Control's SHALL be its splash's playout scene — the three layer rows, their
wires, the program monitor and its safe-area ticks — exactly as `0.11.3` drew it. CG Designer's SHALL be its
splash's artboard: the canvas grid, the motion path and the four keyframes on it, as its splash draws them.
CG Bridge, which has no splash of its own, SHALL carry a scene of its own: three consoles, each linked to the
one service, and the service's one link on to the Playout's program monitor. Each SHALL be drawn in the
splash scene's three inks at 40 %, in the same place and footprint (192 DIPs wide, 20 in from the rail's
edge), clear of the rail's last step and of Help. `P-067`.

#### Scenario: CG Designer's rail

- **WHEN** CG Designer's installer opens **THEN** its rail's foot shows the artboard — the grid, the motion
  path and its keyframes, at the splash's own coordinates — and no part of CG Control's scene

#### Scenario: CG Bridge's rail

- **WHEN** CG Bridge's installer opens **THEN** its rail's foot shows its own scene, below its fifth step
  (Done) with a clear gap, and no part of CG Control's scene

#### Scenario: CG Control's rail is unchanged

- **WHEN** CG Control's installer opens **THEN** its rail's foot is the scene `0.11.3` drew, call for call
  — control: its pages rendered before and after the change are byte-identical

#### Scenario: Every rail is pictured

- **WHEN** the desktop workflow builds CG Setup **THEN** every page of the three setup windows is rendered
  by that build and uploaded as `setup-rail-art`, and the clean runners capture each installer's first
  screen as before
