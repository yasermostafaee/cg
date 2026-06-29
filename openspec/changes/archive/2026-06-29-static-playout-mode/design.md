# Design — `static` playout mode (D-114)

## Confirmed recon (change-sites verified against the codebase)

- `PlayoutModeSchema = z.enum(['manual','auto-out','loop-cycle'])` — `packages/shared-schema/src/scene.ts:36`.
- `playoutOf(scene: Pick<Scene, 'playout'>)` — `scene.ts:292`. Resolves absent → `manual`, legacy
  `content-driven` → `loop-cycle`+`content-driven`. Takes ONLY `playout` today — it cannot see the
  out-point.
- The out-point IS `lifecycle?.outPoint`; `lifecycle` absent ⇒ no out-point (`LifecycleSchema`
  `scene.ts:29`, optional on both `Composition` `:167` and `Scene` `:243`).
- D-113 clear-revert: `document.ts setLifecycle(null)` `:205-220` — `revert = playoutOf(doc).mode !==
'manual'` then writes `{ mode: 'manual' }`. This is the SINGLE clear path (the inspector Clear
  button + the marker delete both route here).
- Controller: `playout-controller.ts onIntroEnd:229` (`manual` early-returns to freeze the hold);
  `startOutro:259` plays `[outPoint() → active.out]`; `outPoint():190` = `lifecycle?.outPoint ??
active.out`; `cyclic():200` = `loop-cycle` only. The runtime feeds the controller `effPlayout` from
  `effectivePlayoutFor → playoutOf(scope.source)` (`runtime.ts:388`), and `scope.source.lifecycle` is
  already passed to the controller (`:825`).
- UI: `PlayoutSection.tsx` — `MODE_LABELS:24`, `mode = playoutOf(scene).mode :557`, `lifecycle =
scene.lifecycle :558`, `changeMode:612` (seeds an out-point for auto-out/loop-cycle), the mode
  `<Select>:626`, hold-source row gated `mode !== 'manual':640`, the out-point hint `:680`.

## Decision 1 — RESOLVE, not migrate; widen `playoutOf` to see the lifecycle

`playoutOf` is the single resolver every consumer reads (runtime controller, exporter, inspector,
store). Make it the authority: widen its parameter to `Pick<Scene, 'playout' | 'lifecycle'>` and, when
`lifecycle === undefined` (no out-point) AND the resolved mode is the default `manual`, return
`{ ...resolved, mode: 'static' }`. This is **resolve-on-read**, NOT a stored migration — non-destructive
(no schema-version bump), exactly like the existing `content-driven` legacy normalization. Every caller
already passes a doc / composition / `scope.source` that carries `lifecycle`, so the widening is
type-safe with no data threading.

**SCOPE (B-032 preservation).** The resolution is narrowed to the DEFAULT (`manual`/absent) mode on
purpose. An EXPLICIT `auto-out` / `loop-cycle` (or normalized `content-driven`) WITHOUT an out-point is
a real, tested state (B-032 — a content-less / content-driven timed hold that holds then cuts with an
EMPTY outro); coercing it to `static` (hold-until-stop) would break B-032 and ~21 runtime tests. The
designer UI never SETS `auto-out`/`loop-cycle` without an out-point (they are disabled, and clearing
the out-point rewrites them to `static`), so a composition AUTHORED in the editor with no out-point IS
`static`; the auto-out-without-out-point case is legacy / programmatic only. So "no out-point ⇒ static"
holds for every editor-reachable state, while B-032 keeps its behavior.

Consequence: the runtime controller gets `mode: 'static'` for a default no-out-point composition (its
new branch fires), the exporter writes `static`, and the inspector shows it.

## Decision 2 — D-113 clear-revert retargets to `static` (one-directional preserved)

Resolve-on-read alone would AUTO-RESTORE the prior mode when an out-point is re-added (the stored mode
is untouched). The D-113 invariant is explicitly one-directional, so the store must overwrite the
out-point-DEPENDENT modes on clear. Flip the revert from `manual` to `static`: `setLifecycle(null)`
rewrites `auto-out` / `loop-cycle` to `static` (so re-adding does NOT restore them). A `manual`/absent
composition is left UNTOUCHED — `playoutOf` already resolves a no-out-point default to `static`, so a
store write would be spurious (and re-adding an out-point correctly resolves it back to `manual`, not a
phantom prior mode). NO `→manual` remnant remains in the clear path.

## Decision 3 — controller: `static` = `manual`-style freeze + an empty outro

`onIntroEnd` adds `static` to the freeze branch (`mode === 'manual' || mode === 'static'` ⇒ return —
hold until `stop()`). `startOutro` forces an EMPTY range for `static` (`from = active.out`), so the
exit is a clean cut with no outro segment — robust even for a stored `static` that hand-edits in a
stray out-point. For the normal case (no out-point) this matches today's empty-outro behavior
(`outPoint() === active.out`), so `stop()` already cuts; the explicit guard makes the intent honest.
`static` is not `cyclic()` (so no loop), unchanged.

## Decision 4 — UI out-point⇄mode coupling

`mode` already reflects `static` via the widened `playoutOf`. The `<Select>`: when `lifecycle ===
undefined`, the value is `static` and `manual`/`auto-out`/`loop-cycle` options are DISABLED; when an
out-point exists, those three are enabled and `static` is DISABLED (you go static by clearing the
out-point — the existing Clear button — and you leave static by Adding an out point, which lands on
`manual`). `changeMode` keeps the auto-out/loop-cycle out-point seed defensively but it's unreachable
while disabled; hold-source + hold-ms rows hide for `static` (`mode !== 'manual' && mode !== 'static'`).

The **PREVIEW** timing controls (`PreviewTimingControls`) apply the SAME coupling
(`disabled = hasOutPoint ? m === 'static' : m !== 'static'`) so the session-override mode select and
the main composition inspector never disagree — with an out-point `static` is disabled, without one the
others are.

## Out of scope

D-116 (sequence exit timing) — a SEPARATE change on this branch, after D-114 is green. A "restore the
prior mode on re-add" affordance (the invariant stays one-directional, by design).
