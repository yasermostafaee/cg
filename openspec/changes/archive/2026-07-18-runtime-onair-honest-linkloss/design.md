# Design — honest ON AIR across link-loss (B-086)

## The status: a new `'unverified'`, not the latent `'disconnected'`

`StackItemStatus` already defines a latent `'disconnected'` (renders "⚠ OFFLINE", nothing produces
it). I add a dedicated **`'unverified'`** instead of repurposing it:

- `'disconnected'`'s "OFFLINE" label/tone reads as "this item is off" — misleading for "was on air,
  can't confirm". A precise name is worth one enum value in broadcast-safety code people read
  carefully.
- Do NOT reuse amber `'unconfirmed'` — that is B-044's **item-scoped ack-timeout** ("this one
  command's ack didn't arrive"), a different condition from "the whole link is down".

`theme.ts`: `badgeTone('unverified') → 'idle'` (the `--r-text-muted` grey — exactly the
health-UNKNOWN tone); `airStateVisual('unverified') → { color: colors.textMuted, icon: '◌', label:
'WAS ON AIR' }`. `isOnAir()` (`status !== 'idle' && !== 'loaded'`) treats it as on-air-ish, which is
harmless while the link is down (row Clear + bulk actions are already `linkDown`-disabled) and
correct once it resolves.

## Where each half lives

| Concern                            | Where                                                             | Why                                                               |
| ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Link-loss → `unverified` (display) | Reconciler `reconcileStatus` + `setLinkDown`                      | the Reconciler owns status; it can re-emit on the transition      |
| Reset-to-idle (producer gone)      | Reconciler `reconcileOnReconnect(occupiedKeys)` fed by the bridge | only the bridge sees the occupancy tap                            |
| The trigger                        | bridge `session.on('state-change')` (current primary)             | the same session-state signal the health pill + `#linkDown()` use |

## Reconciler changes (`packages/caspar-client/src/reconciler/reconciler.ts`)

- `private linkDown = false;`
- `reconcileStatus`: compute the existing ladder value `base`, then
  `if (this.linkDown && (base === 'on-air' || base === 'playing')) return 'unverified';`.
  The flag gates it, so a fresh take (played, no OSC yet, link healthy) still shows `playing`, not
  `unverified` — only a DOWN link makes an on-air claim unverifiable. `base ∈ {on-air, playing}`
  already implies `played`, so no extra guard is needed.
- `setLinkDown(down)`: no-op if unchanged; else flip the flag and `emitChange` only items whose
  reconciled status actually changed (compute before/after). This is the missing re-publish.
- `reconcileOnReconnect(occupiedKeys: ReadonlySet<string>)`: for each `played` item whose
  `slotKey(slot)` is NOT in `occupiedKeys`, reset to idle (`played=false`, `intentStatus='idle'`,
  `lastProducer='empty'`, fresh `lastOscAt`, clear `ackedStatus`/`settle`) and `emitChange`.
  Occupied items are left to `freshTruth` (resumed OSC → `on-air`). Idempotent (a reset item is no
  longer `played`).

`unverified` is a resting state: `isTerminalStatus` need not change (an unverified item's
`intentStatus` is still `playing`, confirmed by `ackedStatus`, so `pending=false` — no spinner). The
badge tone ignores `pending`, so it renders muted regardless.

## Bridge wiring (`tools/caspar-bridge/src/caspar-runtime.ts` `#wireAdapter`)

Add, inside the per-session loop, gated on the current primary (whose OSC feeds the Reconciler):

```
session.on('state-change', ({ from, to }) => {
  if (this.#sessions[label] !== session) return;          // torn-down era
  if (this.#adapter.currentPrimary !== label) return;      // only the primary drives it
  if (to === 'healthy') {
    this.#reconciler.setLinkDown(false);
    const keys = new Set(session.osc.occupancy
      .occupied(this.#occupancyStaleMs)
      .map((o) => `${o.channel}:${o.layer}`));
    this.#reconciler.reconcileOnReconnect(keys);
  } else if (from === 'healthy') {
    this.#reconciler.setLinkDown(true);
  }
});
```

Timing that makes it correct:

- `to === 'healthy'` fires AFTER the `RESYNCING` OSC drain (`RESYNC_MS = 150 ms`) in the session
  loop AND on a `degraded → healthy` OSC recovery — both paths have occupancy populated (occupied
  layers re-announce every ~20 ms; empty layers have no entry). So the occupancy check is reliable
  at that instant; no separate timer needed.
- `setLinkDown(false)` then `reconcileOnReconnect` run synchronously; each `emitChange` calls
  `#markDirty`, which **coalesces** (`COALESCE_MS = 20 ms`) and flushes `#published()` — the
  CURRENT reconciler snapshot. So the intermediate `playing` (empty item, flag just cleared, before
  the reset) is never published: the single coalesced flush reads the final state
  (occupied → on-air, empty → idle). No red flicker.
- `from === 'healthy'` fires at `healthy → degraded` (~3 s OSC silence) or `healthy → disconnected`
  (immediate AMCP close). By `degraded`, `freshTruth` has already decayed (`truthTtlMs = 1000 ms`),
  so items are at the `playing` floor and flip straight to `unverified`. The ≤3 s detection latency
  is the session's existing threshold (unchanged, not this fix's to move).

## Frozen / edges

- `#linkDown()` and the take/update/out refusal are untouched.
- An in-flight take (not yet acked) when the link drops: briefly `unverified`, then B-044 expiry →
  `unconfirmed` (amber). Both honest; an edge, left to the existing B-044 path.
- Failover: the display follows the current primary's health; the single-server case is exact.
