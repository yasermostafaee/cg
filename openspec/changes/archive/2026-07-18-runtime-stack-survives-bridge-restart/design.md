# Design — the stack survives a bridge-process restart (B-092)

## The one decision that matters: WHERE the adopt-vs-re-ADD choice is taken

Restoring an item has to answer a single question: **is there still a producer on this layer?**

- If yes (bridge died, CasparCG kept rendering) the only safe action is to adopt the layer and touch
  nothing. Any CLEAR here is an off-air flash on live output.
- If no (bridge AND CasparCG restarted) the item must be re-ADDed so it is genuinely loaded again.

The only source of that answer is the OSC occupancy tap — and the tap is **empty at the moment the
SPA reconnects**. A fresh bridge's session has not handshaken yet; the tap resets on resync and only
fills during the RESYNCING drain. So the decision cannot be taken where the intent arrives.

It is therefore **split in two**:

| Step                         | When                                            | What it does                                                         |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `restore()`                  | the SPA's reconnect, whenever that happens      | seed reconciler + slot + interest + position, publish. Sends nothing |
| the pending-restore decision | session transition INTO `healthy` (tap drained) | per item: adopt-without-clear, or re-ADD                             |

Seeding first is what fixes the reported bug: the rows come back immediately, before CasparCG is
even reachable. The deferred half is what makes it broadcast-safe.

`restore()` also takes the decision **inline** when the primary session is ALREADY healthy — the
late-page-reload case, where the `to === 'healthy'` transition fired long ago and will not fire
again. Without that branch those items would sit pending forever.

## Why the healthy transition, specifically

`ServerSession.transitionTo` emits `state-change` and only then `emit('healthy')`. That ordering is
load-bearing:

- Our decision runs on `state-change` → **before** `session.on('healthy')` clears `#loaded`, so we
  never fight that invalidation.
- It runs before `reconcileOnReconnect`, which iterates `this.items` — so the reconciler must
  already be seeded, which `restore()` guarantees. All of our record mutations in the decision are
  **synchronous** (only the `CG ADD` is awaited), so `reconcileOnReconnect` sees a settled
  reconciler: a re-ADDed item has `played === false` by then and is correctly skipped by it.

We reuse B-086's occupancy sample verbatim (`occupied(this.#occupancyStaleMs)`), so the two
reconcile paths can never disagree about what is on air.

## Why "silent" is safe to treat as empty

Real CasparCG goes SILENT for a CLEARed layer rather than reporting `empty` (B-053), so silence IS
the empty signal — the same contract the R-009 orphan sweep and B-086's reconcile already rely on.

The failure mode of a wrong "silent" verdict (OSC misconfigured, so everything looks silent) is a
`CG ADD` onto a possibly-live layer — a stage replace, exactly what an ordinary load or a B-039
re-ADD already does. The failure mode of a wrong verdict in the other direction would have been an
explicit CLEAR. That asymmetry is why **no restore branch ever clears**: the safe direction is
"never destroy a producer", and both branches respect it.

## `#adopted` is seeded only on the occupied branch

Marking a layer adopted suppresses a future adopt-CLEAR on it. On the occupied branch that
suppression is the POINT (and is the invariant the tests assert). On the silent branch we
deliberately leave `#adopted` alone: we did not prove the layer's state by clearing it, and a
future ordinary load onto that layer should keep its normal adoption. Conservative in the direction
that preserves the existing reconnect-reconciliation contract.

`#loaded` is likewise seeded only where it is earned — by `#sendAdd` succeeding on the silent
branch. A restored on-air item stays out of `#loaded`, which is exactly the state B-054 leaves every
item in after any session reconnect, so `take`/`update` recover through the existing B-039 lazy
re-ADD with no new path.

## Play evidence, and why over-claiming it is the safe direction

The retained `played` flag is derived from the last published status: `playing`, `on-air`,
`updating`, `exiting`, `unverified` and `unconfirmed` all restore as "was on air"; `idle`, `loaded`,
`error` and `disconnected` do not. Ambiguous states deliberately land on the on-air side, because
the occupancy check immediately corrects an over-claim (silent layer → re-ADD as `loaded`) whereas
an under-claim would hide a genuinely live graphic — this file's standing error direction.

A restored on-air record sets `ackedStatus` alongside `intentStatus`, reconstructing what the record
looked like before the bridge died (a settled, confirmed take). Without it `pending` would be true
and the row would spin forever on a link that may never come back.

## Retention cannot be wiped by the bug it fixes

The retention store mirrors every published snapshot — including a legitimately empty one after
Remove All. The danger is mirroring the EMPTY snapshot a fresh bridge reports when the restore
itself failed. So mirroring is suppressed for the whole restore window and only resumes once the
restore step has completed; a restore that throws leaves the retained intent untouched for the next
connect. Local-wins, with the live bridge's own items never clobbered.
