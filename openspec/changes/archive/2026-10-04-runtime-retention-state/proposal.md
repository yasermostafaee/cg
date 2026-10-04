# Retention must model the row's STATE, not just its content

## Why

**Three filed bugs, one root: retention remembers WHAT was on air but not the STATE that put it
there.** `StackRetentionStore` reduces every reconciled row to `played: boolean` + slot, and
`played` is derived from a status list that lumps `idle`, `loaded`, `error` and `disconnected`
together as `false`. The status — the one fact that says whether the row succeeded, failed, or was
deliberately emptied — has nowhere to live and is dropped at the moment it is mirrored.

So when the bridge dies or restarts, the browser and the bridge both replay content into a state
that was never true:

- **[[B-107]] — the DISPLAY face.** `WebSocketRuntime.#retainedProjection()` maps every retained
  item to `status: i.played ? 'unverified' : 'loaded'`. The instant the bridge process dies, every
  ERROR row on the operator's stack flips to **READY**. `useStack` opts into
  `pullWhileDisconnected`, so the flip is immediate and hits every errored row at once. A load that
  never got a layer presents as pre-rolled and playable, on a link the SPA can no longer use in
  either direction. **A status must never IMPROVE when a link is lost** — this is [[B-086]] /
  [[B-087]]'s demote-on-silence rule broken in the opposite direction.
- **[[B-109]] — the WIRE face.** Because a cleared `idle` row and a pre-rolled `loaded` row retain
  as the identical `{ played: false, slot }`, `restore()` cannot tell "the operator emptied this
  layer on purpose" from "a producer was lost and should come back". `#decidePendingRestores` finds
  the layer silent — the operator's own CLEAR emptied it — takes its "silent → re-ADD as loaded"
  branch, and puts the producer back with a `CG ADD` nobody asked for. It directly undermines
  [[B-092]]'s safety property ("a restore can never change what is on a layer"): the same path that
  refuses to CLEAR a live layer will RE-ADD onto a layer the operator emptied.
- **[[B-108]] — the honesty face, and it belongs here.** `restore()` already computes
  `{ restored, skipped }` and `WebSocketRuntime.#resync` DISCARDS the result. Rows the bridge could
  not re-seat simply vanish with nothing said. **Silently not restoring something is the same class
  of lie as falsely restoring it**, and this change adds a THIRD reason a row is not restored (it
  was cleared, or it errored) — so shipping the model without the surface would make B-108 worse.

**This must land BEFORE Live Source phase 6.** Task 6.9d of `live-source-multibox` requires the
per-plate source override to survive a bridge restart and names this as "the `B-107`/`B-109` class
— retention dropping state it did not model". Adding a field to a correct model is cheap; repairing
a model that has already grown one is not.

## What Changes

### The model — ONE field, because the state IS the reason

`RetainedStackItem.played: boolean` is REPLACED by `state: RetainedAirState`, a four-value enum,
plus an optional `errorCode`:

| `state`   | meaning                                                                      | restore may re-seat a producer? |
| --------- | ---------------------------------------------------------------------------- | ------------------------------- |
| `on-air`  | on air when last observed, or possibly so — the bridge died under it         | **yes** (adopt or re-ADD)       |
| `loaded`  | producer resident, not on air. A re-ADD is what it asks for                  | **yes**                         |
| `cleared` | the layer is KNOWN EMPTY — the operator CLEARed it, or a reconcile proved it | **NO**                          |
| `error`   | the last operation FAILED; the row never got what it asked for               | **NO**                          |

**Why one field and not two.** The obvious design is "state" plus a separate "why it left air".
That second field would be a SECOND DERIVATION of the same fact — the repo's one-canonical-predicate
rule (golden rule 6) is exactly about not having two. The distinction is already carried by the
state, because the states are named for it: a **deliberate CLEAR** is the only operator action that
takes an acknowledged row to `cleared`, while **the bridge dying under a live row** leaves it at
`on-air` — it never left air as far as anyone knows. `played` survives only as a DERIVED value
(`state === 'on-air'`), computed at the call sites that need it and nowhere stored.

The status → state map lives in `@cg/shared-schema` as ONE exported function, `retainedStateFor()`,
so the browser store, the bridge's integration tests and any future consumer cannot each grow their
own copy. The ambiguous on-air set (`exiting`, `unconfirmed`, `unverified`, `updating`) still
resolves to `on-air` deliberately, unchanged: over-claiming is self-correcting (the occupancy check
demotes it), under-claiming would treat a LIVE layer as empty.

### The two faces of the fix

- **Display (B-107)** — `#retainedProjection` maps `cleared → 'idle'` and `error → 'error'` (with
  its `errorCode`), instead of collapsing both to `loaded`. The projection still round-trips
  exactly, so re-mirroring it can never corrupt the retention.
- **Wire (B-109)** — `restore()` seeds a `cleared` row at `idle` and an `error` row at `error`, and
  **does not enter either into `#pendingRestore`**. A row that is not pending cannot reach
  `#decidePendingRestores`, so the silent-layer re-ADD branch is unreachable for it — the fix is
  the absence of a path, not a guard someone can forget.

### The honesty surface (B-108)

`restore()` returns `skipped: Array<{ itemId, reason }>` instead of a bare count. `#resync` consumes
it, filters out the benign `already-held` case (a page reload against a healthy bridge loses no
row), and publishes the rest to a Layers-panel notice naming how many rows did not come back and
why. Deliberately MINIMAL — see below.

## Impact

- **Affected specs:** `runtime-caspar-bridge` (MODIFIED — three requirements: the retention model,
  the offline view's honesty, and the occupancy-aware restore).
- **Affected code:** `@cg/shared-schema` (`runtime/item-state.ts`), `@cg/shared-ipc`
  (`channels/stack.ts`), `@cg/caspar-client` (`reconciler.restoreItem`), `@cg/caspar-bridge`
  (`caspar-runtime.ts` `restore()`), `@cg/runtime` (`StackRetentionStore`, `WebSocketRuntime`,
  the Layers panel notice).
- **`MockRuntime` needs no change and stays at parity** — it models a bridge-less session
  (`link.status()` is a constant `offline-mock`), so it has neither retention nor `restore`, and
  the mock↔bridge parity guard compares the `RuntimeBridge` method tree, which is untouched.
  Bridge death and restart are reproducible without hardware through the REAL in-process bridge
  (`createBridge`) that `stack-retention.test.ts` and the E2E already drive, and against the mock
  CasparCG (`@cg/amcp-mock`) for the wire-level assertions.
- **On-air surface: YES.** This changes what a restore puts on a layer. Flagged per CLAUDE.md's
  commit-and-flag policy.

## How 6.9d's override attaches — and why it will not reshape this

**It becomes one more OPTIONAL FIELD on `RetainedStackItem`, beside `position`.** Concretely:
`sourceOverride?: LiveSourceOverride`, mirrored in `toRetained` from the published
`StackItemState`, and re-applied in `restore()` at the same point `#positions.set(...)` already
re-applies R-011's placement — which is deliberately BEFORE any re-ADD decision runs, so a
re-issued producer carries it.

**Why adding it later costs nothing.** This change splits the retained record into two axes that do
not interact:

- a **CLOSED** axis — `state`, an enum of four values that answers exactly one question: may this
  row's producer be re-seated? Adding a fifth value would be a model change and would need this
  kind of work.
- an **OPEN** axis — the operator's per-item OVERRIDES (`slot`, `position`, and next
  `sourceOverride`), each an independent optional field that the restore re-applies before it acts.
  Adding one is additive: no existing field changes meaning, no consumer branches differently, and
  the restore decision is not consulted.

  6.9d's override is an override, not a state. It lands on the open axis. **If it had had to change
  what "restorable" means, the model here would be the wrong shape — that is the test this answer is
  making, and it passes.**

## The skipped surface is deliberately minimal — 6.9e will absorb it

Phase 6.9e reshapes the same rows ("reachable in one or two actions from the row"), so this adds
the LEAST that is honest rather than the best surface:

- Rows that came back but were deliberately NOT re-seated (`cleared`, `error`) are honest **on the
  row itself**, through state the row already renders — an errored row shows ERROR with its code
  instead of READY; a cleared row shows its own resting state. No new widget.
- Rows the bridge could not re-seat at all have no row to be honest on, so they get ONE panel-level
  notice in the Layers list: how many, and why. When 6.9e reshapes the rows it can move this
  per-row and delete the notice; nothing else depends on it.

⚠ **One deliberate limit, stated rather than hidden.** `idle` and `loaded` both render as the word
READY (the unified-layer-rows owner decision, with the difference in `readyDetail`'s tooltip). This
change makes the STATUS honest — a cleared row publishes `idle`, never `loaded` — but does not
re-open that display merge, which post-dates B-107 and was decided on its own grounds. B-107's
dangerous case, `error` → READY, IS fixed. Recorded in B-107's PRD notes too.
