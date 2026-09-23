# Design — `channel-authority` (`CHANNEL-AUTHORITY-01`)

## §1 — Every door that names a channel, found by walking the schemas

Two earlier sessions each named part of this list and neither was complete, so it was not merged
from them. Every request schema in `@cg/shared-ipc` was walked for a key named `channel` at any
depth: **83 request channels, 8 with one.** The walk is now a census test
(`station-channel-fence.integration.test.ts`, "the census"), so the list cannot drift silently.

| Route                     | Where the channel is             | Class         | Why                                                                                                                                                       |
| ------------------------- | -------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layers.clear`            | `req.channel`                    | **operating** | sends `CLEAR <ch>-<layer>`                                                                                                                                |
| `playoutLayers.clear`     | `req.channel`                    | **operating** | sends `CLEAR <ch>-<layer>`                                                                                                                                |
| `fixedLayers.clear-layer` | `req.channel`                    | **operating** | sends `CLEAR <ch>-<layer>`                                                                                                                                |
| `fixedLayers.load`        | `req.channel`                    | **operating** | binds the row a later take seats — list-only itself                                                                                                       |
| `fixedLayers.set-config`  | `req.channel`                    | declaration   | the bank's channel IS the declaration; fencing it by itself would make the first bank uninstallable, and a CHANGE is refused by `validateFixedBankChange` |
| `channelSettings.set`     | `req.channel`                    | configuration | **not** a declaration door: it cannot introduce a channel. Its store refuses an undeclared one with `unknown-channel`, on the same predicate              |
| `sources.set-config`      | `req.sources[].producer.channel` | configuration | a `route` source's channel is read FROM — never a write target                                                                                            |
| `stack.restore`           | `req.items[].slot.channel`       | operating     | fenced INSIDE the runtime per item, as a `not-declared` SKIP (`CHANNEL-RESOLUTION-01`)                                                                    |

⚠ **The prompt listed `channelSettings.set` as a declaration door; it is not one.** Naming a
channel there does not declare it — `ChannelSettingsStore.set` refuses a channel the station does
not declare. What WAS wrong there is that the store kept the LIST it was handed at boot, so a bank
installed live on a bank-less bridge moved every other door's answer and not this one's. It now
reads the predicate at call time.

And one door that names no channel: **`stack.load`** placed every dynamic row on
`DEFAULT_CHANNEL`. The shipped policy is empty, so a stock station never reaches it.

## §2 — The measurement, before any change (`B-261`)

Loopback; a fake CasparCG serving three channels; bank on channel 2; the principal granted
channels 1 and 2 of this host (the test Playout's `cg-op2` shape); "their" html graphic played on
both channels from a second AMCP client. Each operating door sent channel 1:

| Door                                    | auth OFF                        | auth ON          | Stopped by                           |
| --------------------------------------- | ------------------------------- | ---------------- | ------------------------------------ |
| `layers.clear`                          | **`CLEAR 1-20`**                | **`CLEAR 1-20`** | nothing                              |
| `playoutLayers.clear`                   | **`CLEAR 1-60`**                | **`CLEAR 1-60`** | nothing                              |
| `fixedLayers.clear-layer`               | nothing                         | nothing          | `isFixed` (`caspar-runtime.ts:9084`) |
| `fixedLayers.load` + take               | nothing                         | nothing          | `isFixed` (`caspar-runtime.ts:2148`) |
| `stack.load` + take (a declared policy) | `CLEAR 1-10` … `CG 1-10 PLAY 0` | —                | nothing                              |

(Line numbers at `709843ce`.) The permission gate passed both clears with auth ON, because the
grant was true — which is exactly why the grant cannot be what decides.

## §3 — Where the fence sits: parse → lock → auth → **station** → permission → handler

- **After the auth gate.** ADR 0010 rule 4 gives a socket that has not signed in
  `bridge.capabilities` and `auth.*` and nothing else. A fence answering first would tell an
  unauthenticated socket, one probe at a time, which channels this station drives. It follows that
  the fence also sits behind the lock gate: a locked console is told it is locked, and is told this
  on its next press.
- **Before the permission gate.** This is the broader fact. An operator granted channel 1 and
  refused because the station does not operate it must be told THAT — the permission gate would
  have passed them. And an operator not granted channel 1 must not be sent to ask for a grant that
  would change nothing.
- **Silent,** like the lock and the auth gate. A permission refusal is recorded because a dispute
  turns on WHO; this turns on nothing a principal did. (A row for it would need a new audit action
  to be told apart from a permission refusal — named as follow-up work, not done here.)

## §4 — The sentence

> This station does not operate channel N, so that command was refused — nothing was sent to
> CasparCG. Reload this console to see the channels it operates.

State, remedy, nothing sent (`R-006`); it names the channel (golden rule 11 ⭐). The remedy names
the case that produces it: the console never offers an undeclared channel, so a console that sends
one is working from an old picture of the station — the 2026-09-22 incident was a tab left open
against a different bridge. It is NOT `authzChannelRefusal`, whose remedy is a person granting
access; no grant makes a station operate a channel it does not declare.

## §5 — What the fence reads, and what it deliberately does not

It reads only the channel a request NAMES — `channelsForRequest`'s case (a), now spelled once as
`explicitChannel` and shared by both gates. It does not read:

- **an `itemId`'s channel** — the bridge's own ledger put that row there, through doors this fence
  guards; refusing an Out or a Clear on it would strand exactly the graphic an operator is taking
  off air;
- **`stack.restore`'s slots** — skipped per item in the runtime, so one foreign row does not cost a
  console the rest of its stack;
- **PANIC** — A16, unscoped, and not re-scoped here.

⚠ **Fenced by default.** `CHANNEL_DECLARING_ROUTES` is the exemption and the fence is everything
else, so a new route with a top-level `channel` that nobody classifies is REFUSED — the failure a
reader can see — rather than exempt.

## §6 — The surfaces that offered an undeclared channel

- **The orphan sweep** took candidates from every channel OSC reports — a server's whole output,
  the partner's programme channel and its preview channels included. It now reads
  `#isDeclaredChannel` first, beside the reserved-layer exclusion and not merged with it (that one
  is a layer NUMBER declared somebody else's on our channel; this is a whole channel never ours).
- **`playoutLayersState()`** reported its rows on `DEFAULT_CHANNEL`. It now reports them on every
  declared channel — with one bank, exactly one channel and the same row count.

On a channel-1 station neither surface moves.

## §7 — The allocator

`#allocate` places on `#declaredChannels()[0]`. The FIRST declared channel because a station
declares one (one bank, one channel, v1). A second declared channel makes "which channel does a
dynamic load mean" a question the load must answer — `R-062` gap 1 — and must not be settled by
picking one here.

## §8 — One predicate (golden rule 6)

`#isDeclaredChannel(channel)` = membership in `#declaredChannels()`. Before this change three
places answered "does this station operate channel N" and two held their own copy:

- the restore fence read `#fixedBank.channel` directly and let EVERYTHING through with no bank —
  `#declaredChannels()` answers channel 1 there (`FixedLayerBankSchema`'s documented default), so
  the bank-less case now refuses what every other door refuses;
- `ChannelSettingsStore` kept the list it was handed at boot.

Both now ask the predicate. The lock scope and `permittedChannels` already did.

## §9 — What the discovery call stands on (established before commit 1)

**The D9 bearer (`playout-auth.ts`).** The bridge has no credential of its own. `#bearer` is the
raw token of some live principal: `noteLiveToken` sets it on a successful `auth` frame and on every
gate check that finds a signed-in principal; `releaseBearer` drops it on sign-out and on socket
close; `noteVerifiedButRevoked` arms the tick WITHOUT adopting (the `PLAYOUT-AUTH-01` review's fix
for a revoked token becoming the process-wide bearer). ⚠ **What guards it is the moment of
ADOPTION, not the moment of USE**: a bearer adopted while good is kept after it expires, and after
its `jti` appears on the revocation list, until somebody else's token replaces it — and D9 is then
polled with it, answered `401`, and the failure swallowed. D4 must not inherit that, so the bearer
it reads is checked AT USE (commit 2).

**The strip (`features/channels/channelList.ts`).** `channelIds(bank, settings, auth)` is the union
of `channelSettings.settings[].channel` and the bank's channel (channel 1 if both are empty),
narrowed to `permittedChannels` when signed in, with the bank's own channel surviving the narrowing
read-only. Consumers: `useSelectedChannel` → `ChannelStrip` (header tablist), `ChannelScope`
(the tabpanel), `useCanOperate`, Station setup's per-channel tab; tests `channelList.test.ts`,
`channelIndependence.dom.test.ts`, `channelScope.dom.test.ts`, `viewerReadOnly.dom.test.ts`. The
label is `CHANNEL <n>`, with ` · READ ONLY` or ` · LOCKED` appended.

**D4 as recorded** (`handoff/2026-09-16/channels.json`): `{ channels: [{ id, name, casparHost,
casparChannel }] }` — on the test Playout, `apasai` = `192.168.21.111` channel 1 (their programme
output) and `cg-test2` = channel 2. No preview channels are published.

## §10 — The discovery call (commit 2)

**The catalogue cannot widen what the bridge writes to, and commit 1 is what guarantees it.** The
station fence reads `isDeclaredChannel` — the bank — and never this call's answer or the catalogue.
A future reader must not treat a LISTED channel as an OPERABLE one: `declared` is the only field of
the three that speaks about writing, and it is not derived from the catalogue.

**The contract (`@cg/shared-ipc` `stationChannels.ts`).** `channels.list` (a `read`, both axes) and
the `channels.changed` publish, one shape: `{ channels: [{ channel, named, declared, permitted?,
sources }] }`.

- `named` — `{ id, name }` from a D4 row whose `casparHost` is in `configuredCasparHosts` (the SAME
  host rule `grantsChannel` applies — a row naming another station's host joins nothing) and whose
  `casparChannel` is the channel; `null` otherwise.
- `declared` — `isDeclaredChannel`, the fence's own predicate.
- `permitted` — `grantsChannel` for a SIGNED-IN principal, `false` for a session that has stopped
  holding, ABSENT with auth OFF.
- `sources` — `catalogue` / `bank` / `channel-settings`, in that order; the list is in source order.

**One composition** (`stationChannelsFor`, beside `authStateFor`, for its reason): the read and the
push call it; nothing re-derives it.

**D4 (`playout-catalogue.ts`).** Built only with auth ON. Read at most every 30 s (a fixed floor —
only the tick period is injectable), with `If-None-Match`; a `304` keeps what is held. On any
failure — no bearer, no answer, a non-OK status, an unparseable body — the catalogue is ABSENT
(`null`), not the last good answer: a stale label is a label the Playout no longer says, and the
strip's `CHANNEL <n>` is always true. Never awaited by the gate, never an alarm.

**The bearer.** §9's finding, answered: D4 reads `PlayoutAuth.usableBearer()`, which returns the held
token only while it is neither past `exp` (with the contract's 60 s tolerance) nor on the revocation
list as last seen — checked at USE. Release on sign-out and on socket close is the existing
mechanism. D9's own polling is deliberately unchanged (its cadence rules are pinned by the
revocation suite); the residual that D9 presents a lapsed bearer until another replaces it is
recorded, not fixed here.

**The push.** Per socket (`permitted` is per principal), deduplicated, and only once delivered —
the publish gate withholds everything from a socket that has not signed in, and recording an
undelivered answer would suppress the push its sign-in needs. Inputs: the catalogue, the bank,
channel settings, the server list, and that socket's own sign-in (the console's sign-in resync
re-pulls the stack, health and lock only). The dedupe is SEEDED with the socket's current answer
when it can already be delivered to — auth OFF — so an auth-OFF console is pushed nothing unless its
answer moves (it cannot, short of a bank installed live on a bank-less bridge); its one new frame is
its own `channels.list` read on connect. The first spelling pushed one unchanged copy after every
connect, on the mode read's settings publish, and a test now pins its absence beside the settings
publish that proves the capture live. ⚠ With auth ON the seed stays EMPTY and the sign-in push
always goes: a viewer's answer is identical signed out and signed in, and its pre-sign-in pull was
refused, so that push is the only copy it gets (pinned, and mutation-checked against an
unconditional seed).

**The console.** `channelIds` reads the answer's `declared` channels first once it has ARRIVED, with
the bank and settings as the fallback (and an answer declaring nothing is read as "fall back" — a
bridge always declares one). `channelNames` names declared channels only. The strip labels a named
channel with the name in its own `<bdi>` (golden rule 11), the chrome suffix outside it, and the
channel number on the tab's `title`; `TabSpec.label` takes markup for exactly that.

**Preview channels.** Nothing derives or iterates a channel index: the mode read and the output check
walk `#declaredChannels()`, and the discovery list is read by the strip alone. Pinned at the wire
with a four-channel server: channels 1, 3 and 4 receive nothing while `INFO 2` does.

**Auth OFF, stated plainly.** No catalogue, no `permitted`, the strip's labels unchanged. One
difference is reachable in principle: a channel present ONLY in a stale channel-settings entry — one
the bank does not declare, which commit 1 already refuses every verb on — is no longer a tab. The
settings store seeds and accepts declared channels only, so the entry exists only if the bank's
channel was moved between boots.
