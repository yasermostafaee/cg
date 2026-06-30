# Design — Prescriptive playout verbs (B-039)

## The prescriptive layer (where it lives)

`CasparRuntime` (the bridge backing) gains a small **producer-existence** map and
chooses the AMCP sequence from it. This is the "prescriptive" layer the bug calls
for; the `Reconciler` stays purely descriptive (it drives the UI and is untouched
here).

Bridge-side state:

- `#slots: Map<itemId, CommandSlot>` — the slot **reserved** to an item. Lifetime:
  set at load, retained through out (the item is still on the stack, idle), deleted
  at **remove**. (Unchanged lifetime — out no longer needs to touch it.)
- `#loaded: Set<itemId>` — **NEW.** Whether a **live producer currently exists** on
  the item's reserved slot. Set after a successful `CG ADD`; cleared after out's
  `CLEAR` (and at remove). This is the per-slot producer-existence signal that drives
  verb selection.

### Why a dedicated `#loaded` set (not "out clears #slots")

The bug suggested "out should clear `#slots` so retake re-ADDs." We instead keep the
slot **reserved** to the still-present (idle) stack item and track producer existence
in `#loaded`, because:

- An item that is _out_ is still **on the stack** — it owns its layer for its stack
  lifetime. Deallocating the layer on out would orphan a present item from its layer
  and risk another load grabbing it (a collision on retake).
- Keeping the slot lets retake re-ADD onto the **same** slot — no re-allocation race,
  no churn, OSC interest stays in place.
- The layer is freed only at **remove** (the item leaves the stack) — the correct
  resource lifecycle.

The user explicitly delegated "decide where producer-existence state lives"; this is
that decision. The functional requirement ("the bridge knows the producer is gone so
retake re-ADDs") is met by `#loaded`.

## Verb sequences

| Intent | Producer state          | AMCP emitted                                                   |
| ------ | ----------------------- | -------------------------------------------------------------- |
| load   | (fresh)                 | `CG ADD … 0 …` (play-on-load OFF) → `#loaded+`                 |
| take   | producer loaded         | `CG PLAY`                                                      |
| take   | no producer (after out) | `CG ADD … 0 …` (re-load) → `CG PLAY` → `#loaded+`              |
| out    | playing/loaded          | `CLEAR` → `#loaded-` (slot kept)                               |
| remove | any                     | `CLEAR` → delete `#slots`/`#loaded`, deallocate, drop interest |

The take re-load recovers the template id + fields from the `Reconciler` record
(`reconciler.get(itemId)`), so the operator's current (merged) field values are
re-applied on the fresh `CG ADD`. The re-ADD is sent with a non-intent seq, so its
ack is a no-op for the reconciler; the take intent's seq still drives the status.

`command-builder.load` changes the play-on-load argument `1` → `0`. `take` is still
`CG PLAY`; the re-load reuses `command-builder.load`. The `CG UPDATE` /
hardware-validated update path (ADR 0006) is untouched.

## Failover consistency

`#slots` / `#loaded` are bridge-side and **server-agnostic** (`CommandSlot` is just
`{channel, layer}`). Under mirror-sync every `CG ADD` / `CLEAR` fans out to both A
and B, so producer existence is identical on each server; after a failover the same
bridge bookkeeping applies to the new primary with no extra work. (The bridge does
not run its own reconciler resync window today; this change adds none.)

## amcp-mock — producer lifecycle (so the cycle is testable)

The mock's blind 202-ack of `CG PLAY` on any layer hid B-039. The mock now models the
producer:

- `LayerState` gains `onAir: boolean` (a CG template producer is loaded **and**
  playing).
- `CG ADD` (resolved URL) → `producer: 'html'`, `onAir = (play-on-load arg === '1')`.
  So a load (`… 0 …`) loads the producer **not playing**; a legacy `… 1 …` plays.
- `CG PLAY` → if a producer is loaded (`producer === 'html'`) set `onAir: true`; if
  the layer is empty/destroyed it is an **observable no-op** (`onAir` stays false) —
  `202` is still returned (matching real CasparCG's blind ack), so the test asserts
  on **state**, not the ack.
- `CLEAR` / `CG REMOVE` → `producer: 'empty'`, `onAir: false` (destroyed).

`mock.layerState(slot)` exposes `producer` (loaded) and `onAir` (playing), so a test
distinguishes "PLAY on a loaded producer" (renders) from "PLAY on an empty layer"
(no-op). The OSC firehose / `Reconciler` mapping is unchanged (out of B-039 scope).

## Tests

- **command-builder**: `load` emits `CG ADD … 0 …` (play-on-load OFF).
- **amcp-mock**: `CG ADD … 0 …` loads not-playing; `CG PLAY` on a loaded producer →
  `onAir`; `CG PLAY` on an empty layer → no-op (`onAir` stays false); `CLEAR`
  destroys.
- **bridge integration** (with the HTTP serve + hardened mock): load → producer
  loaded, **not** on air (no auto-play); take → on air; out → producer destroyed;
  **take again → producer is re-ADDed (empty→html) and on air** (renders again), with
  two `CG ADD`s observed across the cycle.

## Out of scope

- On-hardware validation of the load/take/out/retake cycle (operator, after merge —
  flips B-039 to `[x]`).
- The `Reconciler`'s OSC→status interpretation (descriptive layer) is unchanged.
