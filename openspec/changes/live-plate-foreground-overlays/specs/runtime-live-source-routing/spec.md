## ADDED Requirements

### Requirement: Authored foreground visuals SHALL paint above all live producers

For a template whose carrier declares a foreground overlay, CG Bridge SHALL render one synchronized
transparent HTML pass on a layer higher than every live producer owned by that item. The ordinary
HTML page SHALL omit marked foreground roots and remain below the live-source band; the foreground
page SHALL retain only marked trees and their positioning ancestors. The foreground layer SHALL stay
muted, be prepared hidden and become opaque only after inputs and the ordinary page have taken.

#### Scenario: Title paints above a live input

- **GIVEN** a template contains a live plate and a marked title
- **WHEN** the row is taken
- **THEN** the live producer is seated above the ordinary page
- **AND** the synchronized title pass is seated above the live producer at volume zero
- **AND** updates and lifecycle calls reach both pages while completion remains background-owned

#### Scenario: Foreground capacity is atomic

- **GIVEN** the live-source band can hold the input seats but has no higher free layer for the pass
- **WHEN** the row is taken
- **THEN** the take is refused before any producer or page is played

#### Scenario: Unmarked templates keep the existing path

- **GIVEN** a live-source template has no marked foreground element
- **WHEN** it is loaded and taken
- **THEN** CG Bridge creates only its existing HTML page and input seats
- **AND** no extra layer is consumed

#### Scenario: Clear removes every part of the paired output

- **WHEN** an on-air paired row is cleared or removed
- **THEN** its live producers are cleared first
- **AND** the foreground pass is hidden and cleared before the ordinary page is cleared
