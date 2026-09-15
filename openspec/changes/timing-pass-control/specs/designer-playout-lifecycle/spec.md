# designer-playout-lifecycle

## MODIFIED Requirements

### Requirement: The default is play-once-and-hold, and a loop-cycle with no authored count loops

`play()` SHALL play the entrance `[activeRange.in → outPoint]` **once** and then
hold (freeze) at `outPoint` — it SHALL NOT loop the timeline and SHALL NOT
auto-play the outro. This is the default for every composition, including one with
no `outPoint`. `stop()` SHALL play `[outPoint → activeRange.out]` and then settle
hidden (an empty outro settles instantly), jumping to `outPoint` first if stopped
before reaching it. Looping SHALL remain an explicit choice of MODE — a composition
loops only where its `playout.mode` is `loop-cycle` — but a composition that HAS
chosen that mode and authored no `repeat` SHALL loop until stopped, because
`DEFAULT_REPEAT` is `'infinite'`.

🔴 **This requirement's previous text said "never as an implicit default", and that is
now false.** It read: _"Continuous looping SHALL only happen as an explicit, opt-in
choice (see the override requirement) — never as an implicit default."_ An absent
`repeat` used to resolve to `1`, so a stored `loop-cycle` with no count played ONCE and
held — a graphic whose author had asked for a loop, silently not looping. The default is
`'infinite'` as of `TIMING-BUILD-21`. The sentence is REPLACED rather than left standing
beside the truth, and what survives of it is the part that is still true: the MODE is
still an explicit choice, and a composition that has not chosen `loop-cycle` still never
loops.

#### Scenario: Play plays everything up to the out-point and holds

- **WHEN** `play()` is called on a composition with an `outPoint`
- **THEN** all animation in `[activeRange.in → outPoint]` plays once and the
  composition holds at `outPoint` without looping and without playing the outro

#### Scenario: A composition with no out-point plays once and holds

- **WHEN** `play()` is called on a composition with no `outPoint`
- **THEN** the whole timeline plays once and the composition holds the last active
  frame — it does NOT loop

#### Scenario: Stop runs the outro

- **WHEN** `stop()` is called while the composition is holding
- **THEN** the outro plays from `outPoint` to the active-region end (instantly when
  the outro is empty)

#### Scenario: A loop-cycle composition with no authored repeat loops until stopped

- **WHEN** a composition whose `playout.mode` is `loop-cycle` has no authored
  `playout.repeat` and `play()` is called
- **THEN** it repeats in → hold → out until `stop()`, rather than running one pass
  and settling

#### Scenario: A composition that has not chosen loop-cycle still never loops

- **WHEN** a composition whose `playout.mode` is `static`, `manual` or `auto-out`
  is played
- **THEN** it does not loop, whatever `repeat` holds — the default applies to the
  mode that asked for a loop and to no other

### Requirement: Mode, hold, repeat and the between-pass gap — authored defaults with a non-persistent override

The runtime SHALL accept a non-persistent playout override — `mode`, `holdMs`, and
`repeat` — that overrides the composition's stored defaults for a single run
**without changing the stored template** (the designer preview / rundown session
override). The override SHALL NOT include any separate continuous-loop flag;
continuous looping is expressed as `mode: 'loop-cycle'` (or `'content-driven'`)
with `repeat: 'infinite'`. These params exist so the designer preview can test
playout and so the rundown (the control app) can drive them live on air;
authoritative live control of these belongs to the rundown.

B-032 — the template MAY ALSO STORE an authored timed `holdMs` on `scene.playout`:
the inspector's Playout section authors it (alongside `mode` and the `outPoint`
marker) for an `auto-out` / `loop-cycle` composition with a TIMED hold, so a
STANDALONE export / on-air playback (no rundown) holds for the authored duration
rather than collapsing to 0. The session override still layers on top via
`effectivePlayoutFor` (`override.holdMs ?? stored.holdMs`), so a preview / rundown
can still retune the hold for a run without changing the stored default. A
composition with no stored `holdMs` and no override holds 0 (the prior behaviour —
no hold authored).

🔴 **`repeat` IS NO LONGER OVERRIDE-ONLY, and `delayMs` joins it.** This requirement
previously ended _"`repeat` remains an override-only (preview / rundown) param."_ That
is false as of `TIMING-BUILD-21`: the Playout section authors `repeat` and a new
`playout.delayMs` — the gap BETWEEN passes — as stored template defaults, the single-file
export bakes both, and the session override still layers on top unchanged. `delayMs`
SHALL default to `0` when absent, and SHALL apply only BETWEEN passes: it never delays the
first showing.

#### Scenario: Override drives playout without persisting

- **WHEN** a playout override (e.g. a different `mode` or `holdMs`) is supplied for
  a run
- **THEN** that run uses the override, and the composition's stored `playout`
  defaults are left unchanged

#### Scenario: An authored repeat and gap are stored and exported

- **WHEN** the inspector authors a `repeat` and a `delayMs` on a `loop-cycle`
  composition
- **THEN** both are stored on `scene.playout`, the single-file export bakes them,
  and a standalone export runs that many passes with that gap between them

#### Scenario: The gap never delays the first showing

- **WHEN** a composition with an authored `delayMs` is played
- **THEN** the first pass begins immediately, and the gap is inserted only between
  one pass ending and the next beginning

#### Scenario: An authored timed holdMs is stored and exported

- **WHEN** the inspector sets a timed `holdMs` for a content-less `auto-out` /
  `loop-cycle` composition
- **THEN** the value is stored on `scene.playout.holdMs`, the single-file export
  bakes it (`buildPlayoutMetadata`) and the inlined scene carries it, so a
  standalone export holds for the authored duration (both `auto-out` and
  `loop-cycle`, including the between-cycle hold) instead of behaving like 0

## ADDED Requirements

### Requirement: Mode and hold are designer-owned and read-only on every other surface

The composition's `playout.mode` and `playout.holdSource` SHALL be authored ONLY in
the Designer's composition inspector, and SHALL be stated read-only on every other
surface — the Designer's own preview and the Runtime's CG Control alike. A setting
that can break the template's own contract belongs to whoever authored the contract:
`hold = content-driven` means "stay until the content finishes", and an operator who
changes it pulls the background out from under a sequence that is still running.

The read-only status SHALL be enforced by REMOVING THE CHANNEL, not by disabling a
control: `mode` and `holdSource` SHALL be absent from the preview's session-override
type, so there is no control to disable and no route a value could travel.

A read-only value SHALL be rendered as a FACT and never as a disabled input — a greyed
select tells the operator they lack a permission, when the truth is the value was never
theirs to set.

#### Scenario: The preview cannot express a mode override

- **WHEN** the preview's session-override type is inspected
- **THEN** it has no `mode` and no `holdSource` member, so no preview control can
  set one and no value can reach the runtime by that route

#### Scenario: CG Control states mode and hold as facts

- **WHEN** an operator opens the Inspector on a row whose template declares a mode
  and a hold source
- **THEN** both are stated as non-interactive marks carrying no control chrome, and
  there is no input — disabled or otherwise — for either

### Requirement: Per-element content timing stays operator-owned

Per-element content timing SHALL remain operator-owned, per session, and SHALL NOT become
a designer-only setting — crawl passes, the crawl cycle seam, rotator passes and rotator
item dwell. These do not break the template's contract: a crawl that runs
three passes instead of five still completes, and the composition's hold still ends
when its content does.

#### Scenario: A session override may re-time an element

- **WHEN** a per-element timing override is supplied for a run
- **THEN** the element runs to the overridden timing and the stored template is
  unchanged
