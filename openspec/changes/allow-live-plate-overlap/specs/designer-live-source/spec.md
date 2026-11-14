## ADDED Requirements

### Requirement: A composition can restrict authored live plate overlap

The Designer SHALL offer **Allow live plate overlap** in the Composition Inspector and under
**CG Control** when one or more live plates are selected. Both controls SHALL edit the open
composition's setting. Overlaps in unrelated compositions SHALL leave this output's export
available. The option SHALL be on when absent and SHALL remain off when explicitly unchecked.
With the option off, ordinary overlapping plates SHALL remain an export-blocking error. Valid saved
linked reveals SHALL remain supported.

With the option on, Designer SHALL allow co-visible plates in the exported composition to
overlap and SHALL use the authored paint order, including the order of nested instances.
The export SHALL describe the order for each visible preset independently. The option SHALL
retain existing geometry, mask and source-identity validation. Authoring preflight SHALL name
the affected plates and preset if it can determine that their layering cannot be represented.

#### Scenario: A masked foreground plate overlaps by default

- **GIVEN** two plates overlap, the foreground plate has a single-plate mask and the open output has no explicit overlap setting
- **THEN** export succeeds and the foreground picture paints over the lower plate inside the mask
- **WHEN** the author unchecks **Allow live plate overlap** in the open output
- **THEN** ordinary overlap is blocked and saving and reopening preserves that restriction

#### Scenario: Nested frames follow each preset's paint order

- **GIVEN** the composition allows overlap and its presets show different sets or orders of nested frames
- **WHEN** the author switches presets or exports the composition
- **THEN** each preset uses its own authored front-to-back order for its co-visible plates

#### Scenario: An existing linked reveal stays valid

- **GIVEN** two plates have a valid linked reveal and **Allow live plate overlap** is off
- **THEN** their overlap remains valid and the reveal keeps its authored windows

## MODIFIED Requirements

### Requirement: An element blocking the export is MARKED on the canvas

Every element that is the subject of an ERROR-severity preflight issue SHALL be marked on the canvas,
whether or not it is selected, and the mark SHALL clear as soon as the geometry stops producing the
issue.

The mark SHALL use the design system's existing `danger` treatment and SHALL NOT be confusable with
the selection outline or a hover state. Colour SHALL NOT be the only channel: the mark SHALL also
carry a non-chromatic signal and an accessible description naming the problem.

Where an issue names TWO participants — an overlap files one issue per element — BOTH SHALL be marked.

The mark SHALL be driven by the live preflight output, never by selection, and SHALL NOT intercept
pointer input.

#### Scenario: Both boxes with an overlap error are marked

- **WHEN** preflight reports a disallowed overlap **THEN** both participants are marked on the canvas
- **WHEN** either is inspected **THEN** its mark carries the issue's own message as an accessible
  description

#### Scenario: The mark is independent of selection

- **WHEN** an offending element is not selected **THEN** it is still marked
- **WHEN** an element is selected but has no error **THEN** it carries the selection outline and no
  error mark

#### Scenario: The mark clears when the geometry is fixed

- **WHEN** the author moves the boxes apart **THEN** the marks disappear without any further action

#### Scenario: An off-frame box is marked the same way

- **WHEN** a Live Source is partly outside the frame **THEN** that box is marked, with its own message

#### Scenario: A clean composition marks nothing

- **WHEN** a composition has no error-severity issues **THEN** no element is marked

### Requirement: The overlap rule ignores floating-point noise, and only noise

Every comparison that decides whether two Live Source rects share area SHALL treat two coordinates as
EQUAL when they differ by less than the floating-point format's own noise floor at their magnitude,
and SHALL use ONE shared predicate to do so across every copy of the rule — the Designer's export
preflight (both the per-document AABB pass and the per-arrangement / per-look flattened pass) and the
scene flattener's mask-hole membership test.

The floor SHALL be expressed as a small multiple of the double's epsilon scaled to the magnitudes
being compared (a ULP-relative epsilon), and SHALL NOT be an absolute pixel figure. This is what makes
it provably a **noise filter and not a product tolerance**: it says nothing about how close two holes
may sit on air, only that two numbers which the arithmetic cannot distinguish are not evidence of a
collision. A guard chosen in pixels would be a product decision about `D-137`'s rule; this one is not.

The strict inequality itself SHALL be unchanged: exactly touching edges SHALL still NOT be an overlap,
so flush abutment remains buildable. Only the INPUTS are guarded. An overlap large enough for the
author to have caused it — `0.01` px is ten orders of magnitude above the floor — SHALL count as
an overlap. With **Allow live plate overlap** off, preflight SHALL report an error for that overlap
unless a valid saved linked reveal exempts it.

#### Scenario: Two flush plates inside a scaled composition instance are accepted

- **WHEN** two plates abut at exactly equal coordinates in their composition's own
  units, and that composition is instanced at a size that is not its own resolution
  (so every flattened coordinate is multiplied by a non-integer `preScale`)
- **THEN** no overlap error is raised, and neither plate punches a mask hole
  through the other

#### Scenario: A genuine sub-pixel overlap still fires

- **GIVEN** **Allow live plate overlap** is off and the composition has no linked reveal for the pair
- **WHEN** two plates in the same scaled instance overlap by 0.01 scene pixels
- **THEN** the overlap error is raised against BOTH plates, exactly as `D-137` requires

#### Scenario: Exactly flush is still not an overlap at preScale 1

- **WHEN** two plates abut exactly, with no scaling anywhere in the chain
- **THEN** no overlap error is raised — the boundary the rule already had is unmoved

#### Scenario: A residue value stored by an older project no longer blocks the Export

- **WHEN** a project saved before this change holds a coordinate a drag committed as
  `123.99999999999999` against a neighbour's edge at `124`
- **THEN** the Export is not refused, and the Issues panel does not name the two plates
