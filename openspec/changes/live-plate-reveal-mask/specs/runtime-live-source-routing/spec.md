## MODIFIED Requirements

### Requirement: A linked reveal shows lower-input pixels above an upper live plate

For each valid active-look reveal, CG Bridge SHALL order the lower producer below the upper producer
and seat one additional copy of the lower producer above the upper. The additional copy SHALL retain
the lower `FILL`, intersect its `CLIP` with the authored reveal window, remain at volume zero and own
an independent ledger seat identity. The reveal SHALL consume one layer from the live-source band.

#### Scenario: Burned-in caption is revealed

- **GIVEN** an upper live plate linked to a lower input with a rectangular caption window
- **WHEN** the row is taken
- **THEN** the lower producer is seated below the upper producer
- **AND** a muted clipped copy of that lower producer is seated above the upper producer
- **AND** pixels outside the intersection of the lower plate and reveal window do not paint

#### Scenario: Layer capacity stays atomic

- **GIVEN** two base plates and one reveal but a live-source band with only two available layers
- **WHEN** the row is taken
- **THEN** the take is refused before any producer or graphic reaches air
