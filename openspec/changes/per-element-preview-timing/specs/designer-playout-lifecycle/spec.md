# designer-playout-lifecycle (delta)

## ADDED Requirements

### Requirement: Per-element ticker timing overrides in preview

The preview's session-only TICKER timing override SHALL be PER-ELEMENT, addressed by the ticker's
`elementId` — not per-scope. The override SHALL carry, for each ticker, its own `repeat` (`N` |
`'infinite'`) and `cycleBoundary` (`'seamless'` | `'drain'`), and the runtime SHALL apply each
ticker's override to THAT ticker's own driver (two tickers in one scope are two independent drivers).
The per-scope LIFECYCLE override (`mode` / `holdSource` / `holdMs` / `repeat`) is unchanged. The
preview SHALL enumerate EVERY ticker of a scope (recursing containers) and show one timing row per
ticker, labelled by the element's name, nested under that scope's lifecycle controls. These overrides
SHALL be session-only — applied to the preview run by rebuilding the runtime, never written to the
stored template. A scope with exactly one ticker SHALL behave as before (one row, applied to its own
driver). (Phase 1 covers tickers; sequences and countdown clocks are a later phase.)

#### Scenario: Two tickers in one scope are tuned independently

- **WHEN** a composition contains two tickers and the operator sets ticker A to one repeat /
  cycle-seam and ticker B to another in the preview timing panel
- **THEN** the preview shows one timing row per ticker (by name) and each ticker's own driver honors
  its OWN repeat / cycle-seam — A's setting does not affect B

#### Scenario: A single-ticker scope is unchanged

- **WHEN** a scope contains exactly one ticker
- **THEN** it shows one ticker timing row and behaves exactly as before (no regression)

#### Scenario: Per-element ticker overrides are session-only

- **WHEN** the operator sets per-ticker timing in the preview
- **THEN** only the preview run is affected — every ticker element's stored `repeat` /
  `cycleBoundary` and the rest of the template are left unchanged
