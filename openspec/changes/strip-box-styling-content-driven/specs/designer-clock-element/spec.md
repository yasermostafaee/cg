# designer-clock-element

## MODIFIED Requirements

### Requirement: Designer authoring — time-driven, not scrubbed

The Designer SHALL provide a Clock tool and an inspector section editing mode, format (with a token hint), digits, and — for countdown — the target (duration in seconds, or an absolute date-time), alongside text styling (font, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO background, box padding, border-radius, or stroke/path-style controls (D-056 — the clock carries only its text; box styling belongs on a separate shape layer). The clock has NO dynamic fields in v1 (no data-key section). The inspector SHALL state the clock is time-driven: timeline scrubbing does not move it (same affordance as the ticker). The playout inspector SHALL offer the content-driven hold source when the scope contains a countdown clock, with copy generalized beyond "ticker".

#### Scenario: Scrubbing does not move the clock

- **WHEN** the operator scrubs the timeline over a composition containing a clock
- **THEN** the clock's displayed time does not change, and the inspector states it is time-driven (same affordance as the ticker)

#### Scenario: A countdown enables the content-driven hold source

- **WHEN** a composition contains a countdown clock (and no ticker)
- **THEN** the playout inspector offers the content-driven hold source, with copy generalized beyond "ticker" (ticker passes / countdown reaching zero)

#### Scenario: The clock inspector exposes no box styling

- **WHEN** a clock is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)
