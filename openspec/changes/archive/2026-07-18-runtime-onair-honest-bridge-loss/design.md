# Design — honest ON AIR across a bridge-process death (B-087)

## Why renderer-side here, when B-086 was bridge-side

B-086 put the `unverified` demotion in the **bridge reconciler** on purpose: on CasparCG death the
bridge is ALIVE, and only it holds the OSC occupancy tap that decides, on reconnect, whether a
still-unverifiable item restores to ON AIR (layer still occupied) or resets to IDLE (producer gone).
A renderer-only mute there would be wrong — it could lift back to red against a frozen `playing`.

On **bridge** death that reasoning inverts:

- The bridge is **dead**. There is no reconciler running to publish `unverified` and no occupancy tap
  to consult. Nothing bridge-side _can_ act (`WebSocketRuntime.#onDown` only flips `#status` and
  rejects in-flight commands; it emits no stack frame).
- The renderer overlay never makes the restore-vs-reset decision B-086 reserved for the bridge. It is
  a pure **while-disconnected display mask** over frozen state. On reconnect, `link → 'live'` re-runs
  `useBridgeSnapshot`'s pull and a fresh authoritative snapshot replaces the mask — there is no frozen
  bridge-side `playing` to lift back to red against.

So the two are orthogonal and complementary, triggered by disjoint conditions
(`useLink()==='disconnected'` vs a live bridge's CasparCG session leaving `healthy`), and never fight.

## Where the mask lives

`StackRow.tsx` already owns everything the mask needs:

- `useLink()` → `linkDown = link === 'disconnected'` (already read for button gating).
- `onAir = item.status === 'on-air' || item.status === 'playing'` — the SAME predicate B-086's
  reconciler override demotes on (`reconcileStatus`: `linkDown && (base === 'on-air' || base ===
'playing') → 'unverified'`). Reusing it keeps the two surfaces in exact parity.
- The single badge render site passes `status`/`pending`/`simulated` to `StatusBadge`.

The mask is one derived value: `const badgeStatus = linkDown && onAir ? 'unverified' : item.status;`
passed as `status={badgeStatus}`. Nothing else changes — `item.status`, `item.pending`, the button
`disabled`/`title` gating, and the `simulated` (offline-mock → "SIM") path are all untouched.

`pending` note: for a `playing` row we still pass the row's `item.pending` to the badge, but with
`status='unverified'` the theme renders muted "WAS ON AIR" regardless of `pending` (`badgeTone`/
`airStateVisual` ignore `pending` for `unverified`). A pending `playing` (amber TAKING) is not a
confident-red lie, but B-086's predicate demotes on-air/`playing` uniformly, so masking it too keeps
strict parity and is still honest (muted, never red).

## The link-aware tooltip

`StatusBadge` is a pure presentational component and is used at exactly one site (`StackRow.tsx`), so
it can be extended safely. It cannot tell _which_ link dropped from `status` alone — that is a fact
`StackRow` holds (`linkDown`). Add an optional `bridgeDown?: boolean` prop; `StackRow` sets it from
its existing `linkDown`. Then, when `status === 'unverified'`:

- `bridgeDown` → wording that names the **bridge** connection (SPA↔bridge WS down; CasparCG may be
  fine but is unreachable through the dead bridge).
- otherwise → the existing wording that names the **CasparCG** link (B-086: bridge alive, CasparCG
  link dropped).

Edge: an item already `unverified` from a prior CasparCG-death whose bridge then dies freezes at
`unverified` with `bridgeDown=true` → it shows the bridge wording. That is correct: the most recent,
actionable fact is that the bridge is down (reconnect the bridge to re-verify).

The visible label/icon (`◌ WAS ON AIR`) and `aria-label` (`status WAS ON AIR`) are unchanged, so the
Playwright badge-word hooks stay stable; only the `title` attribute changes.

## Frozen / edges

- No bridge change, no schema/enum change (`unverified` already exists), no change to R-006 refusal or
  B-085's library, no change to B-086's reconciler path.
- Reconnect correctness is inherited from `useBridgeSnapshot`: the pull effect re-runs on the
  `disconnected → live` transition and overwrites `value` with the authoritative snapshot, dropping
  the mask. No mask-specific teardown is needed.
