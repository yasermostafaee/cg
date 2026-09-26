# Design — field fixes from 2026-09-26 (`FIELD-FIXES-01`, `FIELD-FIXES-01-A`)

## §0 What the take did (established, accepted by the owner)

The installed app keeps no AMCP log (§5), so Bed 59's take (audit `2026-09-26T09:40:00Z`, `failed`,
`amcp-403`) was replayed on the mock with the station's own bank, catalog, assignments and template:

```
MIXER 2-59 VOLUME 0            → 202 MIXER OK
CG 2-59 ADD 0 "http://192.168.21.93:7911/template/cb25ece1-…?cw=1920&ch=1080" 0 "{…look-2…}" → 202 CG OK
MIXER 2-59 VOLUME 1            → 202 MIXER OK
PLAY 2-60 DECKLINK DEVICE 1    → 403 PLAY FAILED
CLEAR 2-60                     → 202 CLEAR OK
MIXER 2-60 CLEAR               → 202 MIXER OK
```

Nothing aired; the graphic was left ADDed and unplayed on 2-59. CasparCG 2.5.0 answers
`<code> <COMMAND> FAILED` and nothing else (`AMCPCommandQueue.cpp`); a DeckLink device that is absent
throws `user_error` "Decklink device N not found." from `get_device`, and 2.5.0 logs only
" Check syntax." for it. Nothing over AMCP enumerates DeckLink devices, and D4 carries only
`{id, name, casparHost, casparChannel}`.

## §1 Decision 1 — a fresh take airs everything or nothing

- The take stops at the first refused plate: the seating loop breaks, no later plate is tried, and
  the graphic's `CG PLAY` is never sent.
- It undoes exactly what it put there, through the Rule (§2): the plates it seated (their `PLAY`
  landed) are cleared with their mixer; the plate whose `PLAY` was refused is not cleared — the
  server left that layer as it was; and the graphic it `CG ADD`ed comes off its layer the way
  `out()` takes it (`CLEAR`, adoption on the primary, `B-253`'s mixer reset), and `#loaded` forgets
  it so the next take re-ADDs.
- The other half: when the graphic's own `CG PLAY` fails AFTER its plates were seated, the plates
  come down and an ADDed graphic comes off, the same way.
- The row ends in ERROR carrying `takeRefusal` (§6): the code, the refused command, and the plate
  that was refused — only that plate; plates never tried are never named.
- A refused PRESET (a seat only a look not on screen uses) still does not refuse the take: it is
  dropped (`§2.9`, unchanged) — no hole on air follows from it, and the look that needs it refuses
  when entered (see §3).
- The success path is pinned byte for byte against the wire recorded at `459c3f64`
  (`take-all-or-nothing.integration.test.ts`, "HARD STOP").

## §2 The Rule — a refused `PLAY` never clears a working picture

CasparCG leaves a layer as it was when it refuses a `PLAY` (`play_command` → `loadbg_command` builds
the producer before `stage->load`). So every clean-up after a refusal is ours, and one helper decides
it (`tools/caspar-bridge/src/refusal-cleanup.ts`): a layer is cleared only if this operation put a
producer on it (`landed`, or `unknown` — no usable reply) and never if one of ours was on it before
the operation began (`heldBefore`, read once from the ledger). A 4xx reply is `refused`; `amcp-5NN`,
`amcp-timeout` and `amcp-send-failed` are `unknown`.

**The clean-up-after-refusal sites — three, all in `CasparRuntime.#applyLivePlatesUnguarded`, plus
the one Decision 1 adds:**

| Site                                   | Anchor (before this change)   | Reached from                                                            |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| the dropped preset                     | `caspar-runtime.ts:7411-7412` | take, look switch, swap, re-seat                                        |
| the take's rollback                    | `caspar-runtime.ts:7452-7453` | take                                                                    |
| the failed plate's teardown            | `caspar-runtime.ts:7588-7589` | look switch, R-048 swap, UPDATE's binding change, the reconnect re-seat |
| the graphic a refused take added (new) | `#removeUnplayedPage`         | take                                                                    |

The owner predicted 2–5 sites, naming take, look switch, R-048 swap and re-seat. There are three,
because those four operations are not four code paths: they are the three modes of the ONE
reconcile (`reconcileLivePlates` → `#applyLivePlates`), whose failure branch is shared. Every other
`CLEAR` the bridge sends (`out`, `remove`, the bank and layer clears, `takeStrayOffAir`,
`teardownLiveLayers`, the release sweep, the adopt-`CLEAR`) is an operator verb or a success path,
not a clean-up after a refusal. All four sites now call `#clearAfterRefusal` and nothing else.

## §3 The look switch on a refused plate (reported, not changed — `B-273`)

A switch sends a `PLAY` only for a seat the take did not pre-seat — in practice a preset dropped at
the take (§1). `setActiveLook` tells the page the NEW look first (`beforeApply` → `#tellPageLook`),
holds one channel frame, then applies; a refused `PLAY` commits the fills that landed, puts every
moved plate back (`B-166`), tears the failed seat down through the Rule, and only then re-tells the
page the PREVIOUS look (`caspar-runtime.ts` `setActiveLook`). For that window — the hold, the refused
`PLAY`'s round trip, the commit, the restores and the re-tell — the page shows the new look's boxes
and the refused plate's box has no picture: **a hole on air, a few frames long.** If the re-tell is
refused too, the page stays on the new look over the old geometry until the operator re-issues it.
What a switch should do instead is the owner's decision; nothing here changes it.

## §4 Decision 2 — a take of a row already on air is refused by the bridge

- `#takeImpl` refuses, before it mutates anything, with `already-on-air` (`TAKE_ON_AIR_CODE`,
  `@cg/shared-ipc`) whenever `#ownsLiveSeats` holds: the row is on air or unsettled
  (`isOnAirStatus` — a take in flight is `pending`, an overdue one `unconfirmed`) or the ledger holds
  its seats. One predicate, the one golden rule 10 names; every console meets the same refusal.
- **One predicate, three callers.** The two halves are spelled once, as `ownsLiveSeats(item,
holdsSeats)` in `@cg/shared-schema` beside `isOnAirStatus`; the bridge's `#ownsLiveSeats` hands it
  its own two facts, `MockRuntime.take` its seated set, and the console's PLAY the row's status plus
  whether the published live-layers ledger holds a seat for the row (`LayersPanel` reads the one
  ledger snapshot, as it does for `rehearsing`). PLAY read `on-air`/`playing` alone before. Its
  disabled title names the row: _"Bed 59 is already on air — take it out first."_
  (`takeOnAirReason`), and a refusal the bridge answers (a race, another console) is said in the same
  sentence.
- **Why the ledger half, when the owner named the page.** A row whose plates are seated while its
  status is not on air is `B-145`'s adopted row: the bridge restarted, the plates stayed on the
  channel, the status did not come back. Its page is up too — CasparCG never stopped — and a take
  would re-`PLAY` every seated plate, which on a DeckLink fails by construction (`B-177`). So the
  bridge knows that page is on air by its ledger, and refuses. **Residual, not changed here:** such a
  row reads READY, and STOP is still gated on the status, so its way out is CLEAR (the escape hatch,
  offered whatever the status says); after CLEAR, PLAY is back.
- **Where the 5 s came from.** `INTENT_TIMEOUT_MS = 5000` (`caspar-runtime.ts`), armed by
  `#armExpiry(seq)` immediately before the take's `CG PLAY`, and expired by
  `Reconciler.expireIntent`, which (since `B-079`) RETRACTED the take's play evidence. With the page's
  own producer on OSC that read `loaded`, so PLAY came back on a graphic that was up; and a late OK
  settled `ackedStatus` without restoring the evidence, so it stayed `loaded`. **Fixed in that one
  place:** an expired take is `takeOverdue` — unresolved, not failed — keeps its evidence, reads
  `unconfirmed` above OSC, and its own late reply resolves it. Note: every AMCP command also times out
  at 2 s IN FLIGHT (`CommandQueue`'s default), so the 5 s expiry is reached only by a `CG PLAY` that
  waited unsent (the queue paused for a resync, or its pipeline full); a reply slower than 2 s in
  flight is already a failure (`amcp-timeout`), which Decision 1 undoes.
- Six bridge tests re-took an on-air row as a step or a subject (`live-seating` "RE-TAKE lands on
  the same layers", `server-restart-retake` ×2, `live-look-reconcile` ×2, `multibox-exclusivity`'s
  door-1 boundary). Each now asserts the refusal and reaches its subject through OUT or STOP first.
- Five runtime e2e specs pressed PLAY on the seed's news row (layer 80), which the seed models as
  that `B-145` row — seats held while it reads loaded. `layers-header-tally`, `server-settings` and
  `test-mode-honesty` take the idle TICKER row (96) instead; `live-source-layers` takes the news row
  out with CLEAR first and then asserts it reads ON AIR, so its on-air section is not the loaded
  case again; `fixed-layers` asserts the refusal title, and its closing CLEAR is the control (PLAY
  back). `template-self-stop`'s stale-token case STOPs the first run before its re-take. In
  `MockRuntime.test.ts` two `B-145` cases took the row inside OUT's 160 ms `exiting` window, which is
  unsettled and now refused exactly as the bridge refuses it; they wait for the settle.

## §5 The AMCP log — every command, its reply line and its time (`B-276`)

- **Why the installed app wrote none of this.** No bridge ever wrote an AMCP log: not the installed
  sidecar, and not the dev bridge either. The only AMCP trace in the tree was the mock's own, which the
  tests switch on. The installed app keeps `bridge.log` (the sidecar's stderr, `sidecar.rs`) and the
  audit NDJSON, and neither carries the exchange: the audit keeps the refusal's code, not the command
  and the reply line. So `FIELD-FIXES-01` §0 had to replay the take on the fake to recover the wire.
- **Fixed in one place.** The bridge writes it, at the session queue every command passes: `CommandQueue`
  says each settled command once (`exchange`: its line, the reply's header exactly as sent, its round
  trip), a timeout or a dropped socket by name, and a reply that comes after its timeout again, marked
  late. The runtime hands each one, with its server and address, to the one sink it is given at
  construction; `createBridge` gives it an `AmcpLog` when `amcpLogPath` is set.
- **Where.** The CLI derives the path from `--state-home`: `<state-home>/logs/amcp.log`, which for the
  installed app is `%APPDATA%\CG Control\logs\amcp.log`, beside its `bridge.log`. No launcher needs a new
  flag. `--amcp-log-path` names another file; the dev station passes it, beside its own `bridge.log`
  (its guard requires every path flag the CLI reads to be passed inside the dev state). A bare dev
  bridge writes `~/.cg-runtime/logs/amcp.log`.
- **One line per exchange:**
  `2026-09-26T09:40:00.296Z A 192.168.21.111:5250 4ms >> PLAY 2-60 DECKLINK DEVICE 1 << 403 PLAY FAILED`.
  5 MB, then the file becomes `amcp.previous.log` and a fresh one starts. A command longer than 2,000
  characters is cut with its length said. Measured: an idle bridge wrote 34 lines in 30 s, all of
  them the connect handshake and the boot volume blanket, so 5 MB holds about 64,000 exchanges.
- **No token.** The one token an AMCP line carries is the take token in a `CG ADD`/`CG UPDATE` payload;
  it is redacted in both spellings (escaped and bare). The Playout's sign-in token never travels over
  AMCP. It is a SINK and not an emitter because every emitter is pushed to every console (`B-247`'s
  guard): the raw line, token included, must never be.
- **Fail-open.** A file that cannot be written is said once on stderr and switched off; playout never
  waits on it. The bridge's own stderr lines are unchanged apart from one boot line naming the file.

## §6 A — one mapping from an AMCP refusal to the operator's words

- **Where.** `apps/runtime/src/renderer/ui/amcpRefusal.ts`: `amcpRefusalWords(code, command)` answers a
  sentence (for a surface that names nothing else) and a clause (for the row's line after its row
  and source names). `errorCodeMessage` calls it for every `amcp-NNN` code, so the banner and every
  verb's refusal say the same generic line when there is no command to tailor it by.
- **What each code means**, read from CasparCG 2.5.0-stable's source: execution failures reply
  `<code> <CMD> FAILED` — 404 `file_not_found`, 403 a user error or a parameter that would not
  convert, 402 a missing parameter, 501 anything else; parse failures reply `400 ERROR` with the line
  echoed (not understood — and also a channel that does not exist, since `create_channel_command`
  answers null for it), `401 <CMD> ERROR` (a channel that could not be parsed), `402`, `503`
  (another client holds the channel's lock) and `500`. No reply carries a reason. A DeckLink index
  the machine lacks is a user error (403); a busy device is swallowed and answers 404 (`B-177`).
  So v6's 401 line stands as written, and a 400 on a channel-addressed command says both
  possibilities; 503 is not a failure while running but a lock, and says so.
- **The number goes to the log**: the bridge's `logs/amcp.log` (§5) and the audit record's
  `command`. The audit panel keeps its code column — it is the log surface.

## §7 B — the refusal lives with the row

- **One line, one composition** (`features/layers/takeRefusalLine.tsx`), read off the item's
  `takeRefusal`: the row's name (through `operatorRowName`), the refused plate's source name, the input
  the command named (`DeckLink n`), then A's clause. Names are isolated in `<bdi>`s and the line is LTR
  chrome (golden rule 11). A refusal of the graphic's own command names no source.
- **On the row** the line takes the template cell (the widest text column) in the error word's ink,
  with the whole line in its `title`; the state cell's ERROR title carries it too (`rowState`'s
  `errorLine`), so it is readable at every density. **In the Inspector** it sits under the state chips.
- **No banner.** The bridge answers the take with `refusalOnRow` exactly where it recorded the refusal
  (`StackTakeChannel`); `asyncResultMessage` answers null for it and the button settles to idle, so
  neither the button nor its context-menu twin raises the banner. A refusal made before the wire (on
  air, rehearsing, disconnected, an unassigned plate) never carries it and keeps its own surface.
- **Channel scope** (§2 L's rule): the line is on the row, which is in its channel's view only; the
  strip marks the channel whose row carries one (`takeRefusalChannels` — the item's slot, else the
  bank row it is bound to, because a mock item carries no slot).
- **It clears** when the bridge withdraws it: the next take that lands, a clear, a removal.
- **Test mode:** the mock's one-shot seam `CG_E2E_REFUSE_NEXT_TAKE` refuses the next take at the wire,
  as the bridge would record it; unset, the mock takes as it always has.

## §8 C — what `ON AIR NOW` on a look means

- **Established.** The Inspector's look badge (`LooksBindingsSection.badgeFor`) said `ON AIR NOW` for
  the row's selected look whenever `isOnAir(item)` held — and `isOnAir` is "may it be showing
  something?": `status` other than `idle` and `loaded`, so TRUE for `error`, `unconfirmed`,
  `unverified` and `disconnected`. Its comment claimed it was the layer table's own air predicate; it
  never was (the row's green mark is `badgeTone` → `onair`). So after Bed 59's refused take the badge
  read `look-2 ON AIR NOW` under a row reading ERROR — the owner's screenshot.
- **Fixed:** `claimsAir(item)` (`stack/onAir.ts`) is the row's own green mark — `on-air`, or a take the
  server acknowledged (`playing`, no longer pending) — named once, and the badge and the section's
  "actually on air" notes ask it. An error, an unresolved take, an unverifiable link or a take in
  flight is not said to be on air.

## §9 E — CI actions on Node 24

Each action's latest release, and the runtime its own `action.yml` declares at that tag, read from the
action's repository (not from memory): `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0,
`actions/upload-artifact` v7.0.1, `actions/download-artifact` v8.0.1, `pnpm/action-setup` v6.1.0 — the
five the warning named — and `actions/cache` (and `cache/restore`) v6.1.0 and `dorny/paths-filter`
v4.0.3, which ran on Node 20 too and would have kept the warning: all `node24`. `Swatinem/rust-cache@v2`
already resolves to a `node24` release (v2.9.2), and `dtolnay/rust-toolchain` is a composite action.
Every crossed major's release notes were read for what could break these workflows: `setup-node` v5
auto-cached on `packageManager`, and v6 limited that to npm (ours is pnpm, so v7 changes nothing
here); `download-artifact` v5 changed the path of a download BY ID (ours is by name pattern with
`merge-multiple`) and v8 errors on a hash mismatch; the runners need 2.327.1, which GitHub-hosted ones
are. Our own Node stays as `.nvmrc` says (22). **Shared CI config.**

## §10 F — drag and drop in the installed apps

- **Cause, confirmed in the source of the locked version** (`tauri` 2.11.6, `tauri-utils` 2.9.3):
  `drag_drop_enabled` defaults to true — _"Disabling it is required to use HTML5 drag and drop on the
  frontend on Windows."_ With it on, WebView2's drops go to Tauri's native handler and the page's
  `dragover`/`drop` never fire. Neither `tauri.conf.json` set it, so both apps had it on.
- **Which gestures:** the Designer's Assets-panel drag onto the canvas is HTML5
  (`AssetThumb` sets `application/x-cg-asset-id`), and so is a file dragged from Explorer (the page reads
  `dataTransfer.files`); both were taken by the native handler, and both reach the page with it off —
  WebView2 then delivers Explorer's files as HTML5 `File` drops. Nothing listens for Tauri's native
  drag-drop events in either app.
- **CG Control too:** its template picker takes a `.vcg` dropped from Explorer, and the Inspector's list
  field reorders by HTML5 drag — so its window gets the same setting.
- **Fixed:** `"dragDropEnabled": false` on each app's one window (`main`); the shells build no window at
  run time. A synthetic JavaScript drag cannot prove it — Tauri's handler takes only real OS drags — so
  the test pins the configuration, and the proof is the owner's hand on the new installer. The
  installer smoke does not perform an OS drag, and adding one is not cheap.
- `turbo.json`'s `test` inputs gain `src-tauri/tauri.conf.json`, because the new tests read it: without
  it a change to the config alone would replay a cached green. **Shared config.**

## §11 G — the name once, in the title bar, with the Apasai logo

- **What "line 2" was:** CG Control's native menu bar — one submenu, titled "CG Control", holding
  Open bridge log, Reload and Quit (`src-tauri/src/main.rs`). Line 3 was the header's brand block
  (`CG CONTROL`), and the Designer's landing page opened with a `cg Designer` heading.
- **Removed:** the menu; the Control header's brand (it pressed nothing, so no function moved) with
  its CSS, token and constant; the Designer landing's brand heading. The menu's three items live on:
  **Quit** is the window's close button (the exit stops the bridge); **Reload** is F5, which the console
  leaves to WebView2 (no key handler takes it); **Open bridge log** is the audit log's `Open log folder`
  — a new shell command, `open_bridge_log`, permitted to the console page only, reached through the
  bridge contract (`audit.canOpenLogFolder` / `openLogFolder`) and absent in a browser.
- **Titles:** both `tauri.conf.json` windows, both pages' `<title>`, the starting page's, and the
  Designer's empty-project tab title read `APASAI CG CONTROL` / `APASAI CG DESIGNER`. The Designer's
  project-open tab title keeps its project name (`D-088`). `productName`, identifiers, installer names
  and folders are unchanged.
- **Icons:** `brand/apasai-icon.svg` is the logo, its content byte for byte, centred on a white rounded
  square — square as an icon must be, and legible on a dark title bar or taskbar, where the logo's
  near-black bars would vanish. That plate is a choice the owner can reverse. `tauri icon` (CLI 2.11.5)
  rendered the five files each bundle references; the same SVG is each page's `/favicon.svg`.
- **Tests:** the window titles and the unchanged names; the pages' titles and favicon; the Control
  header without a brand (control: the channel strip); the Designer landing without one (control: the
  toolbar of an opened project); the log-folder door (control: absent in a browser); and the installer
  smoke reads each app's title bar (`MainWindowTitle`, proven here against a live window and a missing
  one). `turbo.json`'s `test` inputs now hash `index.html`, `brand/**` and `public/favicon.svg` — which
  `splashCss.test.ts` already read without them, a pre-existing instance of the silent-cache hole — and
  `src-tauri/starting/**` for J. **Shared config.**

## §12 I — five rows per band for a new bank

- **What the owner met:** after first-run, `30/30 rows` — twenty template rows, then the ten beds
  below them, out of sight. `firstRunBank` showed EVERY row on purpose: a live install that hides a row
  of unknown occupancy is refused (`untick-unknown`), and first-run read nothing before declaring.
- **Now:** `newChannelBank(channel, occupancy)` (`firstRun/firstRunStation.ts`) — five of each band, the
  highest first (templates 99–95, beds 59–55), the rest hidden, built from the channel's occupancy
  read (`setup.channel-occupancy`, taken after the connection is written and before the declare).
  **How it honours the safety rule at first-run:** a row whose layer the read reports carrying
  anything stays shown; with no reading or an `unknown` one every row is shown; and the bridge still
  judges the install against its own reading — if it refuses a hidden row (`untick-unknown` /
  `untick-occupied`), the console declares every row shown instead (`declareWithFallback`), so the
  default never costs a station its channel. `firstRunBank` is now that unknown case.
- **Where it applies:** first-run (one channel through `set-config`, two or more through `set-banks`),
  and a channel Change channel… adds (only a channel joining the set is read; a kept channel keeps its
  bank). An existing station's saved rows are never touched; the built-in default bank and the schema's
  bed default (`defaultLowBankVisibility`, which old files fall back to) are unchanged.
- **Live plates:** it lists seated plates and shows an empty state otherwise — no band of empty rows —
  so it needs no default.
- **1920 × 1080:** the e2e measures it (the ten rows, the beds in the viewport, no scroll).
