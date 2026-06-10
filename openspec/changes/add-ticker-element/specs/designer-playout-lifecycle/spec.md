# designer-playout-lifecycle

## ADDED Requirements

### Requirement: The runtime self-wires the content-driven duration from ticker elements

The runtime SHALL install an internal `durationHook` for every field scope
(the root scene and each nested composition scope) whose composition contains
at least one ticker element. The hook SHALL
return the remaining milliseconds until the scope's current ticker content
cycle completes (first pass ≈ `(viewportWidth + contentWidth) / speed × 1000`;
later passes self-correct for time consumed by intro/outro replays), so that
`repeat: N` settles after exactly N full content passes and pass boundaries
align with content-cycle completions. With multiple tickers in one scope the
hook SHALL return the maximum across them. An explicitly supplied
`RuntimeBootOptions.durationHook` SHALL take precedence for the root scope
(external override and test seam). A `content-driven` scope with neither a
ticker nor an external hook keeps the existing behaviour (zero-length passes).

#### Scenario: Exported template needs no boot wiring

- **WHEN** an exported single-file template whose root composition is
  `content-driven` with a ticker plays via `CG.createRuntime(scene)` with no
  options
- **THEN** each pass's duration comes from the ticker's measured content (no
  zero-length passes), identical to the preview

#### Scenario: Repeat N exits after N content passes

- **WHEN** a `content-driven` composition with a ticker has `repeat: 3`
- **THEN** the composition plays exactly 3 full content cycles (the crawl
  rolling continuously throughout, including over intro/outro replays), then
  plays the final outro and settles; with `repeat: 'infinite'` it crawls until
  `stop()`

#### Scenario: A nested ticker drives its own scope

- **WHEN** a `content-driven` composition containing a ticker is nested as an
  instance inside another composition
- **THEN** that child scope's pass duration comes from its own ticker
  (self-wired per scope — not limited to the root)

#### Scenario: An explicit boot hook overrides the ticker

- **WHEN** `createRuntime` is called with an explicit `durationHook` for a
  scene whose root scope also contains a ticker
- **THEN** the explicit hook's value governs the root scope's passes
