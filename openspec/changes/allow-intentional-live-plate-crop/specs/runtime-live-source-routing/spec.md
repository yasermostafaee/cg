## MODIFIED Requirements

### Requirement: A live plate's picture is FITTED into its box by a selectable mode, and is never cut under the default

A live plate SHALL carry a FIT MODE selecting how a source whose aspect differs from its box is
placed:

- **`contain`** — the DEFAULT. The whole picture, its own aspect intact, centred on BOTH axes
  inside the box. Nothing SHALL be cropped, and the leftover margin on the short axis SHALL show
  the template's own background — never the channel behind the CG layer.
- **`cover`** — scale to COVER the box with the proportions intact and clip the overflow away,
  centred so the crop takes evenly from both edges.

The fit SHALL be computed by ONE function, from which BOTH the bridge's `MIXER FILL` / `MIXER CLIP`
and the template's mask hole are derived. Neither consumer SHALL re-derive any part of it.

The mode SHALL be resolvable from the operator's per-assignment override, then the element's
authored value, then `contain`. The aspect chain (`D-147`) is a SEPARATE concern and is unchanged:
the source outranks the author for the ASPECT, while the operator outranks the author for the MODE.

CasparCG applies NO aspect correction of its own — measured on the plant, 2026-08-25, production
2.5.0 `69e8ad5` — so the source-aspect correction in `MIXER FILL` is REQUIRED and does not
double-count.

#### Scenario: A source WIDER than its box keeps its whole picture

- **WHEN** a plate's fit mode is `contain` and the source aspect is WIDER than the box **THEN** the
  picture is scaled to the box's WIDTH, centred vertically, and the whole picture is visible — no
  crop on either axis

#### Scenario: A source TALLER than its box keeps its whole picture

- **WHEN** a plate's fit mode is `contain` and the source aspect is TALLER than the box **THEN** the
  picture is scaled to the box's HEIGHT, centred horizontally, and the whole picture is visible

#### Scenario: The mask hole is punched at the fitted rect, so the margin shows the template

- **WHEN** a plate is fitted under `contain` **THEN** the template's mask hole is punched at the
  FITTED rect, not the box rect, so the margin shows the template's own background and NEVER the
  channel behind the CG layer

#### Scenario: The wire geometry and the mask hole come from one computation

- **WHEN** the fitted rect is computed **THEN** the bridge's `MIXER FILL` / `MIXER CLIP` and the
  template's mask hole are derived from THE SAME single computation, and a test asserts the two
  agree for the same plate, in the same units

#### Scenario: Crop edges fits the assigned source to the authored box

- **WHEN** the effective mode is `cover` and the assigned aspect is accepted **THEN** the Bridge
  scales the picture to cover, applies the saved Pan focus or uses a centred crop, and keeps the
  hole at the box rect

#### Scenario: An unknown aspect produces no fit in either mode

- **WHEN** no aspect is known for a plate — `resolvePlateAspect` returns `assumed: true` — **THEN**
  there is no fit in either mode, no refusal, and the picture fills the box exactly as today

#### Scenario: A matching aspect renders identically under both modes

- **WHEN** a plate's aspect MATCHES its box within tolerance **THEN** `contain` and `cover` produce
  the SAME rect, and it is byte-identical to today's

### Requirement: The aspect-mismatch refusal is conditional on the fit mode, and never loses its reason

A take SHALL NOT be refused for an aspect mismatch under contain or when the author selected
Crop edges and the effective fit remains Crop edges. In the latter case, the assigned source's
known aspect SHALL drive both the PVW crop target and the Take geometry.

A conflicting operator-only Crop edges override SHALL continue to refuse, naming the plate and
both aspects. The contain path SHALL retain the non-blocking warning and its fit consequence.
Missing and invalid assignments SHALL keep their independent refusal behavior.

#### Scenario: Contain warns instead of refusing

- **WHEN** a plate uses contain and the assigned source disagrees with the authored aspect
- **THEN** the take is not refused for the mismatch and the warning states that the whole picture may not fill the box

#### Scenario: Author-selected Crop edges takes the valid assigned source

- **WHEN** an authored preset has two Crop edges plates designed for 4:3, and both valid inputs deliver 16:9
- **THEN** PVW offers each eligible plate's Pan target using the 16:9 assigned geometry
- **AND** Take seats both sources with their own clip and uses the saved focus on its first fill

#### Scenario: Operator-only Crop edges still refuses an aspect mismatch

- **WHEN** a plate has no authored Crop edges and an operator override to Crop edges conflicts with the authored aspect
- **THEN** Take refuses with live-source-aspect-mismatch before sending playout commands
