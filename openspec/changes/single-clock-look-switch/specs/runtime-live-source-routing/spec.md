# Live Source routing — the single-clock look switch

## ADDED Requirements

### Requirement: A plate-bearing package composites BELOW its plates, on its own declared bank

A template that declares live plates SHALL have its page placed on a layer BELOW every live-source
layer, so the plates composite OVER it and no hole is ever needed. A template that declares none
SHALL keep today's placement, on the operator bank above the live band, so the furniture it carries
still draws over the pictures.

The low placement SHALL be a SECOND DECLARED BANK — layers 1–9 by default — and NOT an item whose
slot differs from its row. The row SHALL remain the layer, unchanged, because retention, occupancy,
the fixed binding and every AMCP target read that one coordinate, and two places holding it is the
drift this project has already rejected once.

**Classification SHALL be automatic at import**, derived from whether the package declares plates,
and SHALL NOT be an operator choice: a flag someone forgets to set is a silent fault on air.

**Loading onto the wrong bank SHALL be REFUSED with a message naming the reason and the bank that
would accept it.** A plate-bearing page on a high row renders above its own plates, which — with the
mask retired — is every plate covered by its own backdrop.

**A retained plate-bearing item held against a high slot SHALL be MIGRATED to a low slot on restore
and the migration reported**, and refused only when no low slot is free. A restore that refuses
leaves the rundown short a row after a bridge restart; a restore that silently places a bed on layer
95 puts the defect on air.

Under `contain` the fitted rect is smaller than its box and `FILL` equals `CLIP`, so the margin SHALL
show the plate-bearing page beneath the picture and never black — the same requirement `C-028` states,
now satisfied by composition order rather than by a hole.

#### Scenario: A plate-bearing package is placed below its plates

- **WHEN** a template declaring live plates is loaded
- **THEN** its page is placed on a layer below every live-source layer, and its plates composite over
  it with no mask anywhere

#### Scenario: A furniture package still draws over the pictures

- **GIVEN** a logo or a lower third carrying no live plate
- **WHEN** it is loaded onto an operator row and taken
- **THEN** it composites above the live layers exactly as before

#### Scenario: The wrong bank is refused by name

- **WHEN** a plate-bearing package is loaded onto an operator row above the live band
- **THEN** it is refused with a message naming that it must sit below its plates and which bank
  accepts it

#### Scenario: A retained bed is migrated rather than restored onto its old row

- **GIVEN** a retained plate-bearing item recorded against a high slot
- **WHEN** the bridge restores it
- **THEN** it is placed on a low slot and the migration is reported, and it is refused with a reason
  only when no low slot is free

#### Scenario: The contain margin shows the template, not black

- **GIVEN** a plate whose source aspect differs from its box under `contain`
- **WHEN** it is on air
- **THEN** the margin on the short axis shows the plate-bearing page's own background

### Requirement: A look switch moves only the mixer, and the page is not part of the switch

A look switch SHALL consist of `MIXER FILL` and `MIXER CLIP` per plate and nothing that has to land
on a particular frame. The page SHALL still be TOLD which look is active — the look drives which of
its own decoration is visible — but the telling SHALL NOT need to coincide with the fills, because no
hole depends on it.

Consequently the mask SHALL be retired rather than disabled: nothing SHALL compute, apply, clear or
re-punch a hole, and the transition machinery built to cover the two clocks disagreeing SHALL be
removed with it.

#### Scenario: A switch carries no mask work

- **WHEN** the operator switches look
- **THEN** the wire carries `MIXER FILL`/`CLIP` per plate, and no command whose timing affects
  whether a picture and a hole agree

#### Scenario: The page still follows the look

- **WHEN** a look is entered
- **THEN** the page shows that look's own decoration and hides the others, on its own clock, with
  nothing on air depending on which frame that lands

## MODIFIED Requirements

### Requirement: The page is TOLD the installation facts its mask depends on

The page SHALL be TOLD the resolved source aspect and fit mode **for as long as it renders anything
whose geometry depends on them**. With the plates composited above the page there is no hole, so the
page's need for these facts ends with the mask: the fit is applied by the BRIDGE, in `MIXER FILL` and
`MIXER CLIP`, from the assigned source's aspect and the operator's mode — one derivation, on the side
that owns the picture.

The reserved `__cg` control key SHALL remain the transport for the ACTIVE LOOK, which the page does
still act on, and SHALL stop carrying plate fit facts once nothing on the page consumes them. Control
data SHALL continue to be stripped before anything treats the payload as field values.

Where the page renders a plate PLACEHOLDER rather than a hole — the Designer canvas and the
rehearsal frame — it SHALL fall back to the scene's own statement, the element's `expectedAspect` and
`fitMode`, exactly as it does today when no control payload has been received.

#### Scenario: The look reaches the page with the take

- **WHEN** a template is taken **THEN** the `CG ADD` payload carries the active look under the
  reserved control key

#### Scenario: The fit is applied once, by the bridge

- **WHEN** a plate is seated **THEN** the resolved aspect and mode are applied in `MIXER FILL` and
  `MIXER CLIP`, and no second application of the same facts exists on the page

#### Scenario: Control data cannot be mistaken for a field value

- **WHEN** a payload carrying control data is applied **THEN** the reserved key is stripped before
  anything treats the payload as field values, exactly as it is for the active look
