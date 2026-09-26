# Design — `multi-channel` (`MULTI-CHANNEL-01`)

One CG Control drives several channels. The bank becomes a list keyed by channel; the console
lists the declared channels and switches between them; the four housekeeping verbs take an
optional channel; PANIC gains a per-channel sibling beside the unscoped one. `R-062`'s own
acceptance says the bank's cardinality changes only _"by its own item naming every producer and
consumer of `FixedLayerBankSchema` first"_ — §1 is that list, established before any change
(line numbers at `1dc8744e`).

## §1 — Every producer and consumer of `FixedLayerBankSchema`, before the change

**Plural-ready** means the site already asks per coordinate or per channel and needed no change
beyond the one predicate becoming plural. **One bank** means it read the single bank and had to
change.

### 1.1 The schema and the wire (`@cg/shared-ipc`)

| Site                                                            | What it is                                                           | Before                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| `channels/fixedLayers.ts:166` `FixedLayerBankSchema`            | one bank; `channel` documented _"one channel per bank, v1"_ (`:167`) | one bank                      |
| `fixedLayers.ts:271` `fixedBankSlots(bank)`                     | a bank's slots, both halves, each carrying the bank's channel        | plural-ready (pure, per bank) |
| `fixedLayers.ts:261` `isFixedBankLayer(bank, channel, layer)`   | membership, channel included                                         | plural-ready (per bank)       |
| `fixedLayers.ts:309` `defaultFixedLayerBank()`                  | channel 1, the template band                                         | one bank (the default)        |
| `fixedLayers.ts:557` `fixedLayers.config`                       | `void → FixedLayerBank \| null`                                      | one bank                      |
| `fixedLayers.ts:572` `fixedLayers.set-config`                   | `FixedLayerBank →` result; a changed channel REPLACES (`B-269`)      | one bank                      |
| `fixedLayers.ts:583` `fixedLayers.config-changed`               | publish, one bank                                                    | one bank                      |
| `fixedLayers.ts:589`/`:596` `fixedLayers.state`/`state-changed` | per-slot state, each slot carrying its channel                       | plural-ready                  |
| `fixedLayers.ts:721` `fixedLayers.load`, `:707` `clear-layer`   | request names `{ channel, layer }`                                   | plural-ready                  |
| `templates.ts:557`/`:581`/`:602` template-reference wording     | `describeTemplateReferences(refs, bank)`, `referenceRowName`         | one bank                      |
| `sources.ts:615`/`:666` `validateSourceCatalog({ fixedBank })`  | the Live Source band against the bank (the band carries no channel)  | one bank                      |

### 1.2 The bridge store and boot (`tools/caspar-bridge`)

| Site                                                                                  | What it is                                                                    | Before                                       |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `fixed-layers-store.ts:184` `validateFixedBank`                                       | one bank against the ceiling, the policy, the reservation, its own keys       | per bank                                     |
| `fixed-layers-store.ts:338` `validateFixedBankChange`                                 | one bank's change; the channel-replace rule `:362`                            | one bank                                     |
| `fixed-layers-store.ts:417`/`:452` `load`/`saveFixedLayerBank`                        | **the persisted bank file** — one JSON object                                 | one bank                                     |
| `bridge.ts:1313` `resolveFixedBank`                                                   | explicit > file > first-run > built-in default                                | one bank                                     |
| `bridge.ts:1337` `validateDeclaredBank`, boot `:1455-1474`                            | the boot validation and the source-catalog check                              | one bank                                     |
| `bridge.ts:1628` `setupPhase`                                                         | first-run's phase: `fixedLayersConfig() === null`                             | one bank                                     |
| `bridge.ts:477`/`:1945` `handle.fixedBankSource`                                      | `{ bank, source }` for the CLI boot line (`bin/caspar-bridge.mjs:562`/`:712`) | one bank                                     |
| `bridge.ts:2898`/`:2899`/`:2503` the three fixed-layer routes                         | read, write + persist, publish                                                | one bank                                     |
| `bridge.ts:1004` `stationChannelsFor` — **the discovery call**                        | lists the bank's channel as a `bank` source                                   | one bank                                     |
| `bridge.ts:669` `lockScopeAtEngage` — **`B-257`'s lock scope**                        | the engager's `grantedChannels` over `runtime.declaredChannels()`             | plural-ready                                 |
| `bridge.ts:933` `authStateFor` / `permittedChannels`                                  | `grantedChannels` over `runtime.declaredChannels()`                           | plural-ready                                 |
| `bridge.ts:1180` `stationRefusal` — **`CHANNEL-AUTHORITY-01`'s operating-door fence** | `runtime.isDeclaredChannel(req.channel)`                                      | plural-ready                                 |
| `bridge.ts:1055` `channelsForRequest`                                                 | (a) the named channel, (b) the item's ledgers, (c) the bulk verbs' union      | plural-ready; the bulk verbs cannot name one |

### 1.3 The runtime (`tools/caspar-bridge/src/caspar-runtime.ts`)

| Site                                                                             | What it is                                                              | Before                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| `:855`/`:1571` `#fixedBank`                                                      | the bank in force                                                       | one bank                   |
| `:10955` **`#declaredChannels()`**                                               | `[#fixedBank?.channel ?? DEFAULT_CHANNEL]` — _only the bank's channel_  | one bank                   |
| `:10974` **`#isDeclaredChannel`** — the one station-fence check                  | membership in `#declaredChannels()`                                     | plural-ready               |
| `:3093` **the restore fence** (`#slotForRestore`)                                | `not-declared` skip through `#isDeclaredChannel`                        | plural-ready               |
| `:3304` `#decidePendingRestores`, `:2802` `#noteStray`                           | strand / stray through `#isDeclaredChannel`                             | plural-ready               |
| `:4124` **`#reassertDeclaredVolumes`**                                           | `fixedBankSlots(this.#fixedBank)` — the connect-time sweep              | one bank                   |
| `:2226` `#loadFixedImpl` wrong-bank                                              | `isLowBankLayer(this.#fixedBank, layer)`                                | one bank                   |
| `:3193` `#migrateRetainedBed`                                                    | the bed half of the one bank                                            | one bank                   |
| `:4449`/`:4462` `fixedLayersConfig` / `setFixedLayers`                           | read; write, including the channel replace and the strand (`:4528`)     | one bank                   |
| `:4546` `#holdsOurAirOn(channel)`                                                | per channel                                                             | plural-ready               |
| `:4619` `#computeFixedState`                                                     | slots from the LayerManager (every coordinate); ALIAS from the one bank | one bank for the alias     |
| `:11536`/`:11541` **the post-`CLEAR` `MIXER CLEAR` guard**                       | `this.#layers.isFixed(slot)` — keyed on the whole coordinate            | plural-ready               |
| `:9036`/`:9047`/`:11188` mode read, output read, `INFO CONFIG`                   | loop `#declaredChannels()`                                              | plural-ready               |
| `:9116` the orphan sweep                                                         | `#isDeclaredChannel`                                                    | plural-ready               |
| `:9242` `playoutLayersState` (the playout tab's rows)                            | rows on every declared channel                                          | plural-ready at the bridge |
| `:10587` template-removal refusal, `:10908` `checkSourceCatalog`                 | wording and the band check against the one bank                         | one bank                   |
| `:11460` `#allocate` (a dynamic `stack.load`)                                    | `#declaredChannels()[0]`                                                | picks one                  |
| `:1593` `ChannelSettingsStore.hydrate(() => #declaredChannels())`                | the predicate, read at call time                                        | plural-ready               |
| `:9579`/`:9653`/`:9713`/`:2095` `removeAll`/`clearAll`/`stopAll`/`stackSnapshot` | the whole stack                                                         | no channel                 |
| `:8329` `silenceAllLivePlates`                                                   | the whole ledger (A16)                                                  | unscoped, stays so         |

The LayerManager (`@cg/caspar-client`) is fenced with a LIST of `{ channel, layer }` and answers
`isFixed` by coordinate — plural-ready by construction.

### 1.4 The console (`apps/runtime`)

| Site                                                                                                | What it is                                                                                   | Before                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `hooks/useFixedLayers.ts:16-48` `useFixedBank` / `useFixedBankState`                                | the one bank, from `fixedLayers.config`                                                      | one bank                                   |
| `features/channels/channelList.ts:41` **`channelIds`**                                              | discovery's `declared` first; the bank + settings as the fallback                            | plural-ready                               |
| `channelList.ts:144` `resolveSelectedChannel(list, choice, bankChannel)`                            | the default is the bank's channel                                                            | one bank                                   |
| `useSelectedChannel.ts:40`, **the strip** (`ChannelStrip.tsx:72`)                                   | list-shaped tabs; `· LOCKED` label (`:73`) with verbs still offered                          | plural-ready; `B-257`'s rendering deferred |
| `LayersPanel.tsx:331`/`:386`/`:564`/`:771-849`                                                      | the bank; items `onChannel(bank.channel)`; ROWS from every slot, unfiltered; bulk verbs bare | one bank                                   |
| `MonitorStrip.tsx:38`, `PreviewPanel.tsx:121`, `OrphanLayersBanner.tsx:136`                         | the one bank; orphans unfiltered by channel                                                  | one bank                                   |
| `fixedLayers/CandidateLayersSection.tsx:156`/`:233` — **Station setup's Layers section**            | edits the one bank through `set-config`                                                      | one bank                                   |
| `stationSetup/ChannelScopeCards.tsx:83`/`:86` — Change channel…                                     | reads `config`, writes `set-config` with a new channel                                       | one bank                                   |
| `StationSetupDialog.tsx:464`/`:1023` the subtitle                                                   | the selected channel's number                                                                | one channel                                |
| `fixedLayers/useTemplatePicker.tsx:391`/`:585`, `audit/AuditPanel.tsx:135`/`:150`                   | `fixedLayers.config()` for naming and placement                                              | one bank                                   |
| `ui/operatorNaming.ts:87`/`:158`, `hooks/useOperatorNames.ts:24`, `monitors/rehearsalFrames.ts:191` | row names from the one bank                                                                  | one bank                                   |
| `firstRun/firstRunStation.ts:33`/`:166`, `FirstRunScreen.tsx` — **first-run**                       | one channel picked; `firstRunBank(channel)` → `set-config`                                   | one channel                                |
| `platform/MockRuntime.ts:927`/`:955`/`:1055`; `createRuntimeBridge.ts:325`/`:457`                   | the offline mock's one bank and its discovery answer                                         | one bank                                   |
| `MockRuntime.ts:352` `load()`; `:937` `#fixedBindings` keyed by LAYER; `:1943` `#slotFor`           | **no `item.slot`** (`R-062`'s fourth finding)                                                | cannot express two channels                |
| `playout tab` (`LayersPanel` Station layers)                                                        | every declared channel's rows in one list                                                    | not split                                  |

### 1.5 The five `z.void()` verbs

`stack.ts:421` `silence-all-live-plates`, `:481` `remove-all`, `:537` `clear-all`, `:566`
`stop-all`, `:572` `snapshot`. `apps/runtime/tests/channelIndependence.dom.test.ts` §3
(`:290-326`) asserts all five accept `undefined` and reject `{ channel }`, with a positive control,
and names `R-062`. It goes red on purpose here; its `silenceAllLivePlates` half stays exactly as
it is.

### 1.6 The persisted bank file

Measured on this host: `~/.cg-runtime/bridge-fixed-layers.json` (channel 1, both halves, aliases),
CG Control's two backups under `%APPDATA%\CG Control\` (channel 1 and channel 2), and every fake's
file in the test runs — **all v1: one JSON object**. v1 is therefore a SHIPPED format, not an
unshipped one: `P-031`'s floor does not apply to it. A v1 file reads as a one-entry list. A
station that declares ONE channel keeps writing the v1 object, byte for byte, so a single-channel
station's file is unchanged and an older build can still read it; two or more channels write
`{ "banks": [ … ] }`. The reader accepts both; anything else is the existing hard boot failure.

## §2 — The bank schema change (A)

`FixedLayerBanksSchema` = `z.array(FixedLayerBankSchema)` refined to one bank per channel. The
shared helpers every reader uses are `sortBanks`, `bankForChannel`, `firstBank`,
`fixedBanksSlots`, `bankInSet` and `bankSetSize`. Three channels carry the list:
`fixedLayers.banks` (read), `fixedLayers.set-banks` (`station-admin`, at least one bank) and
`fixedLayers.banks-changed` (push). `config` / `set-config` / `config-changed` are kept as the v1
VIEW of the same list — `config` answers the first channel's bank, `set-config` means "the set
becomes this one bank" — so every one-bank caller, and every one-channel station, is unchanged.

**What each one-bank site of §1 reads now.** Every per-coordinate reader asks
`#bankFor(channel)` (the wrong-bank refusal, the bed migration, the per-slot alias); the
connect-time sweep covers `fixedBanksSlots` of every bank; `#declaredChannels()` is every bank's
channel, and the plural-ready doors read it unchanged — one predicate, no second copy; the
discovery call lists each bank as a `bank` source; `setupPhase` is `channel` while no bank is
declared; the CLI boot line names every bank; the template-reference wording and the Live Source
band check take every bank; `#allocate` refuses a load that names no channel on a station
declaring more than one (a row's own load names its coordinate); the store validates the SET per
channel (`validateFixedBanksChange`: edit = every single-bank rule, add = a fresh install through
`validateFixedBankInstall`, remove = refused while ours holds air there, in `B-269`'s sentence).
The permission gate and the lock judge `set-banks` by `bankChangeFootprint` — the channels it
adds, edits or removes. On the console, `useFixedBanks` holds the list, `useChannelBankState()`
answers the selected channel's bank, and every surface of §1.4 reads the channel on screen.

**The file (§1.6's decision).** Read v1 as a one-entry list; write ONE bank as the v1 object byte
for byte; write two or more as `{ banks }`. The cost of the one-entry read is one branch, and it
keeps every installed station booting.

**The mock (§1.3's fourth finding), first.** `MockRuntime.load()` now writes `item.slot`, keyed by
channel and layer (`b7317f8b`), so the app's own mock can put two rows on two channels.

## §3 — The verbs (B, C)

**B.** `HousekeepingScopeSchema` = an optional `{ channel }` on `stack.remove-all`,
`stack.clear-all`, `stack.stop-all` and `stack.snapshot`. Bare = byte-identical. With a channel:
that channel's items only; the station fence reads it (top level); the permission check and the
lock judge that channel alone, all-or-nothing. The console passes the channel on screen once two
or more are declared, and sends the verb bare on a one-channel station.

**C — the new verb.** `stack.silence-channel-live-plates`, request `{ channel }` (required),
response the same as `silence-all-live-plates`. Class `operator`, channel-scoped: the fence, the
permission gate and a lock covering that channel judge it as any other intent naming a channel
(`channelsForRequest` (a)). Scope = the ledger's seats on that channel, never a status (`B-122`).
`silenceAllLivePlates` is untouched — `z.void()`, unscoped, `operator`, no channel check (A16) —
and is the every-channel control.

| Where                            | Station declares ONE channel                                                                                                | Station declares TWO or more                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plates toolbar — face            | `Silence all plates`                                                                                                        | `Silence all plates · CH n`                                                                                                                                                            |
| plates toolbar — accessible name | `Silence all boxes on every channel — set every live plate the bridge has seated to zero, whichever channel it is on` (A16) | `Silence all boxes on channel n — set every live plate the bridge has seated on channel n to zero`                                                                                     |
| plates toolbar — verb            | `stack.silence-all-live-plates`, bare                                                                                       | `stack.silence-channel-live-plates { channel: n }`                                                                                                                                     |
| header, beside the channel strip | absent — the toolbar's PANIC already IS the every-channel verb                                                              | `SILENCE ALL PLATES · EVERY CHANNEL`, accessible name as A16's, `stack.silence-all-live-plates` bare; operator role only; withdrawn while a lock covers any of this console's channels |
| the report                       | as before                                                                                                                   | ` · CH n` / ` · every channel` appended; "nothing" reads "channel n holds no live plates" / "no channel holds a live plate"                                                            |

The A16 test (`liveSourcesPanel.dom.test.ts`) moved with the label: the one-channel carriers are
pinned exactly as A16 shipped them, and `panicScope.dom.test.ts` pins the per-channel ones.
`channelIndependence.dom.test.ts` §3 went red on purpose (§1.5) and now pins: the four housekeeping
verbs accept `undefined` AND `{ channel }`; `silenceAllLivePlates` still rejects `{ channel }`, its
positive control intact; the new verb requires a channel.

## §4 — Switching (D) — where the selection lives, and what survives a reload

The selection is a channel id in `channelStore` — module state, SESSION-ONLY, written to no
storage (A13, unchanged). A reload survives nothing of it: the console reopens on the LOWEST
declared channel (a station on 2 and 3 opens on 2). `channelView(banks, selected)` is the one
reading every surface shares — `multiChannel = banks.length > 1`; `viewChannel` (what to show)
and `verbScope` (what to send: the selected channel when multi, else `null` = bare). Everything
per-channel follows the selection: the rows and their names (each channel's own bank), the
Inspector's selection, both monitors, the plates table, the playout tab (G), the bulk verbs and
PANIC, Station setup's Channel pane and its Layers section (which edits the selected channel's
bank — `set-config` on a one-channel station, `set-banks` with only that entry replaced
otherwise).

## §5 — First-run and the channel set (E, M)

First-run's channel step is a toggle set on one CasparCG host (a pick on another host starts the
set there); `Use this channel` / `Use these channels` — the count picked, or offered while none is
(`DELTA-MULTI-CHANNEL-01-A` A8) — and `… anyway` after the occupancy lines — one line per ADDED
channel already on air. A picked chip wears the console's one "chosen, not on air" fill. One channel → `set-config(firstRunBank(ch))`,
byte-identical; two or more → one `set-banks`. Station setup's **Change channel…** is the same step,
opened on the declared set (a declared channel the Playout does not list shows as `CH n`), and
`nextChannelSet` builds the set: a kept channel keeps its bank, an added one gets first-run's, and a
one-for-one swap carries the station's bank to the new channel (DESKTOP-APPS-01-D e). The removal
refusal is the bridge's (`B-269`'s sentence), shown as it comes. Strays stay where D put them —
out of every channel view, in Station setup with **Take off air** — and a channel removed while
clean leaves none.

**The Channel pane's legend (M).** A station-admin reads _"Reported by the server. Change channel…
sets the channels."_, tag `Apply separately`, footer _"Nothing to apply here — Change channel…
applies on its own."_ Anyone else reads the pane's own read-only legend, as before.

## §6 — The lock with partial overlap (F)

A covered channel's view is a `Channel n locked` card — the lock screen's PIN card
(`LockCard`, shared with the console-wide overlay) with _"Playout continues. Enter the PIN to use
this channel."_ and `Unlock` — in place of the view; `useCanOperate` answers false for a covered
channel, so its verbs are ABSENT (golden rule 13). The strip keeps `CHANNEL n · LOCKED` (B-257).
The every-channel PANIC is withdrawn while a lock covers any of this console's channels: the bridge
would refuse it whenever its ledger holds a seat on a covered channel the principal holds. The
bridge side is unchanged in shape — `lockRefuses` judges a scoped verb by its named channel — and
is now proven with two declared channels (`lock-scope.integration.test.ts`).

## §7 — The playout tab and the subtitle (G, H)

G: the playout rows and the orphan rows on screen are the selected channel's. H: the subtitle
reads `Channel n · <catalogue name>`, the name in its own `<bdi>`; with no name, as before.

## §8 — Every Station setup pane below `station-admin` (I), walked against the route classes

| Pane                 | Apply route(s)                                                                                       | Class                              | For a non-admin                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Servers              | `connections.set-config`                                                                             | `station-admin`                    | values as `Tag`s; no Apply, Revert, Add/Remove backup; no "paused while on air" notice                |
| Channel              | `fixedLayers.set-config`, `fixedLayers.set-banks`, `station.take-off-air`, `setup.channel-occupancy` | `station-admin`                    | the report; Change channel… and Take off air absent                                                   |
| Live sources         | `sources.set-config`                                                                                 | `station-admin`                    | the catalogue and band as values; no Add, Edit, Remove, band fields or Apply band                     |
| Text file delimiters | `delimiters.set`                                                                                     | `station-admin`                    | the list; no Add, Remove or Reset                                                                     |
| Layers               | `fixedLayers.set-config` / `set-banks`; a row's Remove is `stack.remove`                             | `station-admin`; Remove `operator` | Shown/Hidden and the name as text; no switch, name field, Apply or Revert; Remove per `useCanOperate` |

The legend and footer for a non-admin read _"Read-only — this sign-in does not change station
settings."_ / _"Nothing to apply — this sign-in does not change station settings."_
(`sectionSpecFor`). The bridge's refusals are untouched — this changes only what is offered.

## §9 — The demo's station-admin (J)

`cg-admin-ch2` in the fake Playout: `station-admin`, `operator`, `viewer`, granted `127.0.0.1`
channel 2; printed first by `pnpm dev:playout-auth` as the one user who can apply Station setup on
the demo station. `FAKE_ADMIN` (`cg-admin`, channel 1) is unchanged.

## §10 — A channel's messages stay in its view (L) — the classification

| Source                                                                | Class   | Mark on another channel's tab |
| --------------------------------------------------------------------- | ------- | ----------------------------- |
| program output alarm (`OutputMissingBanner`)                          | channel | red (alarm)                   |
| raster mismatch (`RasterMismatchBanner`)                              | channel | red (alarm)                   |
| "did not come back" (`EmptiedAirNotice`)                              | channel | amber (warning)               |
| foreign content, occupied owned layers (`OrphanLayersBanner`)         | channel | amber (warning)               |
| a refusal (`RefusalBanner`), stamped with the channel on screen       | channel | amber (warning)               |
| on-air counts, the table's notices, plates and playout dots           | channel | —                             |
| the per-channel lock                                                  | channel | — (the tab's `· LOCKED`)      |
| bridge link (`ConnectionBanner`), bridge version (`BridgeSkewBanner`) | station | —                             |
| servers and backup (`FailoverBanner`)                                 | station | —                             |
| status bar: Playout link, sign-in, station lock                       | station | —                             |
| sign-in, first-run, the console lock screen                           | station | —                             |

An alarm beats a warning (one mark per tab); the mark is spoken ("This channel has an alarm /
a warning"). A notice spanning channels shows each view its own rows; `EmptiedAirNotice`'s
DISMISS is offered only in a view that holds the whole notice, because the bridge's dismiss is
notice-wide (follow-up below). With one channel nothing is filtered or marked.

## §11 — `B-263`: Persian in the chrome (K) — every `font-family`, walked

| Declaration                                                                       | Chrome? | Verdict                                                             |
| --------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| Designer `index.css` `body`                                                       | yes     | FIXED — `'Vazirmatn Arabic'` leads                                  |
| Designer `App.css.ts` page                                                        | yes     | FIXED                                                               |
| Runtime `layout.ts` page                                                          | yes     | FIXED                                                               |
| `@cg/ui` `theme.css` `--cg-font` on `body` (portaled dialogs)                     | yes     | already Vazirmatn-first; tokens-only package, unchanged             |
| both `fonts.css` `@font-face`                                                     | no      | the faces; inlined into exports — the new family is NOT added there |
| both `index.html` splash                                                          | no      | no Persian (checked)                                                |
| `--r-font-mono`, `ui-monospace` rules, `B042Probe`                                | no      | mono                                                                |
| `inherit` (Designer `Button`/`Select`/`Textarea`/`TopToolbar`, Runtime controls)  | —       | inherit the fixed stacks                                            |
| Designer `TextEditor`, `AssetThumb`, `element-defaults`, `Exporter`, `preview.ts` | no      | authored or exported content — unchanged                            |

`'Vazirmatn Arabic'` (`chromeFonts.css`, both apps): Vazirmatn's own Arabic files, three weights,
`unicode-range: U+0600-06FF, U+200C-200D, U+FB50-FDFF, U+FE70-FEFF`. Measured with CDP
`CSS.getPlatformFontsForNode` (`chrome-persian-font.spec.ts` in each app); red with the old stacks
planted: Windows drew the Runtime's Persian row name in `Segoe UI Semibold` and the Designer's in
`Segoe UI, Exo 2`.

## §12 — The three-class flag: what reaches CasparCG

This changes what is sent to CasparCG and adds refusal conditions. **Every verb whose wire output
changes WITH a channel argument:**

- `stack.remove-all { channel }`, `stack.clear-all { channel }`, `stack.stop-all { channel }` —
  AMCP only to that channel's items; `stack.snapshot { channel }` narrows a read (no AMCP);
- `stack.silence-channel-live-plates { channel }` (new) — `MIXER <ch>-<layer> VOLUME 0` for that
  channel's seats only;
- `fixedLayers.set-banks` (new, `station-admin`) — declares the set; items left on a channel it
  drops leave the stack with no wire command.

New refusal conditions: the fence on a named bulk-verb or PANIC channel; the per-channel permission
and lock judgement; a removal of a channel holding our air; a load that names no channel on a
two-channel station.

**Every bare call is byte-identical** — `stack.remove-all`, `clear-all`, `stop-all`, `snapshot` and
`silence-all-live-plates` with no argument send exactly what they sent before, proven by the
existing suites green and unchanged, and at the fake's wire by the bare-call controls in
`channel-independence.integration.test.ts`.

## §13 — Auth OFF with one declared channel

**The AMCP wire is byte-identical**: every verb is sent bare, the bank file is the v1 object byte
for byte, the sweep is the one bank's. What differs:

1. **The console socket** — the console also reads `fixedLayers.banks` and receives
   `fixedLayers.banks-changed` beside `config-changed`.
2. **The Channel pane (M)** — the auth-OFF console holds every role, so it reads the station-admin
   legend (`Reported by the server. Change channel… sets the channels.`), tag `Apply separately`,
   and footer `Nothing to apply here — Change channel… applies on its own.` in place of
   `Read-only — reported by the server`.
3. **Persian chrome glyphs (K)** — drawn in Vazirmatn where Windows drew Segoe UI.

Nothing else: no mark, no filter, no every-channel control, A16's PANIC strings, `set-config`
first-run.

## §14 — CI budget (shared config)

`5831d6c1`: the `e2e` job cap 20 → 24 min, the Runtime suite's CI budget 8 → 10 min. The Runtime
suite measured 7.7 / 7.7 / 7.9 min against 8.0, and `e78d1181`'s run went red having failed
nothing (246 passed, 10 did not run — the 480 s global timeout). Designer 8.0 + Runtime 10.0 = 18
min against 24 − ~1.6 setup − ~1 build ≈ 21.4 usable: 3.4 min of margin.

## §15 — `DELTA-MULTI-CHANNEL-01-A` (the owner's run of `dev:station --fake`)

- **A1 — the fake was not a station.** `fake-playout.ts:866` sealed loopback by default (no
  approve button exists), and there was no CasparCG at all. `--fake` now starts the station
  composition in `caspar-bridge/tests/support/fake-station.ts` (hashed by that workspace's `tests/**`
  inputs, loaded by path): `sealOnLoopback: false`, the AMCP mock on 5250 with OSC on 6250 serving
  channels 1 and 2, admitting what the Playout trusts, and the PGM feeds on 9250/9251 when free.
  Product code knows nothing of it. The state dir is fresh every run (`.previous` kept).
- **A2 — one held re-run, not a loop.** The console re-ran the whole check every 2 s while the AMCP
  line waited (`PlayoutConnection.tsx`, fifteen runs over the 30-s trust window). Now a check runs
  when pressed; by itself once at a station-admin's sign-in (with nothing shown), and at most once
  more while a line waits, touching only that line and asking the bridge to HOLD the AMCP line
  (`awaitLetIn`): within the window the bridge repeats the `VERSION` probe about once a second and
  answers once. **Why not "when the bridge's link comes up":** on a first run the station's server
  is the loopback default (`defaultConnection`), never the CasparCG the check probes, so that link
  would never come up on the plant and the channels would wait the full 31 s (golden rule 8). One
  check at a time replaces `CHECK-RERUN-01`'s run tags; `SETUP_CHECK_LET_IN_WAIT_MS` derives the
  console's wait from `AMCP_TRUST_WINDOW_MS`, which moved to `@cg/shared-ipc`.
- **A3 — the re-delivery before the sign-in.** `#resync` read the auth gate in the tick the socket
  opened; with no token yet it read 'unknown' and sent `templates.import` unsigned — refused, and
  the notice outlived the sign-in 86 ms later. It now awaits the capabilities and the token
  handshake and returns while signed out; a successful re-delivery withdraws its own notice; the
  notice is station-scoped (rule L). ADR 0010 rule 4 is kept: a never-authenticated socket gets
  `bridge.capabilities` and `auth.*` only.
- **A4 / A6 — reads wait until the console can be answered.** `useBridgeSnapshot` pulled once, while
  signed out, was refused, and never pulled again; `initSources`/`initDelimiters` likewise. Reads
  now wait for an answerable auth state and re-pull on it. The every-channel PANIC
  (`EveryChannelPanic.tsx:53`: two or more channels, the operator role, no covering lock) was
  withheld only because the refused banks read left `multiChannel` false.
- **A5 — one line.** The Layers refusal put the bridge's `message` under the rule; now the line is
  ours (`Refused — …, so it stays shown.`) and the layer comes as data (`layer` on the refusal).
  Swept on three axes; the Live sources family changed with it (`CommitRefusal` lost `detail`);
  the Audit panel, a diagnostic surface, keeps quoting a failure.
- **A7 — already true**, now pinned: every per-channel pane reads the one selection and the Layers
  editor is keyed on the whole bank, so a switch while open re-keys it and a draft never crosses.
- **A8** — the label counts the picked channels, or the offered ones while none is; the chips joined
  the console's one "chosen, not on air" selector family (`.is-on` paints no `secondary`).

## §16 — Follow-ups (named, not done)

- **A per-channel DISMISS for "did not come back".** The bridge's dismiss is notice-wide, so a view
  holding only part of a notice offers no DISMISS. A per-channel dismiss is a bridge API change.
- **Two CG Control installations on one channel** — two bridges, two ledgers (§3 of the prompt).
- Per-channel band layouts beyond the standard three, and the Playout's layer band 1–49.
