# playout-features — tasks

Every item is FULL LANE (the path to air, the wire, IPC schemas, refusal conditions). Order: D, B, C, A, E.

## 0. Establish and record

- [x] 0.1 The three letters adopted into `docs/integration/playout/` (scanned for credentials first), README rows
- [x] 0.2 `design.md` §0: what the guard refused before this change; the reveal's timing; the backup path;
      the B-292 silence check against a tick error
- [x] 0.3 PRD: `B-298` filed; `R-075`, `R-076`, `R-077`, `B-286` moved to `[~]`; the loopback AMCP limit filed
      under `R-077`; the registry

## 1. D — the CG license (`R-077`)

- [x] 1.1 Fake Playout: `GET /api/cg/license`, D4 `cgLicensed`, presets licensed / `not_included` / cap 1 / `grace`
- [x] 1.2 Bridge: the license reader (60 s, kept when unreachable, `404` not served); D4 `cgLicensed`; both pushed
- [x] 1.3 Bridge: a take refused where CG is not licensed, with the Playout's message; removals pass
- [x] 1.4 B-292's cause: `Cleared by the Playout: its license`
- [x] 1.5 Console: the strip's mark and title; the admin's grace line; the row's refusal line
- [x] 1.6 Tests (bridge integration, dom) and gate; pushed `d5558324` (`pnpm gate` 99/99, 0 cached); CI COMPLETED
      green with its jobs RUN: PR <https://github.com/yasermostafaee/cg/actions/runs/36762704100> — `ci` success,
      `E2E (Playwright)` success, runtime 316 passed (`channel-air.spec` D both), designer 293 passed; Desktop
      <https://github.com/yasermostafaee/cg/actions/runs/36762704499> success

## 2. B — `ownOutputOf` (`B-298`)

- [x] 2.1 Parse and join; the one predicate; picker title; bridge refusal (take, switch, swap)
- [x] 2.1b `B-299` (found on the way): the binding door asks rule 1 and the loop of NEW bindings only
- [x] 2.2 Tests; gate; pushed `f59a9b5c` (B) and `c34cc497` (`B-299`), each `pnpm gate` 99/99, 0 cached; CI
      COMPLETED green with its jobs RUN — B: PR <https://github.com/yasermostafaee/cg/actions/runs/36765058119>
      (E2E RAN: runtime 316, designer 293), Desktop <https://github.com/yasermostafaee/cg/actions/runs/36765058098>;
      `B-299`: PR <https://github.com/yasermostafaee/cg/actions/runs/36767019064> (E2E RAN: runtime 316, designer 293),
      Desktop <https://github.com/yasermostafaee/cg/actions/runs/36767019083>

## 3. C — the playlist output as a box source (`R-075`)

- [x] 3.1 Parse `playlistOf`; the Inputs tab row, its disabled reasons in words
- [x] 3.2 Always `VOLUME 0`: every wire volume, the bridge's refusal of a raise, the ledger's lock
- [x] 3.3 The guard: every targeted verb outside 50–99 unless own; never layer L; no `NEXT`/`BACKGROUND`/`BUFFER`
- [x] 3.4 The reveal: at least two frames of the channel's rate after `PLAY`; pinned
- [x] 3.5 Console: every audio control disabled with the reason; the locked pill
- [x] 3.6 Fake Playout lists `pl-` rows (layer 7); tests; e2e; gate; pushed; CI read — `88df999a`: PR run https://github.com/yasermostafaee/cg/actions/runs/36770857527 (`E2E (Playwright)` RAN: runtime 317 passed, designer 293 passed; `Lint • Typecheck • Test • Build` success); Desktop run https://github.com/yasermostafaee/cg/actions/runs/36770857385 (Installers, Installer smoke and CG Bridge smoke success)

## 4. A — the backup's own clip (`B-286`)

- [x] 4.1 D11 `source`/`fingerprint`; the bound clip keeps its fingerprint
- [x] 4.2 The backup lookup (the backup Playout's D11 `?fingerprint=`), cached, off the take's path
- [x] 4.3 `RedundancyAdapter`: a per-server line, journaled for B; a plate refused on B sends B nothing
- [x] 4.4 The row's line; the renderer
- [x] 4.5 Tests; gate; pushed; CI read — `994dbb4e`: PR run https://github.com/yasermostafaee/cg/actions/runs/36774562884 (`E2E (Playwright)` RAN: runtime 316 passed + 1 flaky, designer 293 passed — the flaky is `first-run.spec.ts:129`, a strict-mode locator race between two first-run panes, green on retry, not this change's; `Lint • Typecheck • Test • Build` success); Desktop run https://github.com/yasermostafaee/cg/actions/runs/36774562745 (Installers, Installer smoke and CG Bridge smoke success)

## 5. E — PGM sound and the VU meter (`R-076`)

- [x] 5.1 Bridge: the ticketed `/pgm/<n>/sound` relay (no `.wav`, octet-stream: a download manager swallows `.wav` + `audio/wav`)
- [x] 5.2 Bridge: the meters stream, read once, relayed per console and per channel
- [x] 5.3 Console: the audio reader (their method); the speaker toggle, remembered
- [x] 5.4 Console: the meter (8 bars and the scale) and the loudness badge; stale reads −60
- [x] 5.5 Fakes: the feed's `/audio.wav`; the fake Playout's meters stream
- [x] 5.6 Tests; e2e with screenshots; gate; pushed; CI read — `0c0c291c` went RED: its PR run https://github.com/yasermostafaee/cg/actions/runs/36782520980 failed `shell-chrome.spec.ts` §C3 on both attempts (the PROGRAM strip 32 px against the reference's 31: the speaker toggle took PVW's 25 px). Fixed forward in `d5f91ca4` (the toggle is the strip's 24 px content box; `programme-sound.spec` pins 31 px off and on; the whole runtime e2e ran locally first; `pnpm gate` 99/99, 0 cached): PR run https://github.com/yasermostafaee/cg/actions/runs/36786735218 (`E2E (Playwright)` RAN: runtime 317 passed + 1 flaky — the pre-existing `first-run.spec.ts:129`, red 3/3 locally at `a8b59df5` too — designer 293 passed; `programme-sound.spec` and `shell-chrome.spec` §C3 passed; `Lint • Typecheck • Test • Build` success); Desktop run https://github.com/yasermostafaee/cg/actions/runs/36786735207 (Installers, Installer smoke and CG Bridge smoke success)

## 6. Close

- [x] 6.1 `pnpm openspec validate --all --strict` (92 passed, 0 failed); the report
      `Claude outputs/REPORT-PLAYOUT-FEATURES-01-v1-<date>.md`
