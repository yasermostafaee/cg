## Why

Every animated broadcast template needs to **open, hold, and exit on command** —
and several requested behaviors (a looping logo, holding/pausing after open, timed
auto-out, and the crawler's content-driven duration) are the same underlying
thing: a structured animation lifecycle with playout timing. The current runtime
has none of this — its `FrameDriver` loops the **entire** `frameRange`
continuously, which would replay the intro forever and never hold or exit. The
keyframe/timeline capability (`designer-animation-timeline`) only defines
`frameRange` + `activeRange`. This is the foundation the crawler, clock, and
sequence items build on, so it must exist first.

## What Changes

- **Single out-point marker (schema):** add an optional `lifecycle: { outPoint }`
  to the composition (in `scene.ts`), inside the active region with the invariant
  `activeRange.in ≤ outPoint ≤ activeRange.out` (resolved against
  `activeRange ?? frameRange`). IN = `[activeRange.in, outPoint]` (plays fully),
  HOLD = the held `outPoint`, OUT = `[outPoint, activeRange.out]`. One marker —
  matching Loopic's single outro frame; there is **no** second marker and no dead
  region. **Absent `outPoint` = an implicit out-point at the last active frame**
  (`activeRange.out`): the whole timeline is the entrance, the hold is the last
  frame, the outro is empty. No `schemaVersion` bump.
- **Timing config (schema):** add optional `playout: { mode:
'manual' | 'auto-out' | 'loop-cycle' | 'content-driven'; holdMs?: number;
repeat?: number | 'infinite' }`. Default `manual`. This is the stored,
  design-time intent (play-once).
- **Runtime lifecycle (`@cg/template-runtime`):**
  - **Default = play-once-and-hold (NOT loop).** `play()` plays the full
    `[activeRange.in → outPoint]` once, then **holds** (freezes) at `outPoint`
    (driver stops; no loop, no auto-outro). An absent `outPoint` resolves to
    `activeRange.out`, so a no-marker composition plays its whole timeline once and
    holds the last frame. The old "no-lifecycle loops forever" default is removed —
    looping is no longer silent.
  - `stop()` → play `[outPoint → activeRange.out]`, then settle hidden (an empty
    outro settles instantly; jump to `outPoint` first if stopped before reaching it).
  - add `pause()` / `resume()` (sync, no-arg; freeze/continue the current frame).
  - **timing orchestrator**: `auto-out` → after reaching `outPoint` + `holdMs`, run
    OUT; `loop-cycle` → `[in→outPoint]` → hold(`holdMs`) → `[outPoint→end]` →
    repeat for `repeat` cycles (or forever when `repeat` is `'infinite'`) or until
    `stop()`. The composition self-runs these from its `playout` config (operator
    only does on/off). There is **no** separate continuous-loop mode — a looping
    logo is `loop-cycle` with `repeat: 'infinite'` (with `holdMs: 0` that loops the
    full timeline).
  - `content-driven` is declared here and **honors the existing `repeat` field** (no
    schema change): `repeat: 'infinite'` loops the content pass continuously;
    `repeat: N` runs N passes then settles/stops (the crawler's "scroll N times then
    exit"). **Each pass takes its duration from the runtime-supplied
    `durationHook`** (recomputed per pass; the real content→duration computation is
    delivered by the ticker item). `holdMs` does **not** apply to `content-driven`.
  - **Overridable, non-persistent params.** The runtime accepts a `playoutOverride`
    (`mode` + `holdMs` + `repeat`) that overrides the stored defaults for a single
    run without touching the template. This is the seam the preview uses to test
    playout and the rundown will use to drive it live on air; authoritative live
    control belongs to the rundown (not built now).
- **Designer UI:** one draggable **`outPoint` marker** on the timeline
  (Loopic-style), and a no-code **"Playout"** inspector section for **`mode`** (+ a
  default). The preview modal's **"Timing (session)"** controls bind to the
  composition's **effective** playout and re-sync when it changes; they expose live
  **`mode`/`holdMs`/`repeat`** — all **session-only** (never written to the
  template). There is **no** Loop / Play once toggle: continuous looping is
  `loop-cycle` (or `content-driven`) with `repeat: ∞`. With no `outPoint` the
  preview shows "no out-point" and disables `auto-out` / `loop-cycle`. These are
  playout/operator decisions; the template stores only the play-once defaults, and
  authoritative live control lives at the rundown later.
- **Preview modal polish:** the transport is **separate, momentary playout-command
  buttons** mirroring on-air commands — **Play** (`play()`, or `resume()` when
  paused), **Pause** (`pause()`), **Stop** (`stop()`), **Next** (`next()`, disabled
  when the template has a single step). Play is **not** a toggle and never stays
  "pressed". The preview-only **Reset** utility is grouped apart from the playout
  commands. Layout keeps the stage prominent, scrolls the data-key form in its own
  region (it never pushes other controls away), and pins the transport + timing
  overrides in an always-visible bar. Important problems — **no out-point**,
  **duplicate data key**, **field validation errors** — surface as prominent
  callouts, not muted hints. Styling routes through an **app-local design system**
  (a reusable `Button`/`Callout` vanilla-extract recipe consuming the existing
  `renderer/theme.ts` palette) so interactive elements get hover / active /
  focus-visible / disabled states; no ad-hoc inline CSS, no palette change.
- **Export (extends D-019):** the single-file exporter + template metadata carry
  `outPoint`, `mode`, `holdMs`, `repeat`, and the **outro duration in ms**
  (`(activeRange.out − outPoint) / frameRate × 1000`).

## Capabilities

### New Capabilities

- `designer-playout-lifecycle`: a composition's runtime lifecycle (intro → hold →
  outro via a single out-point), pause/resume, and no-code playout timing
  (manual / auto-out / loop-cycle / content-driven), executed identically in
  preview and on air, with `holdMs`/`repeat` adjustable in the preview modal.

### Modified Capabilities

<!-- None. The outPoint lives inside designer-animation-timeline's activeRange
     (referenced, not modified). -->

## Impact

- **Schema:** `packages/shared-schema/src/scene.ts` — optional `lifecycle:
{ outPoint }` and `playout`; validators for the invariant and `playout` fields.
- **Runtime:** `packages/template-runtime/src/runtime.ts` (play→hold, stop→out,
  pause/resume, timing orchestrator); `frame-driver.ts` (play-sub-range-and-hold +
  cycle support instead of the unconditional `% span` loop);
  `playout-controller.ts`.
- **Designer:** `features/timeline/*` (single `outPoint` marker);
  `features/inspector/PlayoutSection.tsx` (mode + default only); preview modal —
  `PreviewModal.tsx` (owns field values + paused flag; scrollable form + fixed
  transport/timing bar), `PreviewTransport.tsx` (momentary Play/Pause/Stop/Next +
  Reset utility), `PreviewFieldForm.tsx` (controlled, prominent duplicate-key /
  validation callouts), `PreviewTimingControls.tsx` (session override; no inline
  CSS); `ui/Button.*` + `ui/Callout.*` (app-local design-system recipe with
  interactive states); `platform/preview.ts` (reflect hold/pause/auto-out/loop-cycle;
  pause/resume actions).
- **Export (D-019):** `platform/ExporterSingleFile.ts` + `packages/vcg-format`
  metadata — carry `outPoint`, timing, and outro-ms.
- **Unchanged:** `designer-animation-timeline` spec, keyframe authoring, the
  `.vcg` exporter shape.
- **Tests:** schema (invariant; playout fields; absent lifecycle = today);
  runtime (play plays full range to outPoint and holds without looping; stop plays
  out; pause/resume; auto-out after hold; loop-cycle repeats N then stops;
  content-driven with `repeat: 'infinite'` loops and `repeat: N` runs N passes then
  stops, driven by an injected duration hook); designer marker store test;
  preview-override test (defaults unchanged); preview duplicate-data-key detection
  test; export test (metadata + outro-ms).
- **Dependencies:** **D-018** (runtime + preview). **Extends D-019** (export). The
  ticker item depends on this (`content-driven`); **D-021** extends this
  capability (idle loop).
