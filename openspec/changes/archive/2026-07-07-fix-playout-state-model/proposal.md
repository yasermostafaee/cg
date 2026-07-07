# Fix the playout state model — prescriptive AMCP verbs (B-039)

## Why

B-039 (filed, hardware-observed on real CasparCG 2.3.2): the bridge emits playout
verbs **blindly**, not from actual producer state, so the live load/take/out/retake
cycle is broken:

- **Load auto-plays.** `CommandBuilder.load` hardcodes the `CG ADD … 1 …`
  **play-on-load** flag, so CasparCG plays the template on ADD — before Take.
- **Retake after Out never re-renders.** `out()` sends `CLEAR` (destroying the
  producer) but `take()` only ever emits `CG PLAY` from the still-mapped slot — onto
  the now-destroyed producer → `202 OK` but nothing renders. The template never
  comes back.

The root cause (per the bug): the `StackItemStatus` / `Reconciler` machine is
**descriptive** (it drives the UI) and does **not** choose verbs. There is no
prescriptive layer that maps an intent + current producer state → the right AMCP
sequence. `amcp-mock`'s blind 202-ack of `CG PLAY` on any layer hid the gap.

B-039 stays `[~]` until the take→out→take cycle is **hardware-validated** on real
CasparCG (operator confirm, like B-038).

## What Changes

Make the playout verbs **prescriptive** — the bridge chooses `CG ADD` vs `CG PLAY`
from the actual per-slot producer state:

- **load** → `CG ADD` only, with **play-on-load OFF** (`0`). Result: the producer is
  _loaded, NOT playing_.
- **take** → `CG PLAY`. **But** if no producer currently exists on the slot (e.g. a
  prior Out destroyed it), take FIRST re-issues `CG ADD` (a fresh load), THEN
  `CG PLAY`. The bridge tracks **per-slot producer existence** to decide this.
- **out** → exit + `CLEAR` (destroys the producer) and updates the bridge's
  producer-existence bookkeeping so a later take knows to re-ADD. The slot stays
  **reserved to the item** (still on the stack, idle) until remove.
- **remove** → unchanged (full removal: clear + deallocate + drop bookkeeping).

The producer-existence state lives **bridge-side** (`CasparRuntime`), separate from
the descriptive `Reconciler`. It stays consistent across load/take/out/remove and
across a failover (commands fan out to both servers under mirror-sync, so producer
existence is identical on each).

`tools/amcp-mock` is extended to **model the producer lifecycle** so this cycle is
testable: `CG ADD` honours the play-on-load flag, `CG PLAY` only puts a template on
air when a producer is actually loaded (PLAY on an empty/destroyed layer is an
observable **no-op**, not a silent success), and `CLEAR`/`CG REMOVE` destroy it.
This is the exact gap the blind-ack hid; the mock must now catch it.

## Capabilities

- `runtime-caspar-bridge`:
  - ADDED — playout verbs are prescriptive: the bridge selects `CG ADD` vs `CG PLAY`
    from per-slot producer existence (load = ADD-not-playing; take = re-ADD if the
    producer is gone, then PLAY; out destroys + updates bookkeeping); the state is
    bridge-side and consistent across the lifecycle + failover.
  - MODIFIED — the AMCP seam: `load` uses play-on-load OFF (loaded, not playing), and
    a take with no live producer re-issues `CG ADD` before `CG PLAY`. (Pending
    on-hardware re-validation of the load/take/out/retake cycle.)

## Impact

- `tools/caspar-bridge` — `command-builder` (play-on-load `0`); `caspar-runtime`
  (producer-existence bookkeeping + prescriptive load/take/out/remove).
- `tools/amcp-mock` — producer lifecycle (play-on-load honoured; `CG PLAY` no-op on
  an empty layer; expose on-air state).
- `apps/runtime` — none required (the verbs are bridge-side); gated as a touched
  consumer.
- Tests — mock producer-lifecycle unit tests + a bridge integration test for
  load(no auto-play)→take(plays)→out(destroys)→take(re-ADD then plays, renders).
- B-039 stays `[~]` (flips to `[x]` only after on-hardware validation of the cycle).
