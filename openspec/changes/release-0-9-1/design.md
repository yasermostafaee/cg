# release-0-9-1 — design

Every fact below was established before building (the prompt's §0s), with its citation. "Measured" means
read from a running system; "inferred" says so.

## §1 — PVW (`B-288`)

1. **Where PVW gets the page today.** `PreviewPanel` asks `window.cg.templates.html(templateId, channel)`
   once per rehearsing row (keyed, not per keystroke — `PreviewPanel.tsx:333-370`) and hands the string to
   `RehearsalStage`, which sets it as each iframe's `srcDoc` (`RehearsalStage.tsx:92-97`).
   `WebSocketRuntime.templates.html` is a deliberately LOCAL read — "the page is already here; never a
   bridge round trip" — of `LibraryStore` (`WebSocketRuntime.ts:1996-1998`), the browser-local library
   (B-085): OPFS, `library/<channel>@<encoded id>.json`, or `library/<encoded id>.json` for a record from
   before per-channel lists (`LibraryStore.ts:46-58`). It is WRITTEN only by an import in that browser
   (`templates.import` → `#library.import`, `WebSocketRuntime.ts:1999-2012`).
2. **Why the copy was missing.** OPFS belongs to one browser profile and one origin, and the bridge's own
   copy was never asked. The four cases:
   - _a fresh browser profile_ — no OPFS record at all: missing, whatever the bridge holds (the e2e
     reproduces it);
   - _imported on one channel, rehearsed on another_ — a per-channel record answers for its own channel
     only (`LibraryStore.#resolve`); a channel whose list was filled by another browser, or by the
     one-time copy of `CHANNEL-TEMPLATES-01`, has no record here: missing;
   - _the installed CG Control `0.9.0` over the older install_ — NOT the upgrade: the app's origin has
     been `http://127.0.0.1:5174/` since the first installer (`sidecar.rs:21`, `42af1a96`) and its
     identifier is unchanged, so WebView2 keeps its OPFS across the upgrade; the copy is missing for every
     template that reached that bridge from another browser (Chrome on the same console port, another
     machine). Not measured on the owner's install, which was not touched;
   - _the web `pnpm dev:station --fake`_ — the station's state is fresh each run, the browser's OPFS is
     not, so templates this browser imported are re-delivered and rehearse; `FIELD-FIXES-01` H's redirect
     sends a page opened at `localhost:5174` to `127.0.0.1:5174`, another origin whose OPFS starts empty.
     **Not a regression** of `CHANNEL-TEMPLATES-01`'s `<id>~<version>` key: `LibraryStore` never carried a
     version. The design itself was the defect.
3. **What PVW needs from the page.** The HTML TEXT, same-origin: RehearsalFrame drives the page's lifecycle
   through the frame's window (`play`/`next`/`stop`, the field update), which a cross-origin `src` would
   forbid. So PVW does not load `/template/<id>~<version>` as a URL; it asks the bridge for the same bytes
   over its control socket. The template server returns the stored HTML verbatim
   (`template-http-server.ts:338-341`), and `CasparRuntime.templateHtml(id, channel)` already returns the
   version the channel lists (`caspar-runtime.ts:12828`) — the page CasparCG gets.

**Decision.** A read-class `templates.page` `{ templateId, channel? }` → `{ ok: true, html }` or
`{ ok: false, reason: 'not-listed' | 'no-file' }`. The console's `templates.page` asks the bridge while the
link is live; only a bridge it cannot reach (down, or a request that fails in flight, or an older bridge
without the route) falls back to `LibraryStore`. A bridge that ANSWERS "no file" is believed — the local
copy is never shown instead, because it may be another version than the one on air. The choice is one
pure function (`pvwPageSource`), which is the unit test. PVW's empty state becomes one line per missing
template, naming it and the reason; "re-import it in this browser" is gone.

## §2 — media audio (`B-289`)

1. **Declared volume 0 and `VOLUME 0` before `PLAY` for a D11 plate — already true.** Seats are written at
   `intent[plateId] ?? CREATED_MUTED_VOLUME` (`caspar-runtime.ts`, the seat step), and a take commits
   `MIXER <ch>-<L> VOLUME 0 DEFER` before each `PLAY` for every plate. Two D10-only halves: the ramp
   (`plateVolumeFrames`, `origin === 'input'`) and the mute before an in-place replace (`mutedInPlace`).
2. **Measured on the owner's CasparCG 2.5.0** (2026-09-29, `pnpm dev:station --fake --caspar
127.0.0.1:5250` in a scratch state folder, the real console driven by Playwright in its own profile; a
   second AMCP client bound to `127.0.0.2` only read `MIXER … VOLUME` and `INFO 1`, and took the channel's
   OSC `/channel/1/mixer/audio/volume` at `127.0.0.2:6250`). Clips with audio: `m1.mkv`, `m2.mkv`, `m4.mkv`
   (AAC, 48 kHz, stereo); none in `skew-*`. Channel 1 has a `system-audio` consumer (its DeckLink consumer
   fails: no drivers). With `m1` in box 2 and a silent clip in box 1:

   | step                   | `MIXER 1-61 VOLUME` | channel peak     | wire (the bridge's AMCP log)                         |
   | ---------------------- | ------------------- | ---------------- | ---------------------------------------------------- |
   | take                   | 0                   | 0                | `VOLUME 0 DEFER` ×2 around `PLAY 1-61`               |
   | AUDIO → ON             | 1                   | ~1.1×10⁸         | `MIXER 1-61 VOLUME 1`                                |
   | `pause` hide / show    | 0 / 1               | 0 / ~1.0×10⁸     | `VOLUME 0 DEFER`+`PAUSE` / `VOLUME 1 DEFER`+`RESUME` |
   | `restart` hide / show  | (cleared) / 1       | 0 / ~1.2×10⁸     | `CLEAR` / `VOLUME 0 DEFER`, `PLAY`, `VOLUME 1 DEFER` |
   | `continue` hide / show | 0 / 1               | 0 / ~1.2×10⁸     | `VOLUME 0 DEFER` / `VOLUME 1 DEFER`                  |
   | PANIC, then ON         | 0, then 1           | 0, then ~1.3×10⁸ | `VOLUME 0`, then `VOLUME 1`                          |

   `INFO 1` before and after: only layers 59–61 changed; nothing outside 50–99. ON while box 2 was hidden
   sent nothing, and the reveal then raised it. ON before the take made the take seat it audible.

3. **What ON sends:** the dialog's `commit({ [plate]: 1 })` → `stack.set-plate-volumes` →
   `setLivePlateVolume`, which sends `MIXER <ch>-<plate layer> VOLUME <v>` to the plate's OWN layer only
   when the ledger holds a record, the plate is not held, and the row owns live seats
   (`caspar-runtime.ts`, the gate); otherwise it records the intent. The owner's own session
   (CasparCG's log 14:25–14:28, his `bridge-audit.ndjson`, read with his consent) shows no raise for 60–61
   and no audio row — audio verbs are not audited — so whether ON was pressed there cannot be settled
   from the records; box 2 hidden by the one-box look (14:27:15 until the CLEAR at 14:28:23) is the one
   state in which a press sends nothing.
4. **PVW audio:** never. Plates are placeholders (`RehearsalStage.tsx:113-122`), and a template's own
   `<video>` is created muted (`scene-builder.ts:1254`, `c41bba8e`, 2026-07-23). Unchanged — PFL is a
   later feature with its own CasparCG channel.

**Decision.** `startsSilentFromPlayout(origin)` (`'input' | 'media'`) — the one predicate both halves ask.

## §3 — taskbar icons (`B-290`)

1. The window icon (title bar, taskbar, Alt+Tab) is Tauri's default window icon, built from `bundle.icon`;
   nothing sets one at run time (no `set_icon` anywhere). The shortcut's icon is the exe's own resource
   (Tauri's NSIS `CreateShortcut` names no icon). **All five icon files of the two apps are
   byte-identical** since `f9c9b816` (`FIELD-FIXES-01` G, `B-281`) — the cause. The first installer
   (`42af1a96`) gave CG Control a dark tile and CG Designer a light one, both from the Apasai logo; the
   shortcuts the owner sees still show those (Windows' icon cache — inferred).
2. Identifiers `app.cgbroadcast.control` and `app.cgbroadcast.designer`, unchanged since `42af1a96`. Tauri
   2.11.5's NSIS sets each shortcut's AppUserModelID to its bundle identifier (`utils.nsh`
   `SetLnkAppUserModelId`); neither process sets one (Tauri's only AUMID code is the bundler's). They do
   not share one.

**Decision.** Each app's own icon set again: `42af1a96`'s dark tile for CG Control, its light tile for CG
Designer. No Rust change (none is needed, and `cargo` is not on this host — CI builds the apps).

## §4 — Help → About (`D-161`)

The menu bar exists (`TopToolbar.tsx`, D-008: Home / File / Edit / View / Help) and Help already lists
`About`, disabled. It opens a dialog through the shell's `Modal`, reading `APP_VERSION` / `APP_BUILD`
(`appVersion.ts`, the build stamp the start screen reads).

## §5 — release (`P-060`)

- **Where the space came from (A2):** the installer job writes `installers/SHA256SUMS.txt` over Tauri's
  built names (`CG Control_<v>_x64-setup.exe`) and uploads it inside BOTH CI artifacts
  (`desktop.yml`, "Collect the installers", "Upload CG Control/Designer"); the draft's own file (assembled
  by `release-files.mjs`) already used the release names. Read back from the `v0.9.0` draft: three lines,
  hyphenated. So the job's file goes; the release's is the only `SHA256SUMS.txt`.
- The release job checks the sums after upload: every line names an uploaded asset, every asset but the
  sums is listed, and each hash matches the file uploaded (and GitHub's own asset digest, when it reports
  one). `release-files.mjs verify`; its control: a wrong name fails.

## §7 — rows at start (`B-291`)

By design until now: `R-070` changed only the NEW bank and kept a saved one as written (`R-070`,
`default-bank-boot.integration.test.ts`); a first-run that could not read occupancy within 3 s saves every
row shown (`firstRunStation.ts`, `declareWithFallback`). The bank file has no version and no provenance
field; its one signature is the SHAPE: an operator's Apply writes hidden rows only (`false` keys), while
first-run writes every key, so every template row an explicit `true` means "never applied".

**Decision.** `isUnappliedAllShownBank` (that shape) and `fiveRowVisibility(bank, occupied)` (the rule,
moved from the console to `@cg/shared-ipc` so first-run and the bridge share it). The bridge brings such a
bank in ONCE: it waits until `channelOccupancy` is known (never `unknown`), keeps every occupied row
shown, applies through `setFixedLayerBanks` — whose validator still hides a row only while it reads empty
— re-checks that nobody changed the banks meanwhile, persists, and says so on its log. The result carries
`false` keys, so it can never match again.

## §8 — channel dots

No change. Only D4's `output` sets the dot (`OutputDot.tsx:19`, `runtime-ui` "the playlist state SHALL
NEVER change a colour"); `on-air` with `playlist: stopped` is already green (`channel-air.spec.ts`). D4
does tell the two apart (`PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §1.1–§1.2: "a stopped playlist … is still
`on-air`"). A grey ring is D4's `off` — for `cg-test2`, the "not to air" flag we asked the Playout to set
(`CG-CONTROL-REPLY-V13-STATE-2026-09-27.md`).

## B1–B3 — our layer cleared from outside (`B-292`)

1. **"Goes silent" — cited, not inferred.** CasparCG 2.5.0: `CLEAR <ch>-<L>` erases the layer
   (`src/core/producer/stage.cpp:314-316`, `layers_.erase(index)`), and the monitor (OSC) state is rebuilt
   every tick from the layers that exist (`:219-223`) — so a cleared layer is simply no longer reported. A
   STOPPED layer still exists and reports `producer "empty"` (`layer.cpp:100-102`, `:131-134`). Measured on
   the plant's core: "`CLEAR` destroys it (OSC goes silent)" (`docs/recon/2026-09-22-apasai-core-validation.md`
   §5). The mock sent `producer "empty"` for every layer it had ever touched (`osc-emitter.ts`), which is
   why no test saw the gap.
2. **`INFO` in the real 2.5 shape.** `INFO <ch>-<L>` answers `201 INFO OK` and the WHOLE channel — the
   layer is ignored (`AMCPCommandsImpl.cpp:1507-1535`, `info_channel_command`); each live layer is
   `<stage><layer><layer_N>…<foreground><producer>…` (`tools/caspar-amcp-probe/evidence/casparcg-2.5.0-
6b29237-apasai-core/b3-info-2-80-on-air.ndjson`), and a channel with none has no `<stage>` at all
   (`b5-teardown-info.ndjson`). The mock answered `INFO 2-80` with `404` and never carried `<stage>`.
3. Why A kept ON AIR: a row turns idle only on an explicit `empty` (`reconciler.ts`, `freshTruth`), and the
   only silence-as-empty reconcile ran on a reconnect. Why B's CLEAR left the plates: they were not in B's
   ledger, `layers.clear` refused them as non-`html` (`R-015`), and a row CLEAR refuses layers outside the
   declared rows.

**Decisions.** (1) Silence is a question: a layer we hold on air that reported a producer and has then
been silent for 1 s, while its channel still reports frames (`/channel/N/framerate` within 500 ms), gets
ONE read per silence — never a poll, never for a channel that is quiet as a whole (golden rule 8). 1 s
because the core reports every live layer every frame (25–50 times a second), so a second of silence is
dozens of missed reports, while the owner's target is 2 s. The rule is the pure `silentLayersToAsk`
(`tools/caspar-bridge/src/silent-layer-question.ts`), unit-tested with a positive control beside each
refusal. (2) The read is `INFO <ch>`, not the `INFO <ch>-<L>` the delta named: the core ignores the layer
and answers the whole channel (fact 2 above), and the bridge's own guard refuses layer-addressed `INFO`
wire text (`BRIDGE-TRUTH-01` §3, `tests/info-readers.test.ts` — the first spelling tripped it), so the
channel form is the same reply, spelled truthfully, and one read answers every silent layer of the channel.
It goes to the primary only (`mirror: false`, unjournaled), at `low` priority so a take never queues
behind it, with a 2 s timeout; no answer changes nothing. (3) An answer without the layer takes the item
off air through the reconnect's own reset (`Reconciler.markLayersEmptied`, one spelling with
`reconcileOnReconnect`) and drops a plate's seat through `reconcileLiveLayers`; the layer is published on
`layers.cleared-outside` for the notice; nothing is re-sent or put back. Measured in
`media-plates.integration.test.ts` (a foreign `CLEAR` of the page and one plate on a raw second client):
1098, 1099, 1123, 1153, 1097 and 1147 ms from the clear to the row off air — against the 2 s target.
(4) `R-015`'s rule is narrowed inside the three bands: a layer in 50–99 that no ledger record and no stack
item holds may be cleared, whatever its producer, through `layers.clear`; outside them nothing changes
(below 50 is refused as a request, `FOLLOWUPS-01` B; above 99 a non-`html` producer is still `foreign`).
`inAnyLayerBand` (`@cg/shared-ipc`) is the one predicate the bridge's door, the strip's CLEAR and the
offline mock all read; `isInCgBands` stays the floor-and-up rule the strips speak for. (5) The strip:
a CLEAR on every listed row inside 50–99, and CLEAR ALL LISTED on a strip that lists two or more of them —
one confirmation naming each layer, then one `layers.clear` per layer in turn (with one there is nothing
for it to add to the row's own CLEAR). (6) The mock drops a cleared layer from OSC and from `INFO`, and
keeps its mixer state (the core keeps `tweens_` across a `CLEAR`).

**What the faithful mock broke (B2), and how.** 30 tests in 22 files went red the moment the mock stopped
answering `empty` for a cleared layer (the list is in the report). None was edited, none deleted: every
one was right about the product, and the product was what relied on `empty`. 28 read the bridge's OWN
`CLEAR` through that `empty`; the bridge now counts its own acknowledged `CLEAR <ch>-<L>` (a `202` reply)
as the layer emptied — `acknowledgedClearOf` → `OscTransport.noteCleared` → the reconciler — which is a
fact, not a guess. The other 2 (`route-plates`, a core restart) showed the reply-watcher going deaf after
a reconnect: `ServerSession` builds a new command queue per connection and the watcher was on the first
one. `ServerSession` now forwards every queue's `exchange` — which also fixed the AMCP wire log, silent
after any reconnect since it was written (`amcp-log.integration.test.ts`, red first). Two OTHER tests
asserted `layers.clear` refusing a non-`html` bank layer as `foreign` (`clear-bank-scoped`,
`declared-layer-classes`); (4) superseded them, and they now assert the clear, with the below-the-bands
refusal kept as their control.

**The offline mock.** Test mode has no CasparCG and no second client, so `layers.cleared-outside` is
honestly always empty there. Its `clearLayer` follows (4): a bank row's listed orphan counts as its
observation, as the bridge's sweep lists foreign producers on bank rows.

## B6

What station B showed at its start is recorded as UNCONFIRMED; nothing is built for it.
