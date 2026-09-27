# route-plates — design

`ROUTE-PLATES-01` (v3). Anchors are `tools/caspar-bridge/src/caspar-runtime.ts` (`RT`) unless named, at
the commit that carries this change.

## §0 — what was established first (nothing fixed in this section)

**§0.1 — every `MIXER … VOLUME` to a plate-band layer.** Eight plate sites (nine call sites), inside the
predicted 5–9: P1 the seat step's hide (`#seatPlates`, RT:8055); P2 `#restoreInPlaceMutes` (RT:8147); P3
the unhold of a plate leaving HELD and P4 the reveal (both in `#applyLivePlatesUnguarded`, RT:8383); P5 the
switch rollback's re-mute (RT:8925, and a held route's re-hide at RT:8933); P6 the release policy's hold mute (RT:9249); P7 `setLivePlateVolume`
(RT:9663) with PANIC's `#silenceLedger` (RT:9930); P8 the reconnect re-send (`#resendLiveMixerState`,
RT:7942). Not plate sites: the take's `VOLUME 1` to the PAGE layer, the two rehearse lines, the connect
sweep (`#reassertDeclaredVolumes`, RT:4797 — declared bank rows only, never the plate band) and
`#sendAdd`'s mute (RT:13826). Transports that carry them: the mirror fan-out, the journal replay and the
corrective resend (`redundancy-adapter.ts`). ⚠ The prompt cites "`PLAYOUT-SOURCES-01` v4 §1.I listed
these"; the archived change has no numbered §1.I site list — the anchors above are the real ones. A plate's
volume when first seated is 0, committed before its `PLAY` (`live-add-mute`).

**§0.2 — the seating order today** (`take-all-or-nothing.integration.test.ts:328-347` pins it): page
`VOLUME 0`, `CG ADD`, page `VOLUME 1`, every new plate's hide as `DEFER`, `MIXER <ch> COMMIT`, the plates'
`PLAY`s, their reveal as `DEFER`, one `COMMIT`, `CG PLAY`. A look switch seats its new plates in the
PRE-SEAT step (`#preSeatSwitch`, RT:8319) before the page is told, holds them three frames, then tells the
page and reveals. **Where the pair fits:** a route's `LOADBG` → `PLAY` replaces the plate's `PLAY` inside
`#startSeatProducer` — after the hide's `COMMIT` has been acknowledged and before any reveal — so nothing the
hard stops protect moves. The reveal waits until 80 ms after the last route `PLAY` (two ticks at 25 fps).

**§0.3 — batching.** Nothing in the bridge sends `BEGIN`; the only same-frame mechanism in use is
`MIXER … DEFER` + `MIXER <ch> COMMIT`, which is what their answer §3.2 says is same-frame.

**§0.4 — the restore paths.** An AMCP reconnect to the same core re-sends mixer state only (P8), never a
`PLAY`. A core restart (a new process) comes back with empty layers: `B-227` drops the ledger's seats on the
reconnect's occupancy sample and `B-225` raises the emptied-air notice, whose PUT BACK ON AIR is an ordinary
take (`restoreEmptiedAir`, RT:10515). A bridge restart adopts `bridge-live-layers.json` (`B-145`) and sends
nothing until an operator acts.

**§0.5 — backup mirroring.** Under `mirror-sync` (the default) every line the primary gets, server B gets
too; `journal-replay` and `mirror-async` journal lines and replay them to B at a failover. `SendOptions.target`
is documented as an override and read by nothing — filed as `B-287`, not fixed here.

**§0.6 — global commands and undeclared targets.** No `CLEAR` without a layer, `CLEAR ALL` or `CHANNEL_GRID`
exists. Two paths can address a channel this station does not declare: `takeStrayOffAir` (RT:3412), BY
DESIGN — the operator's removal of our own recorded stray, never in 1–49 — and the reconnect re-send of a
ledger record on a channel since undeclared. 🔴 **So §1.E's removal part STOPS**, as the prompt says: nothing
is removed, and the guard is still built. The stray door is kept by one explicit, narrow exemption at the
seam (that coordinate only); the re-send line on an undeclared channel is now refused, which is the guard's
purpose. Both go to the owner as decisions.

**§0.7 — a held plate today** is `VOLUME 0` plus a parked fit at `OPACITY 1` (§12.4's hold); no `PAUSE` and no
`BLEND` anywhere. The one gap for routes was the reconnect re-send forcing `OPACITY 1`. For a route the answer
is fixed by the prompt: kept playing, hidden by `OPACITY 0`, never `PAUSE`, `BLEND` normal.

**§0.8 — the forbidden commands.** `CLEAR <ch>`, `MIXER <ch> CLEAR`, `SWAP`, `SET MODE` and consumer
`REMOVE`: none. A consumer `ADD` exists — `C-029`'s `--create-missing-consumers` (`#createMissingConsumer`,
RT:13204), off by default. A `CLEAR <ch>-<L>` below 50 is reachable through `playoutClear` (RT:10924, a
reserved layer), `clearLayer` (RT:11149, a foreign html layer on a declared channel), a stale ledger, or a
restore. `MIXER <ch>-<L> CLEAR` is sent only after a `CLEAR` that landed on the primary. The guard now refuses
the consumer `ADD` and every `CLEAR` outside our own layers; each is reported to the owner.

## Decisions

1. **The seat step is the only place a route starts** (`#startRouteProducer`, RT:8233, called from
   `#startSeatProducer`). One `LOADBG` retry when the 200 ms window is missed; missed twice, the seat is
   refused like a refused `PLAY` (`route-window-missed`).
2. **`loaded` — a fourth refusal outcome** (`refusal-cleanup.ts`). A route whose `LOADBG` landed and whose
   `PLAY` did not left the FOREGROUND as it was and OUR producer in the BACKGROUND. `mayClearAfterRefusal`
   treats it like `unknown` (a `CLEAR` on a layer that held nothing of ours drops what we loaded), and
   `foregroundUnchanged` like `refused` (the ledger keeps the producer it named; a muted working producer gets
   its volume back). Without it a fresh take would leave our route loaded, and an in-place swap would write
   the route into the ledger while the old stream still played.
3. **The epoch is confirmed per AMCP connection** (`#routeEpochIsCurrent`, RT:12658): the catalogue's epoch,
   confirmed by a D10 read on the primary's current connection, and only while server A is the primary.
   A take, a switch or a swap that seats a route confirms it first (`#ensureRouteEpoch`, RT:12686) and
   re-plans when the read moved it; a reconnect re-reads it (`#routeEpochAfterReconnect`, RT:12760). A route
   plate whose epoch is not the confirmed one keeps its layer and nothing is sent for it; its row carries the
   waiting line until a take seats it from the fresh D10 (`B-227`'s drop and PUT BACK ON AIR cover a restart
   that emptied the core).
4. **One guard at the seam** (`amcp-guard.ts`, asked by `#send`, RT:13630): pure, line by line, beside the
   send seam's epoch check. It is a guard, not a new fence: the station fence still refuses requests. Its
   `CLEAR` rule reads "our own layers" as 50–99 OR a layer the station's own CONFIG declares
   (`#isOwnConfiguredLayer`, RT:12854): on every station that can boot the two are the same set (a bank or bed
   row below its band is refused at boot, and the plate band must lie above the beds), so a real station gets
   the contract word for word, while a configuration built past the boot — the suite's legacy fixtures —
   keeps today's wire. The route-layer rule is asked of PLAYOUT route lines only: a hand-made `route://N`
   names a programme channel and keeps its wire (the hard stop).
5. **C4 at the seam, not at the adapter's `target`.** `SendOptions.mirror: false` (read, and tested under all
   three strategies) sends to the primary and journals nothing, so neither a failover replay nor a corrective
   resend can carry a route to B. The primary-is-A condition keeps it off a promoted backup too.
6. **The backup line is a published fact** (`StackItemState.backupUnmirrored`, `#backupUnmirrored`,
   RT:10165), republished whenever the ledger changes the answer; never retained.
7. **The mock answers a bare `PLAY` as the core does.** Measured on the owner's CasparCG 2.5.0 (69e8ad5
   Stable): `LOADBG 1-91 "route://1-90"` → `202`, the bare `PLAY 1-91` → `202` with a `route` producer in the
   foreground, and a bare `PLAY` with nothing loaded → `202` with the layer unchanged. The mock had refused
   the last with `402`; it now acks it. That the bridge never sends a bare `PLAY` without its `LOADBG` is
   pinned on the bridge's wire.
