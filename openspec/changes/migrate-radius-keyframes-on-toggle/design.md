# Design — migrate-radius-keyframes-on-toggle (B-015)

## Context

`cornerRadius` keyframes live at `element.animation.tracks[property]`, keyed by the
`AnimatableProperty` string: `cornerRadius` (uniform) and `cornerRadius.tl/tr/br/bl`
(per-corner). A `Keyframe` is `{ id, frame, value, easing, bezier? }`. The Designer
decides the toggle's mode by the static value shape (`Array.isArray(cornerRadius)`);
the runtime (`animation-applier.applyCornerRadius`) decides it by TRACK PRESENCE
(per-corner iff any sub-track exists). The two diverge whenever a toggle leaves a
track that doesn't match the value shape — the root of B-015.

## Decision

### Track-copy primitive

Add `copyKeyframeTrack(elementId, from, to)` to the timeline slice. It reads
`anim.tracks[from]`, deep-clones each keyframe with `{ ...k, id: freshKeyframeId() }`
(spread carries `easing` and optional `bezier`; the whole sorted array carries
stacked keyframes), and writes them as `tracks[to]`. No-op when `from` has no track.
Implemented via the existing `mutateAnimation` helper so the `animation` field is
pruned/created consistently. Fresh ids are mandatory because uniform→per-corner fans
ONE source into FOUR destination tracks — copying ids verbatim would collide.

### Dangling selection — reuse `clearKeyframeTrack`

`clearKeyframeTrack` already drops any `selectedKeyframe` / `selectedKeyframes` ref
that pointed at the removed track (B-014). Both toggles route their track removal
through it (uniform on toPerCorner; the four sub-tracks on toUniform), so a keyframe
selection on a dropped track is cleared with no extra code.

### toPerCorner (uniform → per-corner)

Wrap in `runAsSingleHistoryEntry` (today it is a bare `updateElement`; it now does
several writes):

1. `updateElement(id, { cornerRadius: [u,u,u,u] })` (the static spread).
2. For each of `tl/tr/br/bl`: `copyKeyframeTrack(id, 'cornerRadius', 'cornerRadius.<c>')`.
3. `clearKeyframeTrack(id, 'cornerRadius')` — remove the now-orphaned uniform track.

Step 2/3 are skipped implicitly when there is no uniform track (copy is a no-op,
clear is a no-op), preserving today's no-keyframe behavior.

### toUniform (per-corner → uniform)

Stay in `runAsSingleHistoryEntry`. Top-left is ALWAYS the representative, so no
explicit "are all four identical?" branch is needed — copying top-left is exactly
"keep the shared keyframes" when the four corners are identical (tl == the shared
value) and "take the top-left representative" when they differ. The two outcomes the
spec describes both fall out of one unconditional path; an equality check would be
dead code:

1. `updateElement(id, { cornerRadius: corners[0] })` — top-left static (unchanged
   from today).
2. `clearKeyframeTrack(id, 'cornerRadius')` — drop any stale uniform track so uniform
   reflects EXACTLY top-left (matters only for legacy / imported scenes that carried
   an orphaned uniform track; a no-op for clean post-fix data).
3. `copyKeyframeTrack(id, 'cornerRadius.tl', 'cornerRadius')` — migrate the
   representative. If tl has no track the copy is a no-op and uniform ends up
   keyframe-less — the approved lossy outcome.
4. `clearKeyframeTrack` for all four sub-tracks (as today; also resets any selection
   that pointed at them).

The identical-vs-differing distinction is therefore observable (tests assert both)
but not a code branch — losslessness in the identical case holds by construction.

### Mode convergence (secondary bug)

Because toPerCorner now CLEARS the uniform track and toUniform CLEARS the sub-tracks,
the set of existing tracks always matches the value shape after either toggle — so
the runtime's track-presence mode equals the inspector's value-shape mode. No
`animation-applier` change is required; a runtime test pins this invariant.

## Alternatives considered

- **Keep per-corner→uniform fully lossless (average / merge corners):** rejected —
  the owner confirmed Option 2's top-left representative with explicit lossiness.
- **Fix the divergence in the runtime (ignore orphaned uniform track when value is a
  tuple):** rejected — it would mask the real bug (orphaned data) instead of removing
  it; clearing at the source is simpler and keeps the runtime contract unchanged.
- **REMOVED + ADDED instead of RENAMED + MODIFIED:** rejected — RENAMED keeps the
  requirement's history/identity while giving the living spec an accurate name.

## Risks

- The top-left lossiness is intentional but surprising; the spec scenario and the
  docstring call it out explicitly.
- Copies regenerate keyframe ids; tests assert the four corner copies have DISTINCT
  ids so nothing aliases the source track.
