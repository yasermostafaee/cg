## ADDED Requirements

### Requirement: Closed media source fields identify the displayed poster provider

Direct and inherited media source fields SHALL show a compact official cached poster.
Only the engine whose poster has decoded in that field SHALL receive its A/B outline.
Availability alone SHALL NOT establish a picture provider. Missing, broken or unlabelled
posters SHALL NOT invent a provider. Source, channel and source-definition changes SHALL
invalidate stale displayed picture provenance; late replies from an older read scope SHALL
not restore it. The field and its source modal SHALL share the same poster cache.

#### Scenario: A media poster comes from B

- **GIVEN** a media source is available on both servers
- **WHEN** its official B poster decodes in the closed direct or inherited field
- **THEN** only B is outlined and the compact poster is shown without a meter or video player
- **AND** reopening the source modal reuses the selected media's poster read

#### Scenario: A source is rebound during an old poster read

- **WHEN** the channel, source or definition changes while its poster is pending
- **THEN** the old read cannot publish a picture or provider in the new scope
- **AND** availability badges remain independent of successful poster decoding
