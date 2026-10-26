# Tasks — 0.12.2 installer candidate

Lane: **FULL**

## 1. Record the candidate

- [x] 1.1 File `P-070` and register the identifier
- [x] 1.2 Author the proposal, design, desktop-delivery delta and evidence checklist
- [x] 1.3 Strict-validate the active change

## 2. Version and guide

- [x] 2.1 Move all nine release-version sources and the release-version regression pin to `0.12.2`
- [x] 2.2 Add the Persian `0.12.2` guide with exact filenames: all three are applied over the owner's `0.11.6`;
      over a complete `0.12.1` set, CG Bridge and CG Control are required and Designer is optional
- [x] 2.3 Run preliminary `guide-shots` from a pushed `0.12.2` ref, replace the version-bearing pictures and
      record that run URL here — [Desktop run 40314018361](https://github.com/yasermostafaee/cg/actions/runs/40314018361),
      using `guide-shots`, `setup-window-windows-2025` and the successful `acceptance-upgrade-0116` artifact
- [x] 2.4 Build and test the final guide, including its version-bearing text and image references — 6-page A4 PDF,
      visually reviewed from all six rendered pages; release suite 79/79 green

## 3. Gates and final Windows build

- [x] 3.1 Run the full local gate and retain its green log reference — `.gate-logs/gate-20261026T115628Z-4712.log`:
      103/103 Turbo tasks green with zero cache, strict OpenSpec 93/93, footer `exit 0` after 692.1 s
- [x] 3.2 Push the complete candidate `2acfb2e5cc200cfe639cd7970172207a6a3e416a` to `dev`; both the full CI job
      and the Playwright E2E job ran and passed in [Linux run 40320200025](https://github.com/yasermostafaee/cg/actions/runs/40320200025)
- [x] 3.3 Desktop ran on that exact commit in [run 40320200024](https://github.com/yasermostafaee/cg/actions/runs/40320200024):
      all 14 applicable installer, setup-window, smoke, fresh-install and upgrade jobs passed, including the apps-open
      `0.11.6` upgrade; only the request-only guide screenshots and tag-only draft release were skipped as designed

## 4. Handoff and closure

- [x] 4.1 Download CG Control, CG Designer and CG Bridge from final Desktop run `40320200024` and assemble exactly
      the three release-named installers, final PDF and `SHA256SUMS.txt` in untracked `installers-ci-0.12.2/`; the
      release verifier reports `SHA256SUMS.txt matches every asset the release holds`
- [x] 4.2 Final installers: `CG-Bridge_0.12.2_x64-setup.exe` — 24,892,376 bytes —
      `20c9bc445944c0d74783d266423ae668c297a6680e6388934ad9088824b6140f`; `CG-Control_0.12.2_x64-setup.exe` —
      221,486,130 bytes — `6ee30a923c8c2b09253ad50e1971fa59bceb7b03101440399116c0f6218708b1`;
      `CG-Designer_0.12.2_x64-setup.exe` — 230,076,313 bytes —
      `db77e175599b4524c68accd11dc5a64874e5ee0f4f804325b25a420fc33b93ac`
- [x] 4.3 Hand over all three, installed in the order CG Bridge → CG Control → CG Designer, for the owner's `0.11.6`
      upgrade; a station with the complete `0.12.1` set requires CG Bridge and CG Control, while Designer is optional
- [x] 4.4 Confirmed no `v0.12.2` tag and no draft or published `v0.12.2` release exist; archive this change only
      after the owner confirms the handoff
