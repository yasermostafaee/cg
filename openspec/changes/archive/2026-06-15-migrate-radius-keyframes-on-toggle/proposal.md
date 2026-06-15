# Migrate border-radius keyframes on the uniform↔per-corner toggle (B-015)

## Why

D-042 made border-radius keyframe-able in two independent shapes: a single
uniform `cornerRadius` track, or four per-corner sub-tracks
(`cornerRadius.tl/tr/br/bl`). The toggle between them only flips the stored value
SHAPE (`number` ↔ 4-tuple) — it never moves the keyframe data:

- `toPerCorner` only rewrites the static value; the uniform `cornerRadius` track
  is left orphaned (hidden in the inspector, which keys off the value shape) while
  the runtime — which keys off TRACK PRESENCE — keeps animating it as uniform.
- `toUniform` keeps only the top-left STATIC value and then DELETES all four
  per-corner tracks outright.

The result (B-015): switching uniform→per-corner makes uniform keyframes vanish
from view; a uniform↔per-corner round-trip silently DESTROYS per-corner keyframes
(the `clearKeyframeTrack` loop in `toUniform` wipes the tracks just authored). The
current spec actually MANDATES this drop ("Collapsing per-corner to uniform drops
the extra corner tracks in one undo"), so this is a documented-behavior change, not
a focused fix.

## What Changes

- **Migration on toggle (Option 2, confirmed):**
  - **uniform→per-corner** (`toPerCorner`): set the static value to `[u,u,u,u]`,
    deep-copy the uniform `cornerRadius` keyframes into ALL FOUR sub-tracks (fresh
    keyframe id per copy), then clear the uniform track. No uniform keyframes → just
    the static spread (today's behavior). Wrapped in one history entry (it now does
    multiple writes; today it is a single `updateElement`).
  - **per-corner→uniform** (`toUniform`): if all four corners are identical (static
    tuple entries equal AND the four sub-tracks equal by value — frame / value /
    easing / bezier, ignoring id) → migrate that shared track into `cornerRadius`.
    Otherwise take TOP-LEFT as the representative: static = `corners[0]`, copy
    `cornerRadius.tl` keyframes into `cornerRadius`, and DROP tr/br/bl (approved
    lossiness — non-TL corner keyframes are discarded even if TL has none). Then
    clear the four sub-tracks. Stays one undo.
- **Track-copy primitive:** a new `copyKeyframeTrack(id, from, to)` timeline-slice
  action — deep-clones whole keyframe objects (preserves stacked keyframes and
  per-keyframe easing/bezier via spread) and regenerates each `id` with
  `freshKeyframeId()`.
- **Dangling selection:** reset `selectedKeyframe` / `selectedKeyframes` when the
  track they reference is dropped by a toggle (no dangling `KeyframeRef`).
- **Secondary-bug fix (mode convergence):** clearing the orphaned uniform track on
  `toPerCorner` makes the runtime's track-presence mode re-converge with the
  inspector's value-shape mode after EITHER toggle. Covered by an explicit runtime
  test; no `animation-applier` source change is needed.

## Capabilities

### Modified Capabilities

- `designer-box-styling`: the requirement **"Collapsing per-corner to uniform drops
  the extra corner tracks in one undo"** is RENAMED to **"Toggling between uniform
  and per-corner migrates keyframes"** and rewritten — the toggle now MIGRATES
  value + keyframes bidirectionally (lossless uniform→per-corner; identical-or-
  top-left per-corner→uniform) in one undo, never silently dropping a live
  keyframe, and leaves no orphaned track driving the runtime into the wrong mode.

`designer-inspector-registry` (the keyframe-ability registry) and
`designer-animation-timeline` (the keyframe model) are NOT touched — the five
track keys already exist; only the toggle's data handling changes.

## Impact

- **Designer:** `state/slices/timeline.ts` (new `copyKeyframeTrack`; dangling-
  selection reset), `features/inspector/StyleSection.tsx` (`toPerCorner` /
  `toUniform` rewrite + docstring). No schema change.
- **Runtime:** `@cg/template-runtime` — a guard TEST in `animation-applier.test.ts`
  only (the applier already recomposes correctly; the orphan is removed at the
  source).
- **Tests:** new `box-radius-migration.test.ts` (8 cases), `box-props.spec.ts` E2E
  (toggle → four diamonds, round-trip Option-2), runtime recomposition test.
- **Docs:** the D-042 docstring in `StyleSection.tsx`; `state/README.md` (the new
  `copyKeyframeTrack` action).

## Out of scope

The per-corner sub-track / runtime model itself (unchanged from D-042). Stroke
animation on time-driven kinds (still D-052). Any schema change.
