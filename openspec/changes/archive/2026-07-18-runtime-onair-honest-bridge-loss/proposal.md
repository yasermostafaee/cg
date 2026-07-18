# Honest ON AIR across a BRIDGE-process death (B-087)

## Why

[[B-086]] made the stack's ON AIR badge honest when the **CasparCG** link drops (the bridge↔CasparCG
AMCP link): an on-air item is re-published as the muted `unverified` "WAS ON AIR". But when the
**BRIDGE** process itself dies — the SPA↔bridge WebSocket — the row stays frozen on a confident red
**● ON AIR** for the whole outage. Operator testing confirmed it: killing CasparCG flips the badge to
"WAS ON AIR" (B-086 works); stopping the bridge leaves it red. It is a broadcast-safety lie — the
same species B-086 and B-081 killed, one link out — and _more_ unverifiable than the CasparCG case,
because the bridge is the SPA's only conduit to the wire, so on bridge death the SPA cannot reach
CasparCG at all.

Root cause (recon, verified against source):

1. B-086's `unverified` demotion is a **bridge-side** product: the reconciler re-publishes it and it
   reaches the SPA over `StackStateChanged`. A **dead** bridge cannot send that frame, so the demotion
   never arrives on bridge death.
2. The renderer **freezes** the last snapshot. `useBridgeSnapshot`
   (`apps/runtime/src/renderer/hooks/useBridgeSnapshot.ts:53`) early-returns when
   `link === 'disconnected'` — without clearing or demoting `value` — so `useStack()` keeps every row
   at its last `status` (incl. `on-air`), and `StackRow` renders the sacred-red **● ON AIR** at full
   confidence (`StackRow.tsx:115` passes the raw frozen `item.status` to the badge).
3. Every OTHER air-claim surface already goes honest on bridge death via a direct `useLink()` display
   override over the frozen snapshot data — the per-server health pills (`StatusBar.tsx`'s `stale`
   override → "UNKNOWN"), the `LinkIndicator` ("DISCONNECTED — reconnecting…"), the `ConnectionBanner`
   ("NOT CONNECTED — NOTHING CAN REACH AIR"). The stack row status badge is the **only** air-claim
   surface with no such override.

## What Changes

A **renderer-only** display mask that closes that inconsistency, reusing B-086's existing `unverified`
status verbatim — no bridge change, no schema/enum change.

- **`StackRow` masks the on-air claim while the SPA↔bridge link is down.** It already reads
  `useLink()` (`linkDown = link === 'disconnected'`) and already computes the on-air predicate
  `onAir = status === 'on-air' || status === 'playing'` — the exact predicate B-086's reconciler
  override demotes on. When `linkDown && onAir`, the row feeds the badge an effective `unverified`
  status instead of the raw frozen `item.status`; the already-defined theme mapping (`theme.ts`)
  renders it muted grey `◌ "WAS ON AIR"` (`badgeTone → 'idle'`, `airStateVisual → WAS ON AIR`).
- **Purely a display mask over frozen data.** It makes NO restore-vs-reset decision — the underlying
  `#lastStack`/snapshot is untouched. On reconnect (`link → 'live'`), `useBridgeSnapshot` re-pulls a
  fresh snapshot and the authoritative status replaces the mask automatically; a non-on-air row
  (`loaded`/`idle`) is never masked.
- **Link-aware tooltip.** The `unverified` badge tooltip (`StatusBadge.tsx`) is currently worded for
  the CasparCG-death case ("before the CasparCG link dropped"). Now that both CasparCG-death (B-086)
  and bridge-death (B-087) render `unverified`, the tooltip is made link-aware so it reads accurately
  for both — the SPA↔bridge case names the bridge connection, the CasparCG case names the CasparCG
  link. The visible label and icon (`◌ WAS ON AIR`) are unchanged, so the Playwright badge-word hooks
  stay stable.

## Frozen — safety and scope unchanged

- **No bridge change, no schema/enum change.** `unverified` already exists (B-086). B-086's
  bridge-side reconciler path is untouched.
- **On-air REFUSAL unchanged (R-006).** This changes only the DISPLAY of a frozen on-air row while the
  link is down; `take`/`update`/`out` are already refused with the bridge down and stay refused.
- **[[B-085]]'s browser-local library is untouched.**
- **Not a contradiction of B-086's "a renderer-only mute is wrong" note.** That note is scoped to
  **CasparCG** death, where the bridge is ALIVE and only its occupancy tap can decide restore-vs-reset
  on reconnect (a dumb renderer mute could lift back to red). On **bridge** death there is no live
  bridge or tap — a renderer overlay is the only possible actor, and it never makes that decision
  (reconnect re-pulls authoritative truth). The two fixes trigger on disjoint conditions
  (`useLink()==='disconnected'` vs a live bridge's CasparCG session leaving `healthy`).

## Out of scope

- **Stack survival across a bridge RESTART** (the recovery half of the bridge-death story — retaining
  stack intent browser-side and an occupancy-aware restore-on-reconnect) is a distinct, larger,
  broadcast-safety-critical change tracked separately. This change is the DISPLAY half only.

## Impact

- **Affected specs:** `runtime-ui` (ADDED: ON AIR display is honest when the SPA↔bridge link is down).
- **Affected code:** `apps/runtime` only — `renderer/features/stack/StackRow.tsx` (effective badge
  status while `linkDown`) and `renderer/ui/StatusBadge.tsx` (link-aware `unverified` tooltip). No
  package, bridge, or schema change.
