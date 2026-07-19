# Protect video layers: a graphics operator can never clear one (R-015)

## Why

The operator must not be able to take another system's output off air. Today the one control
that can — R-009's per-layer Clear on a surfaced orphan — accepts ANY unowned layer, and the
banner it lives in presents a program feed as an amber problem ("likely left by a previous
session") with a CLEAR button one confirm away from cutting it.

The owner's rule dissolves the R-009 conflict without guessing, because the discriminator is
OBSERVABLE rather than inferred:

- OSC reports the producer KIND per layer (`html` / `ffmpeg` / …), and this system only ever
  places HTML producers.
- So a non-`html` producer is PROVABLY not ours → clearing it must be impossible. Not
  confirm-gated harder — the affordance simply does not exist, and the bridge refuses the
  command besides.
- An orphaned `html` producer is plausibly our own graphic riding through a dead bridge
  session — exactly what R-009 was built for → its Clear affordance survives for that case,
  unchanged.

"Not html" fails safe: an unrecognised producer kind (`image`, `route`, `decklink`, …) is
treated as not-ours rather than enumerated, and a layer with NO fresh observation is refused
too — silence is evidence of nothing, so it cannot license a CLEAR.

## What Changes

- **Bridge prohibition, not a UI gate.** `clearLayer` gains a third refusal beside `owned`
  and `amcp-error`: `foreign` — returned unless the current primary's occupancy tap has a
  FRESH observation of the layer whose producer kind is `html`. A UI-only gate would leave
  `layers.clear` accepting a foreign coordinate from any caller; the bridge is where the
  prohibition is real.
- **The banner splits by producer kind.** Orphaned `html` layers keep today's amber warning
  strip and confirm-gated Clear verbatim. A non-`html` layer renders as a NEUTRAL,
  informational row — normal tone, no `role="alert"`, no Clear control, and copy that says
  what it is ("carrying video — placed by another system") instead of the false "likely left
  by a previous session". There is essentially always a video layer in play; a permanent
  amber alert would imply something is wrong when nothing is.
- **The amcp-mock learns to tell the truth about media.** Its `PLAY`/`LOAD` media path
  reported every producer as `html` (M4 scope); it now reports `ffmpeg` for media plays, so
  the wire tests exercise the real discriminator.
- **`layers.clear` contract** (`@cg/shared-ipc`) documents the new `foreign` reason; the
  offline `MockRuntime` mirrors it for parity and the E2E seed gains a video layer so
  Playwright drives the neutral row.

## Out of scope (recorded, not fixed here)

- **The allocation path.** `LayerManager.allocate` consults only its own bookkeeping, so an
  ordinary Add-item can adopt-CLEAR a foreign producer sitting inside a template-type range.
  Filed as its own PRD item (see `docs/prd/caspar.md` C-014) — it touches the load hot path
  and B-039/B-056 adoption semantics.
- **Restart misadoption** (see `design.md` for the full judgement): B-092's restore can adopt
  a foreign producer that landed on a retained-intent layer while the bridge was dead.

## Impact

- **Affected specs:** `runtime-caspar-bridge` (orphan-clear requirement), `runtime-ui`
  (orphan banner requirement).
- **Affected code:** `tools/caspar-bridge` (`clearLayer`), `@cg/shared-ipc`
  (`layers.clear` reason enum), `tools/amcp-mock` (media producer kind),
  `apps/runtime` (`OrphanLayersBanner`, `MockRuntime` parity + E2E seed).
