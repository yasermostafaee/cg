# designer-playout-lifecycle (B-032 delta)

## MODIFIED Requirements

### Requirement: Mode + hold + repeat are overridable, non-persistent params

The runtime SHALL accept a non-persistent playout override — `mode`, `holdMs`, and
`repeat` — that overrides the composition's stored defaults for a single run
**without changing the stored template** (the designer preview / rundown session
override). The override SHALL NOT include any separate continuous-loop flag;
continuous looping is expressed as `mode: 'loop-cycle'` (or `'content-driven'`)
with `repeat: 'infinite'`. These params exist so the designer preview can test
playout and so the rundown (the control app) can drive them live on air later;
authoritative live control of these belongs to the rundown.

B-032 — the template MAY ALSO STORE an authored timed `holdMs` on `scene.playout`:
the inspector's Playout section authors it (alongside `mode` and the `outPoint`
marker) for an `auto-out` / `loop-cycle` composition with a TIMED hold, so a
STANDALONE export / on-air playback (no rundown) holds for the authored duration
rather than collapsing to 0. The session override still layers on top via
`effectivePlayoutFor` (`override.holdMs ?? stored.holdMs`), so a preview / rundown
can still retune the hold for a run without changing the stored default. `repeat`
remains an override-only (preview / rundown) param. A composition with no stored
`holdMs` and no override holds 0 (the prior behaviour — no hold authored).

#### Scenario: Override drives playout without persisting

- **WHEN** a playout override (e.g. a different `mode` or `holdMs`) is supplied for
  a run
- **THEN** that run uses the override, and the composition's stored `playout`
  defaults are left unchanged

#### Scenario: An authored timed holdMs is stored and exported

- **WHEN** the inspector sets a timed `holdMs` for a content-less `auto-out` /
  `loop-cycle` composition
- **THEN** the value is stored on `scene.playout.holdMs`, the single-file export
  bakes it (`buildPlayoutMetadata`) and the inlined scene carries it, so a
  standalone export holds for the authored duration (both `auto-out` and
  `loop-cycle`, including the between-cycle hold) instead of behaving like 0

### Requirement: Preview timing overrides are session-only

`mode` AND the timed `holdMs` SHALL be AUTHORABLE in the inspector (stored on
`scene.playout`); `mode`, `holdMs`, and `repeat` SHALL ALSO be adjustable in the
preview modal (`repeat: 'infinite'` is how the preview loops). The inspector's
`holdMs` control SHALL appear only for a TIMED hold under `auto-out` / `loop-cycle`
(a content-driven hold ignores `holdMs`). A preview change SHALL re-run the preview
with the overridden playout for that session only — layered on the stored defaults
(`override ?? stored`) — and SHALL NOT change the composition's stored defaults.

#### Scenario: Preview override is session-only

- **WHEN** the designer changes the mode, hold, or repeat in the preview modal
- **THEN** the preview re-runs with the overridden playout, and the composition's
  stored `playout` defaults are unchanged

#### Scenario: The inspector authors a stored holdMs, the preview override still layers over it

- **WHEN** the inspector authors a stored `holdMs` and the preview then sets a
  different `holdMs` override
- **THEN** the preview run uses the override while the stored value (and the
  export) keep the authored default — neither changes the other; and the inspector
  `holdMs` control is hidden for a `manual` or content-driven hold
