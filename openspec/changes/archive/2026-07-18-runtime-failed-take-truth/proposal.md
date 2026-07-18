# A failed take retracts its own play evidence (B-079)

## Why

A structurally-real second path to a false ON AIR, found while tracing the R-006 incident.
Not what the operator saw — but the same lie, reachable without the mock.

`Reconciler.reconcileStatus()` puts **OSC truth above the ack**:

```ts
const fresh = this.freshTruth(rec);
if (fresh !== null) return fresh; // OSC wins
if (rec.ackedStatus !== undefined) return rec.ackedStatus;
```

and `freshTruth()` derives `rec.played ? 'on-air' : 'loaded'` — where **`played` is set at
INTENT time** (B-053), before any wire confirmation.

OSC is bound independently of AMCP: `ServerSession` binds it once for the session lifetime,
_before_ the connect loop, and keeps it bound across every failed AMCP cycle. The bridge
feeds it to the Reconciler with no health gate. So with **AMCP dead but OSC still arriving**
and _any_ producer on the item's layer (an orphan, or the producer from an ADD that landed
before the drop):

- PLAY → `applyIntent('take')` sets `played = true`
- the `CG PLAY` is rejected → `applyAck(seq, false, 'amcp-send-failed')` → `ackedStatus = 'error'`
- `freshTruth` sees producer-present + `played` → returns `'on-air'`
- `reconcileStatus` returns it **without ever consulting the failed ack**

Published: `{ status: 'on-air', pending: false, errorCode: 'amcp-send-failed' }` — solid red
ON AIR for a `CG PLAY` that never reached the wire. `StackRow` never renders `errorCode`.

The failed ack is _recorded_ and then _outranked_. B-044's unconfirmed discipline is not
broken here — it is **bypassed** by the OSC branch.

## What Changes

**A failed take retracts the play evidence that that take asserted — and nothing else.**

`applyIntent('take')` remembers the item's prior play evidence; a **failed** ack for an
intent that was a take restores it. So:

| situation                                        | before             | after                                                        |
| ------------------------------------------------ | ------------------ | ------------------------------------------------------------ |
| fresh load → take → send fails, producer present | **`on-air`** (lie) | `loaded` — true: the producer is loaded, it was never played |
| already on air → re-take → send fails            | `on-air`           | `on-air` — unchanged, it really _is_ on air                  |
| failed `update` / `out`                          | unchanged          | unchanged — they never touched `played`                      |

The same retraction applies when a take **expires** with no ack at all.

### Why not the blunter fixes

- **"`ackedStatus === 'error'` short-circuits above `freshTruth`"** — rejected. It would
  also demote a _genuinely on-air_ item to ERROR when an `update` fails, which is a step
  toward hiding a live graphic. The Reconciler's own recorded doctrine is that a false ON
  AIR is _preferable_ to a false IDLE ("a false ON AIR badge prompts the operator to check
  the output; a false IDLE would hide a live graphic"), so a fix must not create the second
  hazard while removing the first. Retracting only the _unproven_ play evidence removes the
  lie without ever under-claiming a real graphic.
- **"set `played` on the ack instead of the intent"** — rejected: that IS B-053's contract
  ("play evidence, set at intent time: a still-fresh load-time producer observation
  immediately re-derives as `on-air`"), and moving it would change B-053's behavior rather
  than restore the bypassed discipline.

### Also: `take` gains bounded completion

`#armExpiry` is called for `update` and `out`, never for `take` — and `expireIntent`
explicitly refuses to expire anything that is not `updating`/`exiting`. So a take whose ack
never settles rests on its optimistic status **forever**, with nothing to bound it. `take`
now arms the same bounded timer, and `expireIntent` accepts `playing`, landing the item in
the explicit `unconfirmed` state (retracting the unproven play evidence with it).

## Non-goals / explicitly unchanged (FROZEN)

- **B-053's read-time derivation is intact.** Play evidence is still set at intent time; a
  producer present but never taken still reads `loaded`, never `on-air`. Only a take whose
  command _demonstrably failed_ gives its evidence back.
- **B-070 / B-072 producer-state rules are untouched.** The failed-ack settlement (B-070)
  and the published position read-back (B-072) live in these exact lines and keep their
  contracts; this adds one retraction and changes neither.
- **The broadcast-safe error direction is preserved in both directions** — see the table:
  nothing that is genuinely on air is ever demoted.
- **No AMCP change**, no new verb, no OSC plumbing change. The OSC feed is not gated (that
  is a separate concern); the ladder simply stops treating unproven evidence as proven.

## Capabilities

- `runtime-caspar-bridge` — MODIFIED: the OSC truth derivation, and bounded completion for
  transient intents.

## Impact

- `packages/caspar-client` — `Reconciler` (`applyIntent`, `applyAck`, `expireIntent`).
- `tools/caspar-bridge` — `take` arms an expiry.
- B-079 → `[x]` on archive.
