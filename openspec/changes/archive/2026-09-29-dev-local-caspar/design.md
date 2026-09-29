# dev-local-caspar — design

## §0 — Established first

CasparCG sources are read at the tag the owner's core reports (`VERSION` = `2.5.0 69e8ad5 Stable`,
measured 2026-09-28): `CasparCG/server` `v2.5.0-stable` is commit `69e8ad5` (2025-12-10). The Windows
package bundles the media scanner current at that build — `CasparCG/media-scanner` `v1.3.4`
(2024-02-02; `v1.4.0` came 2026-03-09) — through `.github/workflows/windows.yml` ("Download
media-scanner", `latest: true`) and `tools/windows/package.bat`.

### 0.1 How `dev:station --fake` wires the bridge to the mock, and where a real target plugs in

- `dev-station-cli.mjs` `startFake()` loads `fake-station.ts` by path and runs `startFakeStation`: the
  fake Playout (`sealOnLoopback: false`, the admin granted channels 1 and 2 of `127.0.0.1`), the mock on
  `127.0.0.1:5250` with OSC to `127.0.0.1:6250` and `admit` wired to the Playout's allow list, and the
  programme feeds on 9250/9251.
- The bridge is started with the Playout's address and `--first-run`, and deliberately with NO
  `--caspar-host`/`--amcp-port`/`--osc-port` (`station-plan.mjs` `bridgeArgs`): any of them makes the
  bridge build its connection from flags (`bin/caspar-bridge.mjs` 371–406).
- The CasparCG target is therefore learned from D4: first-run writes server A as the chosen row's
  `casparHost` on the STANDARD ports — `AMCP_PORT` 5250, `OSC_PORT` 6250 — whatever else D4 says
  (`firstRunConnection`, 118–130, in `apps/runtime/src/renderer/features/firstRun/firstRunStation.ts`).
- So a real core plugs in by starting NO mock and letting D4 name its host. Two consequences:
  - a core on any port but 5250 could never be the one the bridge dials: `--caspar` takes 5250 only;
  - the bridge rewrites no loopback `casparHost` when the Playout is itself on loopback
    (`playout-catalogue.ts` `resolveCasparHost`, 136–139), so a D4 row saying `::1` or `localhost` would
    reach first-run verbatim — and a 2.5.0 core listens for AMCP on IPv4 only
    (`src/protocol/util/AsyncEventServer.cpp:285`, `tcp::endpoint(tcp::v4(), port)`). Every accepted
    spelling therefore becomes `127.0.0.1`, in D4, in the grants and in the start's reads.

### 0.2 The media folder, and the absolute path of a `CLS` entry, on 2.5.0

- `INFO PATHS` answers `201 INFO PATHS OK` and one XML chunk (boost `write_xml`, bare `\n` inside,
  `\r\n` after it) with `media-path` and `initial-path` among others
  (`src/protocol/amcp/AMCPCommandsImpl.cpp` `info_paths_command`, 1564–1583).
- `media-path` is the config's own value (`src/common/env.cpp` `configure`, 109–126): a relative one
  stays relative — the stock config says `media/` (`src/shell/casparcg.config` 5). `initial-path` is
  the start folder (`boost::filesystem::initial_path()`) with `/` appended (`info_paths_command` 1572);
  on Windows it keeps its backslashes. The absolute folder is `media-path` when absolute, else
  `initial-path` + `media-path`, with every `\` made `/`.
- `CLS` (`AMCPCommandsImpl.cpp` `cls_command` 1468, `make_request` 1429–1437) is NOT listed by the core:
  it relays the media scanner's HTTP `/cls` body verbatim (`configuration.amcp.media-server`, default
  `127.0.0.1:8000`, `src/shell/server.cpp` 419–420), and answers `501 CLS FAILED` when the scanner does
  not answer. Measured on the owner's core on 2026-09-28: `501 CLS FAILED` — no scanner was running.
  The scanner starts beside the core only through the package's restart script,
  `src/shell/casparcg_auto_restart.bat`: `IF EXIST scanner.exe (start scanner.exe)`.
- One `CLS` line (scanner `src/ffmpeg.ts` `generateCinf`, 139–148):
  `"<ID>"  MOVIE  <bytes> <YYYYMMDDHHmmss> <frames> <num>/<den>` — the type carries a space each side
  and is joined with `' '`, so two spaces flank it. `<ID>` (scanner `src/util.ts` `getId`, 5–11) is the
  path under the media folder with its LAST extension removed, `\` → `/`, UPPER-CASED. `frames` is
  `floor(duration × den / num)`, so the length is `frames × num / den` seconds; a still is `0 0/1`.
- The absolute clip path is the media folder + `<ID>` — without its extension, which `CLS` dropped. A
  2.5.0 core plays it: `ffmpeg_producer.cpp` `create_producer` (286–292) calls
  `find_file_within_dir_or_absolute`, which tries the path as absolute first, and `probe_path` matches a
  directory entry whose STEM equals the leaf, ignoring case (`src/common/filesystem.cpp` 33–77).
- The bridge sends the clip with `quote()` (`command-builder.ts` 711–712), which quadruples a backslash
  (`@cg/caspar-client` `escape.ts` 60–62): the path must hold `/` only.

### 0.3 OSC to an AMCP client, by default, and on which port

Yes, on 6250. `src/shell/server.cpp` `setup_osc` (311–341) reads `configuration.osc.default-port`
(6250 when absent) and `configuration.osc.disable-send-to-amcp-clients` (false when absent) and, unless
disabled, subscribes each AMCP client's IPv4 address on that port for as long as its connection lasts;
the stock config sets neither (`casparcg.config` 1–32). The station's bridge listens on 6250 (first-run's
`OSC_PORT`), so the remaining time shows. The start reads `INFO CONFIG` and says in one line when the
core's own config turns it off or moves it — and changes no config.

### 0.4 How the fake Playout builds D4 and D11, and the smallest change

- D4: `#catalogue`, replaceable with `setChannels(rows)` — enough as it stands.
- D10: `setInputs([])` — enough as it stands.
- D11: a private `#library` built from `fakeMediaLibrary()` with no setter. The smallest change is
  `setMedia(items)` (replace the whole library) and one option, `beforeMediaSearch`, awaited before a
  D11 SEARCH is answered — never before an `ids=` read, whose budget in the bridge is 1.5 s
  (`RETRY_READ_TIMEOUT_MS`) where a search has 5 s (`MEDIA_SEARCH_TIMEOUT_MS`). A media item may now be a
  `still` and may have no `durationMs`, so a still never reads "0:00" in the picker.

## Decisions

- **The composition lives beside `fake-station.ts`** (`tests/support/local-caspar-station.ts`): the dev
  station loads it by path under type stripping, and the bridge's suite drives the same function against
  the mock. Only type imports of its siblings; the fake Playout arrives as an argument.
- **The one loopback rule** is `parseCasparTarget` there. The launcher's `parseArgs` only carries the
  typed value; the launcher asks the rule before it probes, builds or starts anything.
- **Five reads and nothing else.** `readCore` refuses any command outside `LOCAL_CASPAR_READS` before a
  connection opens, reads on one connection, and stops asking after a `400` (which carries the refused
  line after it) or a line that is not AMCP.
- **D11 ids** are `lc-` + a hash of the scanner's ID: the same on every read, so a binding survives a
  re-read, and the contract's shape (`[A-Za-z0-9_-]{1,48}`).
- **`updatedAt`** is the scanner's local time read in this machine's zone — the flag takes loopback
  only, so the scanner's machine is this one.
- **A re-read never empties the list**: a failed one keeps the last library; two searches at once share
  one re-read; a re-read is bounded under the search's 5 s.
- **The state folder is `fake-local`**, beside `fake`, so the two kinds of run never replace each other's
  `.previous`.
- **A start that cannot start is one line** in the sequence, for `--fake` as for `--caspar`.
- **Ctrl+C leaves what is on air on the core** (the bridge's shutdown clears no layer); the banner says
  so, since the core outlives the station.
