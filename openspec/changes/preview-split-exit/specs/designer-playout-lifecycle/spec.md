# designer-playout-lifecycle (D-105 delta)

## MODIFIED Requirements

### Requirement: Preview transport is separate, momentary playout commands

The preview modal SHALL present the playout commands as **separate, momentary**
buttons — **Play**, **Pause**, **Out**, **Stop**, **Next** — each issuing a single
command, mirroring on-air control. **Play** SHALL call `play()`, or `resume()`
when the composition is paused; it SHALL NOT be a toggle and SHALL NOT remain
visually "pressed"/active after a click. **Pause** SHALL call `pause()`. **Out**
SHALL call `out()` (the coordinated animated exit) and **Stop** SHALL call
`stop()` (the immediate clear); both are momentary and visually distinct, each
with its own icon and a short tooltip making the difference clear. **Next** SHALL
call `next()` and SHALL be **disabled when the template has a single step**
(nothing to advance to). Preview-only utilities (e.g. **Reset**) SHALL be grouped
visually apart from the playout commands. All interactive controls SHALL expose
hover / active / focus-visible / disabled states.

#### Scenario: Play is momentary and resumes when paused

- **WHEN** the operator clicks Play while the composition is paused
- **THEN** the runtime resumes from the paused frame; **and** after any Play click
  the button does not stay pressed/active — it is a one-shot command, not a toggle

#### Scenario: Out and Stop are distinct momentary commands

- **WHEN** the transport is shown
- **THEN** an **Out** command (calling `out()`) is presented alongside a **Stop**
  command (calling `stop()`), each a separate momentary button with its own icon
  and tooltip, neither staying pressed after a click

#### Scenario: Next is disabled for a single-step template

- **WHEN** the composition has a single step
- **THEN** the Next command is disabled; it becomes available only when the template
  exposes more than one step

## ADDED Requirements

### Requirement: Coordinated animated exit (Out) versus immediate clear (Stop)

The runtime SHALL expose two distinct exit operations — `out()` (animated) and
`stop()` (immediate) — that BOTH settle into the cleared terminal state but differ
in how the CONTENT (tickers / clocks / sequences) leaves RELATIVE TO the
background's close (the composition's authored `[outPoint → out]` outro). For
`out()`, the content SHALL animate off FIRST / with — a sensible default short
opacity fade for content that has no authored exit (a crawling ticker, a clock) —
sequenced via a promise so the background's outro plays LAST; the background SHALL
NEVER close over fully-visible content. For `stop()`, the content SHALL be halted
and hidden IMMEDIATELY and the background's close SHALL then play. The background's
authored `[outPoint → out]` keyframes SHALL be respected in both cases, and
content-first / background-last SHALL be the DEFAULT ordering when nothing is
choreographed. This coordination SHALL live in the runtime so the preview, the
exported single-file HTML, and on-air behave identically.

#### Scenario: Out animates the content off before the background closes

- **WHEN** `out()` is invoked on a composition whose content is a crawling ticker /
  a clock with a background that has an authored outro
- **THEN** the content animates out first (a default fade when it has no authored
  exit), and only after the content has left does the background play its outro —
  the background never closes over fully-visible content — and the composition then
  settles into the cleared terminal state

#### Scenario: Stop removes the content immediately, then closes the background

- **WHEN** `stop()` is invoked
- **THEN** the content drivers are halted and hidden immediately (gone before the
  background moves), the background then plays its close animation, and the
  composition settles cleared

#### Scenario: Authored background outro respected; content-first is the default

- **WHEN** a template has an authored background out-transition (its
  `[outPoint → out]` keyframes) and no explicit exit choreography
- **THEN** that authored background outro is played, and the content-first /
  background-last ordering is applied by default so the two never overlap with the
  background closing over visible content
