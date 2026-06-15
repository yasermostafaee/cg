# designer-sequence-element

## MODIFIED Requirements

### Requirement: Designer authoring — time-driven, not scrubbed

The Designer SHALL provide a Sequence tool and an inspector section editing the transition preset (Push up/down/left/right, Slide up/down/left/right, Hide-show; a field combination matching no preset displays Custom), the decomposed In/Out/Timing fields, `transitionMs`, `advance`, the default dwell (edited in seconds), `repeat` (infinite | N passes), `direction`, and the items (via the shared editor with the dwell column), alongside text styling (font, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO background, box padding, border-radius, or stroke/path-style controls (D-056 — the sequence carries only its text; box styling belongs on a separate shape layer). The inspector SHALL state the sequence is time-driven: timeline scrubbing does not move it (same affordance as ticker/clock). The playout inspector SHALL offer the content-driven hold source when the composition contains a sequence, with copy naming all three content kinds.

#### Scenario: Scrubbing does not move the sequence

- **WHEN** the operator scrubs the timeline over a composition containing a sequence
- **THEN** the displayed item does not change, and the inspector states the sequence is time-driven

#### Scenario: A sequence enables the content-driven hold source

- **WHEN** a composition contains a sequence
- **THEN** the playout inspector offers the content-driven hold source (copy generalized: ticker passes / countdown / sequence passes)

#### Scenario: The sequence inspector exposes no box styling

- **WHEN** a sequence is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)
