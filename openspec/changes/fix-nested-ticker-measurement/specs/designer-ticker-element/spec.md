## ADDED Requirements

### Requirement: Crawl measurements are independent of hidden ancestor composition state

Ticker widths SHALL be measured in unscaled local layout pixels using the ticker's computed
typography even when an ancestor composition is hidden during initialization. Measurement probes
SHALL be removed immediately and SHALL NOT join the live item stream. Stable-id updates, item gaps,
repeat completion and per-cycle font remeasurement SHALL keep their existing behavior.

#### Scenario: A nested ticker starts under a hidden parent

- **WHEN** the News Ticker starter's exported parent composition enters and starts its nested crawl
- **THEN** the moving item boxes do not overlap and preserve the authored gaps
- **AND** the static authoring row and live crawl both retain the Persian headline layout

#### Scenario: Measurements do not leak into the stream

- **WHEN** a driver measures new text beneath a hidden composition
- **THEN** its temporary probe uses the ticker's computed font in document layout
- **AND** no probe remains after measuring or after destroying the driver
