# Design — split exit (D-105)

## The exit-coordination decision (the key choice)

The coordination lives in the RUNTIME, not the preview layer, because the runtime
is the single shared source for preview / exported HTML / on-air — all three must
coordinate identically (per CLAUDE.md "how a scene renders → @cg/template-runtime").

Today's exit: `runtime.stop()` → `cascade(c.stop())` plays each scope's background
outro `[outPoint → out]` (keyframed `scope.animated` elements) while the content
drivers (ticker/clock/sequence) keep running; content is only hard-stopped at
settle (`onRootSettled`), and `cg-pending` hides the whole stage. So content is
visible (frozen) THROUGH the background outro, then pops out — the uncoordinated
look. Content elements are driver-managed and **cleanly separate** from the
keyframed background, which makes a two-phase exit tractable.

**Two operations, both ending in the D-085 cleared state:**

- **`out()` (animated, content-first):**
  1. `animateContentOut(durationMs)` — fade every content driver's node opacity
     1→0 over a default duration (≈400 ms), returning a promise that resolves
     after the duration (driven by the runtime `clock.setTimeout`, so it's
     deterministic under the test clock). Aggregate across the scope tree (reuse
     the D-104 `instanceChildren` recursion) so nested content fades too.
  2. `await` it, THEN run the existing background-outro path (`cascade(c.stop())`)
     so the background plays its authored outro LAST.
  3. Settle cleared (unchanged `onRootSettled` / `cg-pending`).
- **`stop()` (quick):**
  1. `hideContentNow()` — immediately halt + hide every content driver's node
     (the content is gone before the background moves).
  2. THEN the existing background-outro path, then settle cleared.

So both share `playBackgroundOutroAndSettle()` (today's `stop()` body); they differ
only in how content LEAVES first: an animated fade (`out`) vs an instant hide
(`stop`).

## Why a fade (not per-driver authored out-transitions) for v1

The acceptance's content-first/background-last DEFAULT is satisfied by a generic
content fade; tickers/clocks have no authored exit, so "a sensible default off"
(the PRD's words) is exactly a short fade. The background's authored `[outPoint →
out]` keyframes ARE respected (they play, last). Respecting a SEQUENCE's authored
`transitionOut` on exit (vs the default fade) is a noted future refinement — it
does not change the coordination contract.

## Driver seam

Each content driver gains `fadeOut(durationMs): Promise<void>` (set the root
node's `transition: opacity` + `opacity: 0`, resolve via `clock.setTimeout`) and
an idempotent immediate `hide()` (used by the quick stop; `stop()` already cancels
rAF). The fade is visual-only in a real browser and time-deterministic under the
fake clock, so it's unit-testable without asserting pixels.

## Risks / decisions

- **Token guard / re-entrancy:** `out()` is async (awaits the fade). Guard against
  a `stop()`/`play()` arriving mid-fade (a stop during an out should hard-clear
  immediately). Reuse a generation token, like the hold token.
- **No background outro (no outPoint):** the background settles instantly; `out()`
  still fades content first, then settles — still content-first.
- **Nested / content-driven scopes (D-104):** `animateContentOut` walks the same
  `instanceChildren` tree; a self-settled nested scope's content is already gone.
- **`stop()` timing change:** hiding content at the START of `stop()` (vs at
  settle) keeps the D-085 final state (stage hidden, content gone) — the cleared
  tests assert the end state, which is preserved.

## Out of scope

No schema change. Sequence `transitionOut`-on-exit, per-element configurable out
durations, and an authored exit-choreography model are future work.
