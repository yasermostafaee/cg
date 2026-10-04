# designer-live-source

## ADDED Requirements

### Requirement: The Designer describes a plate as the runtime composites it now

The Designer SHALL describe a Live Source, in every string about one — the Inspector's Live Source
and Frame sections, the preflight refusals, the arrangement guidance — by the current mechanism:
the page carrying the plates is composited BELOW them, CasparCG draws each picture into the plate's
declared rect, the plate paints nothing on air, and the frame is painted on the page just outside
the rect. No Designer string SHALL describe a punched hole, a mask, or a picture "behind" the page.

#### Scenario: the Inspector carries no retired mechanism

- **WHEN** a Live Source plate is selected
- **THEN** the Live Source, Frame and Transform sections contain no "hole", no "mask" and no
  "composited on a layer behind it"

#### Scenario: the refusals name plates, not holes

- **WHEN** the preflight refuses a plate inside a repeater or sequence item, an animated plate, or
  two overlapping plates
- **THEN** each message describes a plate that declares no box, a plate whose frame would slide
  from its picture, or overlapping plates — never a hole

### Requirement: The Frame colour is withheld at width 0, and the value is kept

At a stroke width of 0 the Frame section's colour field SHALL stay visible with its colour, disabled,
carrying "No frame at width 0. The colour is kept" as its tooltip. Setting a width SHALL re-enable
it with the same colour. No sentence under the fields SHALL restate this.

#### Scenario: dialling the frame off keeps the colour on screen

- **WHEN** the author sets the stroke width to 0 on a plate whose frame was green
- **THEN** the colour field still shows green, disabled, with the reason as its tooltip
- **AND** setting the width to 4 paints a green frame

### Requirement: A refusal about an unnamed plate does not repeat the kind as a name

A preflight refusal about a plate still wearing the factory name SHALL name it as "The unnamed Live
Source at (x, y)", never `Live Source "Live Source"`. A plate the author named SHALL be named.

#### Scenario: an unset, unnamed plate

- **WHEN** a freshly drawn plate at (200, 160) has no source
- **THEN** the refusal reads "The unnamed Live Source at (200, 160) has no source: …"
