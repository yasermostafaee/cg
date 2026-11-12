## ADDED Requirements

### Requirement: Programme honors an opted-in composition's live plate order

CG Bridge SHALL place co-visible live plate producers in the opted-in composition's authored
order for the requested preset. The plan SHALL include the required mask, reveal and foreground
dependencies. Before Take or a preset change, Bridge SHALL verify that the order fits the
declared layer band and can be realized safely with the available producer seats. An unsupported
or unsatisfiable plan SHALL return a precise refusal naming the preset and the reason before
changing programme.
An opted-in VCG SHALL require Runtime 1.2.3 or newer. CG Control SHALL require a Bridge
that advertises `livePlatePaintOrder` before importing or rebuilding a package whose carrier
declares a plate order. Existing packages without the opt-in SHALL retain their compatibility.

#### Scenario: Take a layout with overlapping plates

- **GIVEN** two co-visible plates overlap in an opted-in composition and a valid plan fits
- **WHEN** the operator takes the row
- **THEN** programme draws the upper plate over the lower plate as authored

#### Scenario: A preset requires a different order

- **WHEN** the operator switches to a preset with another authored order
- **THEN** programme uses that preset's order if a safe plan fits
- **WHEN** the destination's order cannot be represented with the available layers or safely
  reconciled with the current producers
- **THEN** Bridge names the reason and keeps the current programme in force
