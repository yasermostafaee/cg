# Design — clearing the out-point reverts the mode (D-113)

## Recon

- `setLifecycle(marker | null)` (`document.ts`) is the SINGLE out-point mutator; `marker === null`
  clears the lifecycle. Every clear path routes through it: the inspector "Clear" button
  (`PlayoutSection.tsx:530` → `setLifecycle(null)`); the timeline only ever sets a CLAMPED out-point
  (`TimelineDock.tsx` → `setLifecycle({ outPoint })`), never null, so there is no separate drag/delete
  clear path to patch. (A marker delete, if added later, would call the same `setLifecycle(null)`.)
- Forward direction already exists: `PlayoutSection.tsx` mode select seeds a default marker when the
  operator picks `auto-out` / `loop-cycle` with no out-point; the preview disables those modes via
  `NEEDS_OUTPOINT`. D-113 adds the missing reverse.
- `withActiveDoc(scene, patch)` accepts a `Partial<EditDocFields>`, so `{ lifecycle, playout }` can be
  written in ONE `set()` — the atomicity / single-undo the requirement needs.

## Decision: revert in the store action, atomically

Put the revert inside `setLifecycle(null)` (NOT a UI effect), so it is one store action / one undo
step and fires for every clear path:

```
if (marker === null) {
  const doc = activeDocOf(scene);
  const revert = playoutOf(doc).mode !== 'manual';   // auto-out / loop-cycle (legacy normalizes too)
  set(withActiveDoc(scene, revert
    ? { lifecycle: undefined, playout: { ...doc.playout, mode: 'manual' } }
    : { lifecycle: undefined }));
}
```

- `playoutOf(doc).mode !== 'manual'` captures both `auto-out` and `loop-cycle` (and a legacy
  `content-driven` mode, which `playoutOf` normalizes to `loop-cycle`).
- `{ ...doc.playout, mode: 'manual' }` preserves the rest of the stored playout (holdMs, repeat) and
  only overrides the mode. When `revert` is true, `doc.playout` is defined (the mode was non-manual).
- When already manual, the playout key is left untouched — no spurious write (a content-less manual
  comp with no stored playout stays `undefined`).
- One-directional: nothing in `setLifecycle({ outPoint })` (re-add) touches the mode, so re-adding an
  out-point does not restore the prior mode.

## Out of scope

- Disabling `auto-out` / `loop-cycle` in the INSPECTOR mode select (it intentionally seeds a marker
  on select; the preview's `NEEDS_OUTPOINT` disabling is unchanged).
- Any runtime / schema change.
