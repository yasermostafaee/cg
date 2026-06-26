# designer-clock-element (delta)

## ADDED Requirements

### Requirement: Blinking colon separator

The clock SHALL support an OPTIONAL blinking colon, configured by two schema fields: `blinkColon`
(boolean) and `blinkPeriodMs` (positive integer, default 1000). Both default to absent — a clock
without them renders steady colons exactly as before, so the addition is backward-compatible (no
schema-version bump, no migration). When `blinkColon` is on, the runtime SHALL render the formatted
time so that each colon (`:`) character occupies its OWN span, and SHALL pulse ONLY those spans'
OPACITY on/off — never `display`, so there is NO digit reflow or layout shift — with the blink phase
derived from the clock's time source as `Math.floor(now / blinkPeriodMs) % 2` and NO separate timer.
It SHALL apply to `wall`, `countup`, and `countdown`, and SHALL leave Persian / Arabic-Indic digit
mapping unaffected (the colon is never a digit). The Designer preview and the exported single-file
HTML SHALL run the blink identically (the same runtime source). When `blinkColon` is off the colons
SHALL stay steady (the unchanged single-`textContent` render). Changing `blinkPeriodMs` SHALL change
the blink cadence.

#### Scenario: Enabled colon pulses at the configured rate

- **WHEN** a clock has `blinkColon` on
- **THEN** its colon separator(s) pulse on/off (opacity) at the rate set by `blinkPeriodMs`, while
  the digits keep ticking

#### Scenario: Disabled keeps steady colons

- **WHEN** `blinkColon` is off (or absent)
- **THEN** the colons stay steady and the clock renders exactly as before (no segmentation change)

#### Scenario: Only opacity toggles — no layout shift

- **WHEN** the colon blinks
- **THEN** only the colon span's opacity changes; the digits do not reflow or shift position

#### Scenario: Rate change updates the cadence

- **WHEN** `blinkPeriodMs` is changed
- **THEN** the blink speed updates accordingly

#### Scenario: Preview and export match; Persian digits unaffected

- **WHEN** the clock plays in the Designer preview AND in the exported single-file HTML
- **THEN** the blink runs the same (driven by the clock's time source) and Persian digits render
  unchanged
