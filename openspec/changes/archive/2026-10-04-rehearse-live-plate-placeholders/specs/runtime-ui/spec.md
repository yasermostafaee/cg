# runtime-ui

## ADDED Requirements

### Requirement: PVW marks every live plate with a labelled placeholder drawn OVER the rehearse frame

The Runtime's PVW panel SHALL draw a **labelled placeholder** over the rect of every Live Source
plate declared by a rehearsing row's template.

The placeholder SHALL be an **overlay composited by the Runtime on top of the rehearsal frame**.
The rendered page SHALL NOT change: rehearse continues to render the retained exported page
verbatim, that page continues to paint zero pixels where a Live Source is
(`live-source-multibox` design.md §12.2), and no `.vcg`, exporter or third render mode is
introduced. `buildScene`'s `mode: 'author' | 'output'` seam SHALL remain unused by this feature.

The placeholder SHALL be drawn even when the template's live plates are entirely unassigned, since
"there is a frame here" is the first of the two questions it exists to answer.

#### Scenario: A rehearsing template's live plate is marked in PVW

- **WHEN** a row whose template declares a Live Source plate is put into REHEARSE
- **THEN** PVW draws a placeholder over that plate's rect, so the operator can see at a glance that
  a live region exists there rather than a failed render

#### Scenario: The exported page is not changed by the placeholders

- **WHEN** a template carrying a Live Source is exported
- **THEN** the built page's Live Source element paints nothing — no background, no children — in
  `output` mode, exactly as before, and the placeholders exist only in the Runtime's own overlay

### Requirement: The two plate states are distinguishable WITHOUT reading the label

A placeholder SHALL render in one of exactly two visually distinct states, because they demand
different operator actions and an unassigned plate REFUSES the take:

- **ASSIGNED** — full-saturation colour bars, carrying the **plate's** name and the **assigned
  source's** operator-facing name.
- **UNASSIGNED** — a **desaturated** variant, carrying the plate's name and an explicit
  **"no source assigned"**.

The distinction SHALL be legible from colour and framing alone, before any text is read.

The source shown SHALL be the **APPLIED** assignment — what a take would actually resolve — never a
staged, unapplied draft. A draft that has not been applied still refuses the take, so showing it as
assigned would defeat the one question this surface exists to answer.

#### Scenario: An assigned plate names its source

- **WHEN** a plate has an applied assignment to a catalog entry named `Studio A`
- **THEN** its placeholder renders full-saturation bars and shows both the plate identifier and
  `Studio A`

#### Scenario: An unassigned plate says so, in a visually distinct state

- **WHEN** a plate has no applied assignment
- **THEN** its placeholder renders desaturated, is framed in the palette's attention colour, and
  carries the words `no source assigned`

#### Scenario: A staged but unapplied plate assignment does not read as assigned

- **WHEN** an operator has staged a source for a plate in the Inspector but has not applied it
- **THEN** the placeholder still renders the UNASSIGNED state, because a take at that moment would
  be refused

### Requirement: A placeholder can never be mistaken for the real picture

A placeholder SHALL be unmistakably NOT a preview of the live feed. A browser cannot display SDI or
NDI, so a placeholder that reads as a picture is worse than the blank region it replaces: it
converts "I can't see it" into "I saw it and it was fine".

Every placeholder, in both states, SHALL therefore carry non-photographic markings — procedural
colour bars, hazard striping and the word `PLACEHOLDER` — and SHALL state that the live picture is
not shown here.

#### Scenario: The placeholder declares what it is

- **WHEN** any placeholder is drawn
- **THEN** it carries the word `PLACEHOLDER`, procedural bars and hazard striping, so no state of
  it resembles an incoming camera feed

### Requirement: The placeholder is visible before Play and unchanged through it

A placeholder SHALL be drawn as soon as the row's page is available in PVW — BEFORE the operator
presses Play — and SHALL persist, unchanged, while the graphic plays and after it stops.

This is deliberate and is NOT a weakening of D-087's blank-until-play contract. That contract is a
property of the RENDERED PAGE (`body.cg-pending` hides its stage until `play()` clears it), the
rehearse frame inherits it verbatim, and the placeholder is not page content: it is a Runtime layer
composited over the frame, which reaches into no document. The page SHALL still paint nothing
before Play.

Before Play is exactly when the marker is needed: an unassigned plate REFUSES the take, and PVW is
the operator's last chance to see that before air, so a marker that appeared only after Play would
be absent at the moment it exists to serve. It persists DURING play for the "never mistakable for
the real picture" requirement: the hole is still a hole while the graphic runs, and removing the
marker then would restore the original defect at the moment the frame most resembles air.

The placeholder SHALL therefore take no lifecycle input — not readiness, not playing, not the
transport.

#### Scenario: The page is blank before Play and the marker is already up

- **WHEN** a row carrying live plates is put into REHEARSE and Play has not been pressed
- **THEN** the rendered page paints nothing, and the plate's placeholder is nonetheless visible and
  states its assignment

#### Scenario: Play changes the page and does not change the marker

- **WHEN** the operator presses PLAY on the rehearsal transport
- **THEN** the page's own elements paint, and each placeholder remains at the same box, in the same
  state, with the same words

#### Scenario: Stop settles the page blank and the marker remains

- **WHEN** the operator presses STOP
- **THEN** the page settles blank again and the placeholders are still drawn, because the live
  region is still there

### Requirement: Placeholder geometry rides the stage's own fit transform

A placeholder's rect SHALL be derived from the plate rect the template declares in SCENE pixels,
mapped to raster pixels by the SAME arithmetic the exported page applies to itself — the uniform
output scale, the letterbox padding and the anchor translate — and then displayed through the SAME
fit transform the rehearsal frames use.

No second scale factor SHALL be derived beside the stage's own: deriving one is how an overlay
drifts off the page beneath it, and the drift is invisible until the raster changes.

The mapping SHALL be pinned by a test over at least one NON-16:9 raster. On a 16:9 raster the
uniform scale is 1 and the letterbox is (0,0), so every term collapses and a wrong implementation
returns the right answer.

#### Scenario: A plate lands on its hole on a raster that letterboxes vertically

- **WHEN** a 960×540 scene is centred on a 1440×1080 channel and declares a plate at scene x=100
- **THEN** the placeholder's left edge is at raster x=435 — the value the page's own
  `translate(pad) scale(s) translate(anchor)` chain puts that scene pixel at

#### Scenario: A plate lands on its hole on a raster that pads horizontally

- **WHEN** the same scene is placed on a 2048×1080 channel, whose padding falls on the other axis
- **THEN** the placeholder is offset by that horizontal padding, and not by a vertical one

#### Scenario: The operator's placement override moves the placeholder with the graphic

- **WHEN** an operator applies a placement override to a rehearsing row
- **THEN** the row's placeholders move with its graphic, because both resolve the same
  override-else-authored-default position chain

### Requirement: PVW's stated caveats match what PVW now draws

The caveats PVW states in the panel SHALL describe what is actually drawn. The panel SHALL no
longer describe a Live Source region as showing nothing; it SHALL say that the Runtime draws a
placeholder there, that the placeholder is not the feed, and that what fills the region on air is a
CasparCG layer composited behind the template which no browser preview can show.

#### Scenario: The caveats name the placeholder

- **WHEN** the operator opens PVW's caveats disclosure
- **THEN** the text states that a Live Source region shows a Runtime-drawn placeholder rather than
  the live picture
