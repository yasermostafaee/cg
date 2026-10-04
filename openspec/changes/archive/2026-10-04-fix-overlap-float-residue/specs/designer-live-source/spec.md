# designer-live-source

## ADDED Requirements

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
author to have caused it — `0.01` px is ten orders of magnitude above the floor — SHALL still raise
the error.

#### Scenario: Two flush plates inside a scaled composition instance are accepted

- **WHEN** two plates abut at exactly equal coordinates in their composition's own
  units, and that composition is instanced at a size that is not its own resolution
  (so every flattened coordinate is multiplied by a non-integer `preScale`)
- **THEN** no overlap error is raised, and neither plate punches a mask hole
  through the other

#### Scenario: A genuine sub-pixel overlap still fires

- **WHEN** two plates in the same scaled instance overlap by 0.01 scene pixels
- **THEN** the overlap error is raised against BOTH plates, exactly as `D-137` requires

#### Scenario: Exactly flush is still not an overlap at preScale 1

- **WHEN** two plates abut exactly, with no scaling anywhere in the chain
- **THEN** no overlap error is raised — the boundary the rule already had is unmoved

#### Scenario: A residue value stored by an older project no longer blocks the Export

- **WHEN** a project saved before this change holds a coordinate a drag committed as
  `123.99999999999999` against a neighbour's edge at `124`
- **THEN** the Export is not refused, and the Issues panel does not name the two plates
