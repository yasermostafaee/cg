# The stack survives a bridge-process restart (B-092)

## Why

[[B-087]] made the ON AIR badge honest _while_ the bridge is down — the DISPLAY half of the
bridge-death story. This is the RECOVERY half: when the bridge comes **back**, the operator's whole
stack is **gone**. Owner mandate: stack items must survive a bridge restart in **any** case.

Root cause (recon, verified against source):

1. The stack lives ONLY in the bridge's in-memory `Reconciler` (its `items` Map, plus
   `#slots`/`#loaded`/`#adopted` in `caspar-runtime.ts`). Nothing persists it.
2. On a bridge restart the new process boots EMPTY. The SPA's `#resync`
   (`WebSocketRuntime.ts:280-296`) re-delivers the browser-local template library — [[B-085]] works —
   but then re-PULLS the now-empty stack snapshot and pushes `[]` to every subscriber (`:301-307`).
   Every row disappears.
3. The SPA retains no stack intent of its own: `stack.*` are bare pass-throughs, and `#lastStack`
   exists only for B-085's offline remove-reference check. Pre-existing — B-085 made the LIBRARY
   browser-local but deliberately left the stack bridge-owned.

**The hazard that forbids the naive fix (adversarially verified).** Simply re-issuing `stack.load`
per retained item drives the CG ADD path, and that path **CLEARs before it ADDs**: `load()` →
`#adoptLayer(slot)` (`:517`) → `#adopted` is empty on a fresh process → it falls through to
`#send(#builder.out(slot))` (`:1267`), a hard CLEAR that DESTROYS the producer. On a **bridge-only**
restart (CasparCG still on air) that CLEAR lands on the **LIVE** layer: an OFF-AIR FLASH, then a
re-add as merely `loaded`. That is precisely the broadcast-safety lie the frozen doctrine forbids
(the same adopt-CLEAR-vs-primary code family as [[B-056]]). "Must not disappear in any case"
therefore cannot be satisfied by the naive path — the restore MUST be occupancy-aware.

## What Changes

Browser-local stack retention plus an **occupancy-aware** restore-on-connect that can never clear a
live layer.

- **A persistent browser-local stack retention store.** `StackRetentionStore` (OPFS-backed via
  `@cg/storage`, mirroring B-085's `LibraryStore`) holds the stack INTENT — itemId, templateId,
  fields, play evidence, desired slot, position, order — mirrored from every published snapshot. It
  is owned by the SPA, so it survives both the bridge's death and a page reload.
- **A stack reconcile-on-connect step in `#resync`, alongside the library one.** The retained
  intents are re-delivered FIRST (new `stack.restore` channel) so the bridge is rebuilt before the
  SPA re-pulls; the re-pull then returns the RESTORED stack instead of `[]`. Conflict policy is
  local-wins, with one exception: an item the live bridge already holds is never clobbered (a page
  reload against a healthy bridge changes nothing).
- **The stack stays VISIBLE while the bridge is down.** Retention alone does not achieve the
  owner's "in any case": if the retained intent is only the reconnect delivery set, a hard refresh
  DURING an outage still shows an empty stack. So `stack.snapshot()` is served from the retention
  while the link is not usable, instead of being refused — the same local-answer model B-085 gave
  the library. Display only: it sends nothing and decides nothing, and the authoritative snapshot
  replaces it on reconnect. The rows are honest about what cannot be verified — a was-on-air row
  renders as B-086/B-087's muted `unverified`, never a confident red, because with no bridge the SPA
  has no conduit to CasparCG at all.
- **A bridge-side `restore()` that seeds state and DEFERS the air-touching decision.** It seeds the
  Reconciler (new `restoreItem`), reserves each retained slot exactly (new `LayerManager.reserve`),
  binds OSC interest, restores the position override, and publishes IMMEDIATELY — the rows come back
  at once, which is the core bug fix. It sends NOTHING to CasparCG at this point.
- **An occupancy-aware adopt-vs-re-ADD decision, taken where occupancy is knowable.** The tap only
  populates after the fresh session reaches `healthy` and OSC flows, so the decision runs at the
  `to === 'healthy'` transition — the EXACT hook B-086 already samples occupancy at
  (`caspar-runtime.ts:334-339`) — or immediately when `restore()` arrives at an already-healthy
  session (a late page reload, where the tap is already warm). Per pending item:
  - **Occupied layer → ADOPT WITHOUT CLEAR.** Mark the layer adopted, send NOTHING. Resumed OSC
    re-derives `on-air` on its own (`reconciler.ts:610-615`). This is the bridge-only-restart case:
    the live graphic is never touched, so it never flashes.
  - **Silent layer → re-ADD as `loaded`.** A normal `#sendAdd` — still no adopt-CLEAR. This is the
    bridge+CasparCG-restart case: the layers really are empty, so the items return `loaded`.

  Occupancy is the discriminator, and **neither branch can ever clear a live layer**.

## Frozen — safety and scope unchanged

- **The normal (non-restore) `load()` path keeps its adopt-CLEAR verbatim.** Only the RESTORE path
  adopts without clearing, and only on an OBSERVED-occupied layer. The reconnect-reconciliation
  contract for ordinary loads is untouched.
- **On-air REFUSAL unchanged (R-006).** `take`/`update`/`out` stay refused while no declared server
  is reachable; restore sends nothing on a dead link.
- **[[B-085]]'s browser-local library and [[B-086]]'s CasparCG-death path are untouched.** The
  restore decision reuses B-086's occupancy sample; it does not alter it, and
  `reconcileOnReconnect` still runs exactly as before (restored items are settled synchronously
  before it, so it sees a consistent reconciler).
- **No channel-level CLEAR, no new AMCP verb.** The restore either sends nothing or the same
  `CG ADD` an ordinary load sends.

## Impact

- **Affected specs:** `runtime-caspar-bridge` (ADDED: the browser retains stack intent and restores
  it on reconnect; ADDED: the restore adopts an occupied layer without clearing it).
- **Affected code:** `@cg/shared-schema` (`RetainedStackItem`), `@cg/shared-ipc` (`stack.restore`),
  `@cg/caspar-client` (`Reconciler.restoreItem`, `LayerManager.reserve`), `tools/caspar-bridge`
  (`CasparRuntime.restore` + the pending-restore decision at the healthy transition, route),
  `apps/runtime` (`StackRetentionStore`, `WebSocketRuntime` mirroring + resync step + offline
  projection, `useBridgeSnapshot`/`useStack` offline pull, boot wiring).
