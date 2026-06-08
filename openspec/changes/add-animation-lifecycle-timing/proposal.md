## Why

Every animated broadcast template needs to **open, hold, and exit on command** —
and several requested behaviors (a looping logo that does intro→hold→outro→repeat,
holding/pausing after open, timed auto-out, and the crawler's content-driven
duration) are all the same underlying thing: a structured animation lifecycle
with playout timing. The current runtime has none of this — its `FrameDriver`
loops the **entire** `frameRange` continuously, which would replay the intro
forever and never hold or exit. The keyframe/timeline capability
(`designer-animation-timeline`) only defines `frameRange` + `activeRange`; there
is no notion of intro/hold/outro, pause, or timed/looped playout. This is the
foundation the crawler, clock, and sequence items build on, so it must exist
first; retrofitting it later means re-authoring every template and reworking the
driver.

## What Changes

- **Phase markers (schema):** add an optional `lifecycle: { introEndFrame,
  outroStartFrame }` to the composition (in `scene.ts`), defined **inside** the
  existing active region with the invariant
  `activeRange.in ≤ introEndFrame ≤ outroStartFrame ≤ activeRange.out`.
  IN = `[activeRange.in, introEndFrame]`, HOLD = the held `introEndFrame`
  (frames between `introEndFrame` and `outroStartFrame`, if any, are an optional
  idle segment — may be deferred), OUT = `[outroStartFrame, activeRange.out]`.
  Absent `lifecycle` keeps today's behavior. No `schemaVersion` bump (additive
  optional).
- **Timing config (schema):** add optional `playout: { mode:
  'manual' | 'auto-out' | 'loop-cycle' | 'content-driven'; holdMs?: number;
  repeat?: number | 'infinite' }` to the composition. Default `manual`.
- **Runtime lifecycle (`@cg/template-runtime`):**
  - `play()` → play the IN once, then **hold** at `introEndFrame` (driver stops;
    no full-range loop). Replace the `FrameDriver`'s "`% span` loop" default with
    "play a sub-range once and hold".
  - `stop()` → play the OUT (`outroStartFrame → activeRange.out`), then settle to
    hidden/removed.
  - add `pause()` / `resume()` (freeze/continue the driver at the current frame).
  - **timing orchestrator**: `auto-out` → after IN + `holdMs`, run OUT;
    `loop-cycle` → IN → hold(`holdMs`) → OUT → repeat for `repeat` cycles or until
    `stop()`. The composition self-runs these from its `playout` config (operator
    only does on/off).
  - `content-driven` is **declared** here and routed through the same orchestrator
    with a runtime-supplied duration hook; the actual content→duration computation
    is delivered by the ticker item.
- **Designer UI:** draggable **intro-end / outro-start markers** on the timeline,
  and a no-code **"Playout / Timing"** inspector section (mode dropdown, hold ms,
  repeat). Preview reflects all of it.
- **Export (extends D-019):** the single-file exporter + template metadata carry
  `introEndFrame`, `outroStartFrame`, `mode`, `holdMs`, `repeat`, and the
  **outro duration in ms** (`(activeRange.out − outroStartFrame) / frameRate ×
  1000`) so the control layer can schedule precise timed auto-out later.

## Capabilities

### New Capabilities

- `designer-playout-lifecycle`: a composition's runtime lifecycle (intro / hold /
  outro), pause/resume, and no-code playout timing (manual / auto-out /
  loop-cycle / content-driven), executed identically in preview and on air.

### Modified Capabilities

<!-- None. Phase markers live inside designer-animation-timeline's activeRange
     (referenced, not modified). -->

## Impact

- **Schema:** `packages/shared-schema/src/scene.ts` — optional `lifecycle` and
  `playout`; validators for the phase invariant and `playout` fields.
- **Runtime:** `packages/template-runtime/src/runtime.ts` (play→hold, stop→out,
  pause/resume, timing orchestrator); `frame-driver.ts` (play-sub-range-and-hold
  + cycle support instead of unconditional `% span` loop).
- **Designer:** `features/timeline/*` (intro/outro markers); new
  `features/inspector/PlayoutTimingSection.tsx`; `platform/preview.ts` (reflect
  hold/pause/auto-out/loop-cycle; expose `pause`/`resume` preview actions).
- **Export (D-019):** `platform/ExporterSingleFile.ts` + `packages/vcg-format`
  metadata/GDD — carry phase frames, timing, and outro duration.
- **Unchanged:** `designer-animation-timeline` spec, keyframe authoring, the
  `.vcg` exporter shape.
- **Tests:** schema (phase invariant; playout fields); runtime (play holds at
  introEnd and does not loop; stop plays out; pause/resume; auto-out fires after
  hold; loop-cycle repeats N then stops); designer timeline-marker store test;
  export test (metadata carries phases/timing/outro-ms).
- **Dependencies:** **D-018** (runtime + preview). **Extends D-019** (export
  metadata). The ticker item depends on this (`content-driven`).
