# designer-playout-lifecycle

## ADDED Requirements

### Requirement: Playout mode and hold source are designer-owned

The composition's playout `mode` and `holdSource` SHALL be authored ONLY in the Designer's
composition inspector and SHALL be read-only on every other surface. A setting that can break the
template's own contract belongs to whoever authored the contract: `holdSource: 'content-driven'`
means "stay until the content finishes", so an operator who changes it pulls the background out
from under a headline sequence that is still running — the template keeps its promise and the
operator breaks it without knowing they did.

The Designer's PREVIEW SHALL show `mode` and `holdSource` as READ-ONLY FACTS — stated, never
offered — and SHALL NOT carry a session override for either. CG Control SHALL show them read-only
always; when its timing section is built they SHALL appear as statements, never as inputs.

A read-only value SHALL be presented as a FACT and SHALL NOT be presented as a disabled control:
it carries none of a control's border, background or chrome, because a greyed control tells the
operator they lack a permission when the truth is that the value was never theirs to set. It SHALL
be rendered through the app's `Tag` primitive, whose type makes `onClick`, `tabIndex` and
`role="button"` inexpressible, so a fact cannot become pressable by accident.

Per-element CONTENT timing — crawl passes, crawl cycle seam, rotator (sequence) passes and rotator
item dwell — SHALL remain operator-owned and session-only, unchanged.

#### Scenario: The preview states the mode and hold instead of offering them

- **WHEN** the operator opens the preview on a composition
- **THEN** the preview displays the composition's resolved `mode`, and its `holdSource` when the
  scope contains a content source, as read-only facts; NO mode select and NO hold-source select
  exist in the preview

#### Scenario: A session override cannot carry mode or hold source

- **WHEN** the preview writes a session timing override
- **THEN** that override carries no `mode` and no `holdSource` key — the fields are absent from the
  override type, so there is no control to disable and no channel by which a value could reach the
  runtime

#### Scenario: A nested scope's timing relevance reads the stored mode

- **WHEN** a nested composition instance stores `mode: 'manual'`
- **THEN** the preview does not list it as a timing scope, and no session action can make it
  timing-relevant; changing that is an authoring decision made in the composition inspector

#### Scenario: Operator-owned content timing is untouched

- **WHEN** the preview is open on a composition containing a ticker and a sequence
- **THEN** the crawl passes, crawl cycle seam, rotator passes and rotator item dwell controls all
  remain editable and session-only, and the preview's footer still states that tuning is session
  only, that stored defaults are unchanged, and that authoritative live control belongs to the
  rundown

## MODIFIED Requirements

### Requirement: No-code playout timing modes

A composition SHALL carry a playout config with a `mode` of `static`, `manual`, `auto-out`,
`loop-cycle`, or `content-driven`, plus `holdMs` and `repeat` where applicable. `static` SHALL be the
mode of a composition with NO out-point: it plays the intro, holds until `stop()`, and hard-cuts with
NO outro (no animated exit) — it requires and uses no out-point. `manual` SHALL hold after the intro
until `stop()`. `auto-out` SHALL, after reaching `outPoint` and `holdMs`, play the outro
automatically. `loop-cycle` SHALL repeat `[in→outPoint]` → hold(`holdMs`) → `[outPoint→end]` for
`repeat` cycles (or forever when `repeat` is `infinite`), or until `stop()`. `content-driven` SHALL
run `repeat` content passes (or forever when `repeat` is `infinite`, or until `stop()`); each pass
SHALL take its duration from the runtime-supplied duration hook (recomputed per pass — the ticker item
computes content→duration), and `holdMs` SHALL NOT apply to `content-driven`. There SHALL be no
separate continuous-loop mode: a looping playout is `loop-cycle` (or `content-driven`) with `repeat:
'infinite'`. `manual` / `auto-out` / `loop-cycle` require an explicit `outPoint` to have an exit
segment; a composition with NO `outPoint` and the DEFAULT (`manual`) mode resolves to `static` (a
single resolver — `playoutOf` — returns `static`, so the runtime, exporter, and inspector agree). The
designer UI never SETS `auto-out` / `loop-cycle` without an out-point, so a composition authored with
no out-point IS `static`; an explicit `auto-out` / `loop-cycle` without an out-point (legacy /
programmatic) keeps its timed / content-driven hold + empty (cut) outro and is NOT coerced.

#### Scenario: A composition with no out-point is static

- **WHEN** a composition has no out-point
- **THEN** its resolved mode is `static`, and `manual` / `auto-out` / `loop-cycle` are disabled in the
  inspector's mode select

#### Scenario: A static graphic cuts on stop

- **WHEN** a `static` composition is stopped
- **THEN** it is removed by a clean cut with no outro — the controller plays the intro, holds until
  `stop()`, then cuts (an empty exit)

#### Scenario: Adding an out-point re-enables the animated modes

- **WHEN** an out-point is added to a `static` composition
- **THEN** `manual` / `auto-out` / `loop-cycle` become selectable again (and `static` is disabled
  while an out-point exists)

#### Scenario: The preview STATES the mode rather than offering it

- **WHEN** the operator opens the preview for a composition
- **THEN** the preview shows the composition's resolved mode as a READ-ONLY FACT and offers NO mode
  control at all — there is no mode select to disable, so the preview and the main scene properties
  cannot disagree. The mode is authored in the composition inspector, whose own out-point gating is
  unchanged

#### Scenario: Auto-out plays the outro after the hold

- **WHEN** the mode is `auto-out` with `holdMs = T` and `play()` is called
- **THEN** the intro plays, the composition holds at `outPoint` for T, and then the outro plays
  automatically

#### Scenario: Loop-cycle repeats the full cycle

- **WHEN** the mode is `loop-cycle` with `holdMs = T` and `repeat = N`
- **THEN** the composition repeats `[in→outPoint]` → hold(T) → `[outPoint→end]` N times and then
  stops, and when `repeat` is `infinite` it repeats until `stop()`

#### Scenario: Content-driven honors the repeat field

- **WHEN** the mode is `content-driven` and `play()` is called, with each pass's duration supplied by
  the runtime duration hook
- **THEN** with `repeat = N` the composition runs N passes and then settles, and with `repeat =
'infinite'` it loops the content pass continuously until `stop()`; `holdMs` has no effect on either
  case

### Requirement: Preview timing overrides are per-scope and session-only

The preview's session-only timing overrides (`holdMs` / `repeat`) SHALL be
PER-SCOPE, grouped by the composition-instance tree (the parent plus each nested
child instance, using the SAME instance names as the nested field scopes). Each
scope SHALL carry its own override, applied to the preview run only and addressed by
the scope's instance-name path, so a parent can test each child's timing
independently (e.g. one child loops 3×, another loops infinitely). Changing one
scope's override SHALL affect ONLY that scope and SHALL NOT change any stored
template defaults (consistent with the existing session-only override rule;
authoritative per-child on-air control belongs to the rundown). The preview SHALL
show timing controls for the active composition always, and for a nested scope only
when the mode the TEMPLATE STORES for it is timing-relevant (`auto-out` /
`loop-cycle` / `content-driven`) — the preview cannot override a mode, so relevance
is the template's answer and not the session's.

#### Scenario: The preview shows per-scope timing controls grouped by instance

- **WHEN** the preview opens on a parent that nests child instances `home` and `away`
- **THEN** the timing controls are grouped per scope — the parent plus each
  timing-relevant nested instance, labelled by its instance name

#### Scenario: A per-scope override times one child without touching others or the template

- **WHEN** the operator changes a child scope's mode / hold / repeat in the preview
- **THEN** only that scope's preview timing changes for the session (e.g. `home`
  loops 3× while `away` loops infinitely), every other scope and all stored template
  defaults are left unchanged
