# Tasks — 0.12.1 installer candidate

Lane: **FULL**

## 1. Record and version

- [x] 1.1 File `P-068` and this OpenSpec; keep the `0.11.4` compatibility floor unchanged
- [x] 1.2 Move all nine version sources and the release-version pin to `0.12.1`
- [x] 1.3 Strict-validate the active change

## 2. Current guide evidence

- [x] 2.1 Run Desktop on the temporary branch to obtain real setup and app screenshots
      ([run 40251651277](https://github.com/yasermostafaee/cg/actions/runs/40251651277), 16/16 jobs green)
- [x] 2.2 Add the `0.12.1` Persian guide, preserving the book re-export floor of `0.12.0`
- [x] 2.3 Prove the guide keeps the prior six-page layout, every quoted label is current and version-bearing
      images are fresh (`@cg/release`: 79/79 tests green)

## 3. Gates and final Windows build

- [x] 3.1 Full local gate green and strict OpenSpec validation green
      (`gate-20261026T020752Z-13868.log`: 103/103 tasks green; OpenSpec: 90/90)
- [x] 3.2 Push the complete candidate to `dev`; Linux CI including E2E green
      ([run 40258454645](https://github.com/yasermostafaee/cg/actions/runs/40258454645), 5/5 jobs green)
- [x] 3.3 Manual Desktop run green: installers, setup window, guide shots, fresh install, bridge/app smokes and
      every upgrade acceptance, including `0.11.6` with both apps open
      ([run 40260874571](https://github.com/yasermostafaee/cg/actions/runs/40260874571), all 15 applicable jobs
      green; the tag-only draft-release job skipped by design)

## 4. Handoff and closure

- [x] 4.1 Download final CG Control and CG Designer installers into an untracked `installers-ci-0.12.1/`
- [x] 4.2 Record exact filenames, sizes, SHA-256 hashes and the final Desktop run URL - `CG Control_0.12.1_x64-setup.exe` — 221,480,317 bytes —
      `58CE9589253C2BC4F689B1964A00CCB377CBBA9F8E98D87CA63219D390E82965` - `CG Designer_0.12.1_x64-setup.exe` — 230,076,653 bytes —
      `DE5A91B29E36032CCBEE98ECEE678729D303CC2FA60C5891382B24869561AC80` - final Desktop run:
      [40260874571](https://github.com/yasermostafaee/cg/actions/runs/40260874571)
- [x] 4.3 Archive this change only after all required evidence is complete; do not tag or publish
