# The station decides what it writes to

## Why

Three facts about a channel have been living in three places, and only one of them should ever
decide where the bridge writes:

| Fact                                  | Who says it                               | What it decides                              |
| ------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| the channel **exists** and has a name | the Playout's catalogue (D4)              | labels, and the join key                     |
| a principal **may operate** it        | the grant (`cg_channels`, `C-038`)        | authorisation                                |
| **this station operates** it          | the declared bank (`#declaredChannels()`) | **what we write to — and nothing else does** |

On 2026-09-22 a bridge configured for channel 2 seated six producers onto channel 1 — a partner
Playout's live programme output — through `stack.restore`. `CHANNEL-RESOLUTION-01` fenced that one
door. Nothing fenced the others, and this change measured them before touching anything
(`B-261`): on a bank declaring channel 2, with a principal granted channels 1 AND 2 — the test
Playout's real `cg-op2` shape — `layers.clear` put `CLEAR 1-20` on the wire and
`playoutLayers.clear` put `CLEAR 1-60`, **with auth ON and with auth OFF**. The permission gate
passed both, because the grant was true. And the console OFFERED both: the orphan strip listed
every html layer OSC reported on any channel, and the playout tab reported its rows on the constant
channel 1. A third door, `stack.load`, names no channel and placed every dynamic row on channel 1
whatever the bank said.

`R-062` gap 2 and `C-039` ask for the catalogue to feed the channel list. That is only safe to add
once a catalogue row CANNOT widen what the bridge writes to — so the fence comes first.

## What changes

**Commit 1 — the station fence (refusal conditions on the path to air, auth OFF included).**

- A **station fence** in the request gate, after sign-in and before permission: any route whose
  request names a channel `#declaredChannels()` does not contain is refused before anything reaches
  CasparCG, with its own sentence (`channelNotDeclaredRefusal`). It applies with auth OFF — it is a
  fact about the station, not about a principal. Fenced by default: only the two routes whose
  channel DECLARES (`fixedLayers.set-config`, `channelSettings.set`) are exempt, by name.
- **The console stops offering a channel the station does not operate:** the orphan sweep reads
  only declared channels, and the playout tab reports its rows on the declared channel instead of
  the constant `DEFAULT_CHANNEL`.
- **The dynamic allocator places on the declared channel**, not on the constant.
- **One predicate.** `#isDeclaredChannel` is what the gate, the restore door's `not-declared` skip,
  the orphan sweep, the playout rows and the channel-settings store all ask. Two of them held their
  own copy of the answer before.

**Commit 2 — the discovery call (`R-062` gap 2, `C-039`).**

- A channel-discovery call on the contract. For each channel it returns the three facts, KEPT
  SEPARATE: `named` (from D4, when the join matches), `declared` (this station operates it) and,
  with auth ON, `permitted` (this principal's grant, through `C-038`'s predicate and host rule).
- Sources in order: D4 when configured and answering, then the bank, then channel settings.
- D4 is polled at most every 30 s with `ETag`, with a bearer that is never revoked or expired and
  is released on sign-out. Any failure is ABSENT — no alarm, no verdict, never a gate on a verb
  (ADR 0010 rule 8). With auth OFF there is no bearer, so no read, and the list is today's.
- The strip shows only DECLARED channels, under the catalogue's name when the join matches. A
  catalogue-only channel — the Playout's programme channel — is returned by the call and is not on
  the operating strip.

## What deliberately does NOT change

- 🔴 **`silenceAllLivePlates` STAYS UNSCOPED** (A16). The fence reads a request's explicit
  channel; PANIC names none, and its scope is not re-decided here.
- **Item-scoped and bulk verbs are not fenced by the station.** Their channels come from the
  bridge's own ledger, through doors this change fences; refusing an Out on such a row would strand
  exactly the graphic an operator is taking off air.
- **`stack.restore` keeps its per-item SKIP** — one foreign row never costs a console its stack.
- **The catalogue cannot widen what the bridge writes to.** Commit 1 is what guarantees it.
- `R-062` gaps 1 and 3, real multi-channel, and A16's scope question stay open.

## Impact

- **Refusal conditions (commit 1), named door by door:** `layers.clear`, `playoutLayers.clear`,
  `fixedLayers.clear-layer` and `fixedLayers.load` refuse an undeclared channel at the gate. The
  last two already refused one, one layer deeper, with `not-in-bank` / `not-fixed`; the first two
  sent a `CLEAR`. With auth OFF this is the one behaviour change, and only a stale or crafted
  client meets it.
- **What an operator sees (commit 1):** the orphan strip no longer lists another channel's layers;
  the playout tab's rows name the declared channel. On a channel-1 station, neither moves.
- Wire: a new `stationChannels` module in `@cg/shared-ipc` (commit 1: the sentence; commit 2: the
  discovery channel).
- Specs: `runtime-caspar-bridge` (the fence, the reads, the allocator, the lock scenario that
  asserted this hazard, the discovery call); `runtime-ui` (the strip's names).
