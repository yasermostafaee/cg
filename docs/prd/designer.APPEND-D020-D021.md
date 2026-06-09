# PRD updates for docs/prd/designer.md

# - REPLACE the existing D-020 block with the updated one below (single out-point).

# - APPEND the D-021 block after it.

# (Do NOT renumber existing IDs.)

# ============================================================

# REPLACE the existing D-020 with this:

# ============================================================

## [ ] D-020 — Animation lifecycle + playout timing ⟨priority: high⟩

**What:** Give every composition an **IN → HOLD → OUT** lifecycle via a **single
out-point marker** and a no-code **playout-timing** config, plus the runtime to
execute it. The author marks one `outPoint` on the timeline (inside the active
region); `play()` plays the full `[activeRange.in → outPoint]` once (all entrance

- content animation) and then **holds** at `outPoint` (no full-range loop, no
  auto-outro); `stop()` plays `[outPoint → activeRange.out]`; new
  `pause()`/`resume()` freeze/continue the current frame. A per-composition config
  chooses `manual` (operator drives out), `auto-out` (hold for T then out),
  `loop-cycle` (entrance → hold(T) → out, repeated N times or forever), or
  `content-driven` (duration computed from content — the crawler; computation
  delivered by the ticker item). `mode` is set in the inspector; **`holdMs`/`repeat`
  are tuned live in the preview modal** (they are playout/operator decisions, so the
  template stores defaults but the adjustable knob lives in preview now and at the
  operator's control surface later). Phase marker + timing config + the outro
  duration are exported in the template metadata.
  **Why:** This is the foundation every animated template needs and that the
  crawler, the looping logo, hold/pause-before-close, and timed auto-out build on.
  The current runtime loops the entire timeline continuously, which is wrong for a
  broadcast template that must open, hold, and exit on command.
  **Acceptance:**

* WHEN the author marks an `outPoint` on the timeline THEN the composition stores
  it with `activeRange.in ≤ outPoint ≤ activeRange.out`, and IN/HOLD/OUT are
  derived (IN = `[activeRange.in, outPoint]`, HOLD at `outPoint`, OUT =
  `[outPoint, activeRange.out]`)
* WHEN `play()` runs THEN the full `[activeRange.in → outPoint]` plays once and the
  composition holds at `outPoint` — it does not loop the whole range and does not
  auto-play the outro
* WHEN `stop()` runs THEN the outro plays from `outPoint` to the active-region end
  (jumping to `outPoint` first if stopped before reaching it)
* WHEN `pause()` is called THEN the current frame freezes, and `resume()` continues
  from that frame
* WHEN the mode is `auto-out` with hold = T THEN after reaching `outPoint` and T ms
  the outro plays automatically
* WHEN the mode is `loop-cycle` with hold = T and repeat = N (or infinite) THEN the
  composition repeats `[in→outPoint]` → hold(T) → `[outPoint→end]` for N cycles, or
  until `stop()`
* WHEN the designer changes hold or repeat in the **preview modal** THEN the
  preview re-runs with the overridden timing for that session only, and the stored
  defaults are unchanged
* WHEN a composition with the marker + timing config is exported THEN the metadata
  carries `outPoint`, `mode`, `holdMs`, `repeat`, and the **outro duration in ms**
* WHEN previewed THEN play / hold / pause / auto-out / loop-cycle behave
  identically to the exported file
  **Notes:** New capability `designer-playout-lifecycle`; the `outPoint` lives
  inside `designer-animation-timeline`'s `activeRange` (that spec is not modified).
  Builds on D-018 (runtime + preview) and extends D-019's export metadata. The
  current `FrameDriver` full-range loop is replaced by "play a sub-range once and
  hold" + a cycle orchestrator (no-lifecycle scenes keep today's loop). `mode` in
  the inspector; `holdMs`/`repeat` tuned in the preview modal (on-air operator
  override is a control-layer concern later, likely a reserved key in the
  `update()` payload). `content-driven`'s width→duration computation lands with the
  ticker item. `pause`/`resume` are sync no-arg (keeps `CG INVOKE "pause"` open).
  Change: `openspec/changes/add-animation-lifecycle-timing/`.

# ============================================================

# APPEND this after D-020:

# ============================================================

## [ ] D-021 — Idle loop during hold ⟨priority: medium⟩

**What:** Let a composition optionally **loop a tail segment while it holds**,
instead of freezing — so a logo can pulse, a bug can breathe, etc. Adds an
optional `holdLoopStart` marker inside the entrance; when set, during the HOLD
phase the playhead loops `[holdLoopStart → outPoint]` continuously (that segment
is part of the entrance and is fully played the first time, then replayed — no
dead region). When unset, the hold freezes at `outPoint` exactly as D-020. Off by
default (one marker). Toggle/markers in the designer, testable in the preview
modal.
**Why:** Continuous subtle motion while a graphic sits on screen is a common
broadcast need. D-020's single-marker model freezes the hold; this adds the
looping idle as an opt-in without reintroducing the two-marker dead zone.
**Acceptance:**

- WHEN `holdLoopStart` is set and `play()` reaches the hold THEN the playhead loops
  `[holdLoopStart → outPoint]` continuously instead of freezing
- WHEN `holdLoopStart` is unset THEN the hold freezes at `outPoint` (D-020
  behavior, unchanged)
- WHEN `holdLoopStart` is set THEN the invariant
  `activeRange.in ≤ holdLoopStart ≤ outPoint` holds, and the segment is fully
  played once (as part of the entrance) before it begins looping
- WHEN the mode is `auto-out` or `loop-cycle` with an idle loop THEN the idle loops
  during the hold/dwell and the exit (`[outPoint → activeRange.out]`) plays normally
  after `holdMs`
- WHEN `stop()` is called during the idle loop THEN the exit plays from `outPoint`
  to the active-region end
- WHEN previewed THEN the idle loop behaves identically to the exported file, and
  the designer can toggle/test it in the preview modal
  **Notes:** ADDED requirement on the `designer-playout-lifecycle` capability;
  **depends on D-020** (the single `outPoint` marker + hold). No dead zone — the
  loop segment is a replayed tail of the entrance. The inlined scene already
  carries `holdLoopStart`, so export is metadata-only. Author the idle segment as a
  **seamless cycle** (start state ≈ end state) to avoid a visible jump each loop.
  Change: `openspec/changes/add-hold-idle-loop/`.
