# designer-playout-lifecycle (delta)

## MODIFIED Requirements

### Requirement: Per-element ticker timing overrides in preview

The preview's session-only TICKER timing override SHALL be PER-ELEMENT, addressed by the ticker's
`elementId` — not per-scope. The override SHALL carry, for each ticker, its own `repeat` (`N` |
`'infinite'`) and `cycleBoundary` (`'seamless'` | `'drain'`), and the runtime SHALL apply each
ticker's override to THAT ticker's own driver (two tickers in one scope are two independent drivers).
The per-scope LIFECYCLE override (`mode` / `holdSource` / `holdMs` / `repeat`) is unchanged. The
preview SHALL enumerate EVERY ticker of a scope (recursing containers) and show one timing row per
ticker, labelled by the element's name, nested under that scope's lifecycle controls. Duplicate
element names SHALL be disambiguated so each row is individually addressable. These overrides SHALL
be session-only — applied to the preview run by rebuilding the runtime, never written to the stored
template. A scope with exactly one ticker SHALL behave as before (one row, applied to its own
driver).

The enumeration SHALL also descend a REPEATER element into its child composition (depth- and
cycle-guarded) and list that composition's tickers, so a ticker that exists only as repeater-stamped
rows is visible and tunable. Because every stamped row is built from the SAME authored element (the
same `elementId`), the row governs the AUTHORED (template) ticker: setting it SHALL apply to EVERY
stamped instance of that ticker in the preview. There is no separate per-data-row control.

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

#### Scenario: A ticker inside a repeater's child composition is surfaced

- **WHEN** a composition contains a repeater whose child composition includes a ticker, and the
  preview timing panel is shown
- **THEN** that ticker appears as its own timing row (nested under the scope hosting the repeater),
  even though it exists only as repeater-stamped rows and is not an authored composition instance

#### Scenario: The authored ticker's override governs every stamped row

- **WHEN** the operator sets the per-element timing of a ticker that lives inside a repeater's child
  composition
- **THEN** EVERY stamped row of that repeater runs that ticker with the overridden repeat /
  cycle-seam in the preview (the control governs the authored template ticker; there is no
  per-data-row control), and the stored template is unchanged

## ADDED Requirements

### Requirement: Per-element sequence and countdown timing overrides in preview

The preview's session-only timing override SHALL cover SEQUENCE elements and COUNTDOWN clocks
per-element, addressed by the element's `elementId`, using the same session-only mechanism as the
per-element ticker override (D-102 Phase 1). The override SHALL carry, for each sequence, its own
`repeat` (`N` | `'infinite'`) and per-item `dwellMs`; and, for each countdown clock, its own preview
`durationMs`. The runtime SHALL apply each element's override to THAT element's own driver: a
sequence's `dwellMs` override SHALL win over the item's own authored `dwellMs` and the element's
`defaultDwellMs` (so it applies to every item), and a countdown's `durationMs` override SHALL replace
that clock's authored target (`duration` OR `datetime`) with a duration target for the run. Absent
fields SHALL fall back to the element's authored values.

The preview SHALL enumerate every sequence and every countdown clock of a scope (recursing
containers, with duplicate names disambiguated) and show one timing row per element, nested under
that scope's lifecycle controls, alongside the ticker rows. `wall` and `countup` clocks SHALL NOT be
listed — they never complete, so they have no timing to tune. These overrides SHALL be session-only:
applied to the preview run by rebuilding the runtime, never written to the stored template. The
per-scope LIFECYCLE override (`mode` / `holdSource` / `holdMs` / `repeat`) is unchanged.

#### Scenario: A sequence is listed with its own timing row

- **WHEN** the preview timing panel is shown for a composition containing a sequence element
- **THEN** the sequence appears as its own row (one per sequence, duplicate names disambiguated)
  with session-override controls appropriate to a sequence — its repeat count and its per-item dwell
  — mirroring how a ticker is shown

#### Scenario: A sequence's override drives only its own driver

- **WHEN** a sequence's preview timing override is changed
- **THEN** only that sequence's own driver uses it for this preview session — other sequences and
  tickers are unaffected — and the stored template is NOT modified

#### Scenario: A countdown clock is listed with a preview duration

- **WHEN** the preview timing panel is shown for a composition containing a countdown clock
- **THEN** the countdown appears as its own row with a session-override control for its preview
  duration, and `wall` / `countup` clocks are NOT listed

#### Scenario: A countdown's override drives only its own driver

- **WHEN** a countdown's preview timing override is changed
- **THEN** only that countdown's driver counts down from the overridden duration for this session
  (whether the element's authored target is a duration or an absolute datetime) — and the stored
  template is NOT modified
