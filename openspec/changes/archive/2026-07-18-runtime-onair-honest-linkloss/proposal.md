# Honest ON AIR across a CasparCG link-loss (B-086)

## Why

When the CasparCG connection drops — CasparCG died, or the link briefly dropped, **indistinguishable
from the bridge side** (confirmed by testing) — on-air stack items keep rendering the confident red
**● ON AIR** badge indefinitely. The UI asserts a state the wire can no longer verify: a
broadcast-safety lie, the same species B-081 killed for the health pills, one surface over.

Root cause (recon, verified against source):

1. The Reconciler merge ladder (`reconciler.ts` `reconcileStatus`) is
   `freshTruth → ackedStatus → intentStatus`. Its fallback floor `'playing'` renders **identically**
   to `'on-air'` (both red "● ON AIR", `theme.ts`), so when `freshTruth` decays off stale OSC the
   badge does not visibly change.
2. The Reconciler is **event-driven** — `emitChange` fires only from `applyOsc`/`applyIntent`/
   `applyAck`. When OSC goes silent nothing re-publishes, so the **last on-air freezes on screen**,
   and nothing wires session-state → the Reconciler.

## What Changes

The owner locked the direction — mirror B-081's HEALTHY→UNKNOWN idiom. This is a **bridge/reconciler-side**
fix (a renderer-only mute is wrong: on reconnect the bridge still holds a frozen `'playing'`, and if the
layer is now empty the mute would lift back to red ON AIR — the reset-to-idle half is only knowable at the
bridge, where the occupancy tap lives).

- **New `'unverified'` `StackItemStatus`.** Label **"WAS ON AIR"**, tone **muted grey** (`colors.textMuted`
  — the health-UNKNOWN tone, NEVER red, NEVER amber). Last-known "ON AIR" stays in the tooltip.
- **On link-loss** (a CURRENT-PRIMARY session leaving `'healthy'` — AMCP TCP close or OSC silence
  healthy→degraded): the Reconciler re-publishes every item whose reconciled status is on-air/playing as
  `'unverified'`. This supplies the re-publish the event-driven Reconciler otherwise never emits, driven by
  the same session-state signal `#linkDown()` gates on.
- **On reconnect** (into `'healthy'`, after the RESYNCING OSC drain): reconcile against actual OSC.
  - _Restore_ is automatic — a still-occupied layer re-announces its producer within ~1 OSC tick, so
    `freshTruth` re-derives `'on-air'` on its own once the link-down flag is cleared.
  - _Reset_ is added — a one-shot occupancy check: for each still-on-air/played item whose slot is NOT in
    `session.osc.occupancy.occupied(OCCUPANCY_STALE_MS)`, demote to `'idle'` (the producer is gone, e.g.
    CasparCG restarted). Real CasparCG never reports `empty` — it goes silent — so this is a
    silence-inference, mirroring the sweep's "absence of knowledge is not knowledge of absence".
- **Display:** `theme.ts` maps `'unverified'` → muted-grey badge tone + "WAS ON AIR" label; `isOnAir()`
  semantics are unchanged (it stays clearable-once-reconnected).

## Frozen — on-air safety unchanged

- `#linkDown()`'s on-air **REFUSAL** is untouched: `take`/`update`/`out` stay refused while the link is
  down (R-006). This change makes the **display + reconcile-truth** honest; it does not change what any
  command does.
- No change to B-085's browser-local library, the SPA↔bridge transport, or the AMCP verb sequence.
- Death-vs-blip is deliberately **not** guessed (undetectable): the item stays `'unverified'` until OSC
  resolves it on reconnect. The ~150 ms reset latency is inherent and accepted.

## Out of scope

- **B-030** (auto-out-stuck-on-air) is a DISTINCT bug: there the link is UP, OSC is still flowing, and the
  producer is genuinely present (a self-hiding outro the wire can't see) — a template-runtime
  completion-signal problem, not a link-loss transition. This fix does not address it.
- Failover across two servers is handled approximately (the display follows the current primary's health);
  the single-server case (the owner's scenario) is exact.

## Impact

- **Affected specs:** `runtime-caspar-bridge` (ADDED: honest ON AIR across link-loss).
- **Affected code:** `@cg/shared-schema` (`item-state.ts` — `'unverified'`), `@cg/caspar-client`
  (`reconciler.ts` — link-down flag, `setLinkDown`, `reconcileStatus` override, `reconcileOnReconnect`),
  `@cg/caspar-bridge` (`caspar-runtime.ts` — session-state-change → reconciler wiring),
  `apps/runtime` (`theme.ts` — badge tone + label).
