# An occupancy tap that has never heard OSC must not vouch for emptiness (B-093)

## Why

Found by [[B-092]]'s own hardware probe (#353), captured on the wire against a real
CasparCG 2.3.2.

`OscOccupancyTap` is populated only by OSC. If OSC never arrives — a misconfigured
`casparcg.config`, OSC pointed at the wrong port, a firewall — the entry map stays empty and
`occupied()` returns `[]`. A genuinely **LIVE** layer therefore reads as unoccupied, and
B-092's restore takes the re-ADD branch:

```
CG <ch>-<layer> ADD 0 "<template>" 0 "{}"
```

Play-on-load is `0`, so a **playing** producer is replaced by a **non-playing** one. The
graphic goes **OFF AIR** — silently, with no error and no operator-visible signal.

B-092's literal invariant survived: no CLEAR is ever sent. But "no CLEAR" was never the
property worth protecting on its own — **keeping the graphic on air** was, and that was lost.
This is the more dangerous shape of failure, because the design still looked intact: the safe
path degraded into the unsafe one with nothing to show for it.

**Root cause.** Silence has two meanings that demand OPPOSITE actions — "this layer is empty"
and "I have never heard from the server at all" — and the tap could not tell them apart.
Silence from a tap that has never received a packet is not evidence of emptiness; it is
evidence of no evidence.

## What Changes

- **The tap learns whether it has ever heard OSC this session** (`hasReceivedOsc`), reset with
  `reset()` on resync so a reconnect can never inherit a stale `true` and vouch for a server it
  has not heard from yet.
- **Driven by OSC TRAFFIC, not producer events** — and this is load-bearing, not an
  implementation detail. Real CasparCG emits per-layer producer messages only for layers that
  HAVE a producer: a healthy server whose layers are all empty sends only channel-level
  messages (verified on 2.3.2 — only `/channel/N/framerate` and `/channel/N/mixer/…`). Keying
  the flag on producer events would make healthy-but-idle indistinguishable from blind, and
  would break the legitimate "both restarted, the layers really are empty" re-ADD path —
  turning a restore fix into a restore regression.
- **The restore decision gains a third branch.** Heard + occupied → adopt (unchanged). Heard +
  silent → re-ADD as loaded (unchanged). **Never heard → REFUSE TO DECIDE**: send nothing at
  all, keep the row visible, and publish it as `unverified`.
- **The same bug is fixed in a sibling path.** `reconcileOnReconnect` ([[B-086]]'s reconnect
  reconcile) also reads silence as proof the producer is gone, and on a blind tap would reset a
  genuinely live item to `idle` — on a link that is UP. It is now skipped while the tap is
  blind. This STRENGTHENS B-086: it prevents a false `idle`, and B-086's own `unverified`
  demotion from the drop still stands.
- **The refusal recovers.** Refused items stay pending and the periodic sweep decides them for
  real once OSC starts arriving, so a tap that comes up a moment after the healthy transition
  cannot strand a row as `unverified` for the life of the process.
- **The undecided row says the right thing.** It reuses `unverified` — the status already means
  "was on air, cannot confirm", and reusing it inherits every safety predicate keyed on the
  enum (`isOnAir`, the on-air counts, the `setPosition` refusal, the badge tone) instead of
  opening a new hole in each. But it does NOT reuse B-086/B-087's wording, which is wrong here
  in two ways that both push toward the unsafe reading: **tense** — "WAS ON AIR" says the
  graphic is gone, when the link is up and it is almost certainly still on air, untouched; and
  **remedy** — "reconnect to re-verify" fixes nothing and sends someone to restart a playout
  box that is working, which would take air down. The blind-tap row reads `◌ ON AIR?` and its
  tooltip names OSC and the real fix. Same status, same muted tone, different words.
- **One diagnostic line** on the bridge's stderr at the refusal, naming what was not done and
  why. An install in this state looks healthy on AMCP, so the cause is not otherwise
  discoverable.

## Deliberately NOT done — needs an owner decision

A **`⚠ NO OSC` pill** in the StatusBar. Today a blind install renders a confident green
"PRIMARY A HEALTHY" while the occupancy subsystem is blind, because HEALTHY is a pure-AMCP
claim wearing a whole-system word. The session does degrade on OSC silence, so the operator is
not _unwarned_ — but they are **mis-warned**: DEGRADED/OFFLINE reads as "CasparCG is down" when
the truth is "CasparCG is fine, I cannot hear it", and those demand opposite remedies. The IPC
slot already exists and is unused by the real bridge (`ServerHealthSchema.oscFreshAt`), so this
is ~25 lines across 3 files plus tests, with no schema or channel change. Not built here.

## Frozen

On-air refusal (R-006), [[B-085]]'s browser-local library, [[B-086]]/[[B-087]]'s `unverified`
badge, and B-092's occupied-branch behaviour when OSC IS flowing (hardware-confirmed correct:
nothing sent, live producer untouched) are all unchanged.

## Impact

- **Affected specs:** `runtime-caspar-bridge` (occupancy evidence + the refusal), `runtime-ui`
  (the blind-tap wording).
- **Affected code:** `@cg/caspar-client` (`occupancy-tap`, `transport`, `reconciler`),
  `tools/caspar-bridge` (`caspar-runtime`), `apps/runtime` (`StatusBadge`, `StackRow`).
