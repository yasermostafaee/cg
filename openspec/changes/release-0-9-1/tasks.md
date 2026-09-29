# release-0-9-1 — tasks

## 0. Filed

- [x] 0.1 `B-288`…`B-292`, `D-161`, `P-060`, `R-075`…`R-077` filed; `R-068` notes `CENTRAL-BRIDGE-01`;
      the registry records the numbers.
- [x] 0.2 §0 established for every item (`design.md`), including the live audio run on the owner's
      CasparCG.

## 1. PVW from the bridge's store (`B-288`)

- [x] 1.1 `@cg/shared-ipc`: `templates.page` (read-class) — `{ ok: true, html }` or
      `{ ok: false, reason: 'not-listed' | 'no-file' }`.
- [x] 1.2 Bridge route → `CasparRuntime.templatePage(id, channel)`; integration test (listed; not listed;
      listed with no file).
- [x] 1.3 Console: `templates.page` asks the bridge first; `LibraryStore` only when the bridge cannot be
      reached (`pvwPageSource`, unit-tested); the mock bridge answers the same shape.
- [x] 1.4 PVW: one line per missing template, naming it and the reason; "re-import it in this browser"
      gone (swept by string and by component).
- [x] 1.5 e2e: profile A imports; a fresh profile B rehearses; control: the file gone from the bridge's
      store → the one line.

## 2. A media plate starts silent and rises by the ramp (`B-289`)

- [x] 2.1 `startsSilentFromPlayout` — the one predicate for `mutedInPlace` and `plateVolumeFrames`;
      `PLATE_VOLUME_RAMP_FRAMES` (renamed from `D10_VOLUME_RAMP_FRAMES`).
- [x] 2.2 `media-plates.integration.test.ts`: `VOLUME 0` before `PLAY`; ON → `VOLUME 1 25` on the plate's
      layer; a `pause` switch-away sends 0 and back the declared volume by the ramp; control: the page
      layer's `VOLUME 1`. The `pause` reveal pin moved to the ramp.
- [x] 2.3 `playout-sources.integration.test.ts`: the media control ("no in-place mute and no ramp")
      superseded — a media swap is muted before its `PLAY` and ramps back; control: no origin keeps the
      bare line. Full bridge suite green (157 files, 1453 tests).
- [x] 2.4 After the fix, the same live run on the owner's CasparCG (2026-09-29 19:00Z, `44905af2`): the
      take `VOLUME 0 DEFER` before `PLAY`; ON → `MIXER 1-61 VOLUME 1 25`, the channel's peak 0 → ~1.27×10⁸;
      each reveal (`pause`, `restart`, `continue`) → `VOLUME 1 25 DEFER`, heard; PANIC → `VOLUME 0` at
      once, ON again → `VOLUME 1 25`; `INFO 1` changed on 59–61 only, and ended empty.

## 3. Each app its own icon (`B-290`)

- [x] 3.1 CG Control: `42af1a96`'s dark icon set; CG Designer: its light set (restored byte for byte).
- [ ] 3.2 The clean-Windows smoke reads each installed exe's icon, each shortcut's icon and each
      shortcut's AppUserModelID; control: the two apps' values differ. Written
      (`app-identity.mjs`, the drive phase's `identities` step; `installerAppIdentity.test.ts`); the
      smoke's run on the pushed commit is owed.

## 4. Help → About (`D-161`)

- [ ] 4.1 Help → About enabled; a dialog names `CG Designer`, `Version <release>` and the build.
- [ ] 4.2 dom spec: opens Help → About and reads the version through `tools/release`; control: a planted
      wrong version fails; `turbo.json` hashes what the spec reads.

## 5. Release `0.9.1` (`P-060`)

- [ ] 5.1 No `SHA256SUMS.txt` in the installer job's artifacts.
- [ ] 5.2 `release-files.mjs verify` + the release job's check against the uploaded assets; control: a
      wrong name fails.
- [ ] 5.3 `0.9.1` in all nine files; `docs/release/0.9.1/` guide with the known limit (one channel, one
      CG Control); `P-031`'s floor at `0.9.1`.
- [ ] 5.4 Tag `v0.9.1` → a draft with the four files, read back; the `v0.9.0` draft retitled
      `v0.9.0 — superseded, do not use`, still a draft.

## 7. Rows at start (`B-291`)

- [x] 7.1 `@cg/shared-ipc`: `fiveRowVisibility`, `isUnappliedAllShownBank`; first-run's `newChannelBank`
      uses them.
- [x] 7.2 The bridge brings an unapplied all-shown bank in once, when occupancy is known, through
      `setFixedLayerBanks`, and persists it.
- [x] 7.3 Tests: an old-shape bank opens as 5 + 5; control: an occupied row 90 stays shown; control:
      occupancy unknown changes nothing (`default-bank-boot` reworded, not deleted).

## 8. Channel dots

- [x] 8.1 No change — established in `design.md` §8.

## 9. Our layer cleared from outside (`B-292`)

- [x] 9.1 `@cg/amcp-mock`: a cleared layer goes silent on OSC (mixer state kept); `INFO <ch>` and
      `INFO <ch>-<L>` answer per-layer stage data in the 2.5 shape (`stage-fidelity.test.ts`). The 30
      tests (22 files) that went red were fixed in the PRODUCT, none edited or deleted: the bridge counts
      its own acknowledged `CLEAR`, and `ServerSession` forwards every queue's `exchange` (which also
      fixed the AMCP log after a reconnect). Listed in `design.md` and the report. `b7844d2f`.
- [x] 9.2 Bridge: a silent layer we hold on air → one `INFO <ch>` read (the channel form — `design.md`
      B1–B3 (2)) → off air, published on `layers.cleared-outside`; nothing re-sent. The rule is
      `silentLayersToAsk` (unit-tested: a quiet channel is never asked, one question per silence).
      Measured 1098–1153 ms over six runs, clear to row.
- [x] 9.3 Strip: a CLEAR on every listed layer in 50–99 whatever its producer, CLEAR ALL LISTED with two
      or more (one confirm, one `CLEAR` per layer), and the "cleared outside CG Control" strip; one
      predicate (`inAnyLayerBand`) for the bridge's door, the strip and the mock; refusals unchanged
      outside 50–99.
- [x] 9.4 Tests: foreign `CLEAR` of a page and one plate (control: the other plate and another item stay
      ON AIR); a leftover plate listed and cleared (controls: a ledger plate is not listed and is refused
      `live-source`; a video on 120 is refused `foreign`) — `media-plates.integration.test.ts`. Console:
      `orphanLayersBanner.dom.test.ts`; e2e `layers-cleared-outside.spec.ts` (one real bridge, one raw
      AMCP client) and `orphan-layers.spec.ts` (its two "no Clear on 1-90" pins superseded). Red first:
      the silence question disarmed, and R-015 un-narrowed, each turns its test red.

## 10. Gate, CI, report

- [ ] 10.1 `pnpm gate` green per push; `openspec validate --all --strict`.
- [ ] 10.2 CI: `e2e`, installers and smoke COMPLETED green with the jobs RAN — run URLs beside the tasks.
- [ ] 10.3 Report `Claude outputs/REPORT-RELEASE-091-01-v2-2026-09-29.md`.
