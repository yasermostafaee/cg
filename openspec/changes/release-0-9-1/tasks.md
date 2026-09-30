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
- [x] 3.2 The clean-Windows smoke reads each installed exe's icon, each shortcut's icon and each
      shortcut's AppUserModelID; control: the two apps' values differ (`app-identity.mjs`, the drive
      phase's `identities` step; `installerAppIdentity.test.ts`). **Ran on `cfad5d6b`**, Desktop run
      https://github.com/yasermostafaee/cg/actions/runs/36634928239 (installers + all three smoke phases
      success, 63/63 checks): exe icons `fa1bfbc8…` (CG Control) / `3f0f4d76…` (CG Designer); the Start and
      desktop shortcuts of each show their own exe's icon and carry `app.cgbroadcast.control` /
      `app.cgbroadcast.designer` (read from the shortcut itself); Installed apps names each app's own exe;
      the three controls pass.

CI read for the commits already pushed (step level, jobs RAN): `4b247b54` (§2, §7) — PR
https://github.com/yasermostafaee/cg/actions/runs/36618175517 (E2E step success), Desktop
https://github.com/yasermostafaee/cg/actions/runs/36618175551 (installers + smoke success);
`9f04b1eb` (§1, B2, B-292) — PR https://github.com/yasermostafaee/cg/actions/runs/36630372512 (E2E step
success), Desktop https://github.com/yasermostafaee/cg/actions/runs/36630372380 (installers + all three
smoke phases success; draft skipped, not a tag).

## 4. Help → About (`D-161`)

- [x] 4.1 Help → About enabled; a dialog names `CG Designer`, `Version <release>` and the build
      (`AboutModal.tsx`, three `Tag`s; closes by its own close and Escape).
- [x] 4.2 dom spec `about-version.dom.test.ts`: opens Help → About through the toolbar and reads the
      version through `tools/release` (`releaseVersion`); control: a dialog planted with `0.0.1` fails
      the same check; red first (About disabled again → red). `turbo.json` gains `@cg/designer#test`,
      hashing `release-version.mjs` and the seven version files outside the app (dry run: all seven
      hashed). e2e `app-version.spec.ts` adds the dialog in the built app (local Windows pass; the
      Linux run is owed).

## 5. Release `0.9.1` (`P-060`)

- [x] 5.1 No `SHA256SUMS.txt` in the installer job's artifacts (its hashes go to the job's log only).
      Read in run https://github.com/yasermostafaee/cg/actions/runs/36634928239 (`cfad5d6b`): both
      installers built as `0.9.1`, the hashes printed, and each upload "there will be 1 file uploaded".
- [x] 5.2 `release-files.mjs verify` (`sumsProblems`, `verifyDownloaded`) + the release job's step after
      the read-back: `gh release download` + `gh release view --json assets` → `verify`. Control: the
      `0.9.0` job's own sums (`CG Control_0.9.1_x64-setup.exe`, a space) fails naming line 2; red first
      (a name-blind check → red). Rehearsed read-only against the `v0.9.0` draft: a draft downloads by
      its tag, and the guide's line verifies against GitHub's bytes; `gh` 2.71 reports no `digest`, so
      that half applies only where a newer `gh` gives one.
- [x] 5.3 `0.9.1` in all nine files (`release-version.mjs` reads `0.9.1` and accepts `v0.9.1`; its test
      pin moved with it); `docs/release/0.9.1/` guide — the known limit (one CG Control per channel), and
      Help → About for the Designer's version, both labels checked by `guide.test.ts`; `P-031`'s floor
      left OPEN — the owner, 2026-09-30: `CENTRAL-BRIDGE-01` sets it at `0.10.0` (§5 had said `0.9.1`).
- [x] 5.4 Tag `v0.9.1` → a draft with the four files, read back; the `v0.9.0` draft retitled
      `v0.9.0 — superseded, do not use`, still a draft.
      Tag `v0.9.1` (annotated) → `cfad5d6b`. Run https://github.com/yasermostafaee/cg/actions/runs/36638504802
      — installers, smoke and `Draft release` success, every step run; its new step printed "SHA256SUMS.txt
      matches every asset the release holds". The draft, read back from outside CI:
      https://github.com/yasermostafaee/cg/releases/tag/untagged-4d853e2c1ce249813637 —
      `APASAI CG 0.9.1 (test build)`, draft, pre-release, tag `v0.9.1`: `CG-Control_0.9.1_x64-setup.exe` 240,555,030 ·
      `CG-Designer_0.9.1_x64-setup.exe` 226,312,074 · `APASAI-CG-0.9.1-install-guide-fa.pdf` 168,492 ·
      `SHA256SUMS.txt` 298. All four downloaded here and `verify` run on them: every line matches; both
      installers' version resource is `0.9.1`; the guide is 2 pages with Vazirmatn embedded. The `v0.9.0`
      draft: title `v0.9.0 — superseded, do not use`, still a draft and a pre-release with its four files
      (read back; GitHub moved its draft link to
      https://github.com/yasermostafaee/cg/releases/tag/untagged-19fc726d8fd1565f99f8).

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

- [x] 9.5 **Live, on the owner's CasparCG 2.5.0** (`127.0.0.1:5250`, `69e8ad5`, 2026-09-30, at the
      owner's request; `pnpm dev:station --fake --caspar 127.0.0.1:5250` from a scratch home, the real
      console driven by Playwright). A second raw AMCP client bound to `127.0.0.2` sent ONE `CLEAR 1-99`
      per run to row 99's page — five runs: the row idle in the console after **1124, 1133, 1167, 1215
      and 1284 ms (median 1167)**; the bridge decided after 1092–1253 ms, one `INFO 1` its only line,
      nothing re-sent in any run; the strip on screen after 1108–1269 ms. Channel 1 empty before and
      after. **The operator's re-take after a foreign clear was broken, and is fixed:** preparing the
      run, a read of the take path showed the bridge's `#loaded` record surviving the clear, so the
      re-take `CG PLAY`ed the emptied layer — red first in `media-plates.integration.test.ts`
      (`CG 2-99 PLAY 0`, no `ADD`); the clear now forgets it, as the operator's own clear does. Runs
      2–5 were such re-takes: `CG 1-99 ADD` then `PLAY`, the page back on the stage each time.

## 10. Gate, CI, report

- [x] 10.1 `pnpm gate` green per push (the pre-push gate: 99/99 tasks for `9f04b1eb` and for `cfad5d6b`,
      control-bytes clean); `openspec validate --all --strict` — 92 passed.
- [x] 10.2 CI: `e2e`, installers and smoke COMPLETED green with the jobs RAN — run URLs beside the tasks.
      The release commit `cfad5d6b` (it carries every change above): PR
      https://github.com/yasermostafaee/cg/actions/runs/36634928228 — the `E2E` step ran and passed
      (runtime 310 passed, designer 293 passed; among them `layers-cleared-outside.spec.ts`,
      `orphan-layers.spec.ts`, `pvw-from-bridge.spec.ts` and the Designer's Help → About); Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36634928239 — installers and all three smoke
      phases (63/63).
- [x] 10.3 Report `Claude outputs/REPORT-RELEASE-091-01-v2-2026-09-30.md` (`v2`: the prompt is v2, though
      its text names `-v1-`).
