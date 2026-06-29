# designer-sequence-element (D-117 delta)

## ADDED Requirements

### Requirement: Multi-line sequence item text

The runtime SHALL render a sequence item's text as MULTI-LINE on air: it SHALL honor explicit `\n`
line breaks AND auto-wrap a line longer than the element width onto additional lines
(`white-space: pre-wrap` + a cap to the item's grid cell + `overflow-wrap: break-word`), composing
authored breaks with wrapping. The item SHALL wrap inside the FIXED element box (grid cell), and its
per-item transition (push-up etc.) SHALL animate the WHOLE multi-line block as one unit by the fixed
box height — content exits/enters cleanly, never cut mid-line. `align` / `verticalAlign` / RTL
reading direction SHALL still position the taller item correctly. A single-line item SHALL render
exactly as before.

#### Scenario: Explicit line breaks

- **WHEN** a sequence item's text contains `\n`
- **THEN** it breaks at exactly those points on air

#### Scenario: Long line auto-wraps at the element width

- **WHEN** a sequence item's line is longer than the element width
- **THEN** it wraps onto additional lines (no overflow past the box) rather than one over-long line

#### Scenario: Multi-line height adapts and alignment/RTL still position it

- **WHEN** a sequence item becomes multi-line
- **THEN** its block height adapts and `align` / `verticalAlign` / RTL reading direction still
  position it correctly within the box

#### Scenario: The multi-line block transitions as one unit

- **WHEN** a multi-line sequence item enters or exits via its transition (e.g. push-up)
- **THEN** the transition animates the full multi-line block cleanly by the fixed box height (no
  mid-line cut)

#### Scenario: Preview equals export

- **WHEN** a multi-line sequence item is previewed and exported
- **THEN** the on-air rendering is identical (both go through the same runtime sequence driver)

#### Scenario: Single-line unchanged

- **WHEN** a sequence item is single-line (no `\n`, fits the element width)
- **THEN** its rendering is unchanged (no regression)
