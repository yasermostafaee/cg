# client-test-release — tasks (`P-059`, `CLIENT-TEST-RELEASE-01`)

## 0. Established first

- [x] 0.1 A0 — the splash's still frame is the owner's Chrome reporting `prefers-reduced-motion: reduce`
      (started inside a Remote Desktop session); at `0d857d81` it animates everywhere else. No change
      (design §A0).
- [x] 0.2 B0.1–B0.6 — versions, where they show, the inbound ports and the existing firewall rules, the
      operator guide, the minimum Playout build, the dev-only absences (design §B0).

## 1. One version, `0.9.0` (B1)

- [x] 1.1 `0.9.0` in the nine files that carry a part's version.
- [x] 1.2 `tools/release` (new zero-dependency workspace): `release-version.mjs` reads them all and
      refuses a drift, a placeholder and a tag that does not name the version;
      `tests/release-version.test.ts` (with planted-drift controls); `turbo.json`'s `@cg/release#test`
      hashes the nine files. The unused Electron-era `build-checksums.mjs` is removed.
- [x] 1.3 The bridge's first start line names its version (`bin/caspar-bridge.mjs`; inlined by
      `scripts/bundle.mjs`); `desktop-sidecar.test.ts`: the shipped bundle's first line, the one-shot's
      none, a refused start from source (control: a wrong inlined version reddens the first).
- [x] 1.4 CG Control: `Version <release>` at the foot of Station setup's rail
      (`stationSetupVersion.dom.test.ts`, `tests/e2e/app-version.spec.ts`).
- [x] 1.5 CG Designer: `Version <release>` on its start screen (`landing-version.dom.test.ts`,
      `tests/e2e/app-version.spec.ts`).
- [x] 1.6 `P-031`: the compatibility floor is set at `0.9.0`. (Moved to `0.9.1` on 2026-09-30 — `0.9.0` was never delivered — by `release-0-9-1` §5, `P-060`.)
- [x] 1.7 The installer workflow reads the version before building; the smoke checks both installers'
      names and Installed apps (HKLM for CG Control, HKCU for CG Designer) against it, and the entry's
      absence after uninstall.

## 2. No real address, no test secret (hard stop)

- [x] 2.1 The console's backup-host placeholder and host-required hint use RFC 5737 addresses; the
      bridge comment in `command-builder.ts` loses the plant's addresses.
- [x] 2.2 `tools/release/src/scan-payload.mjs` + `tests/scan-payload.test.ts`; the installer workflow
      scans CG Control's payload and starting page and CG Designer's `dist` before building. Measured
      locally: the payload staged 2026-09-23 → 4 findings (control); re-staged at this change → 16 text
      files, none.

## 3. The firewall rules (B2)

- [x] 3.1 The smoke judges each rule by its `netsh` fields (`tests/desktop/firewall-rule.mjs`,
      `tests/installerFirewallRule.test.ts`; control: a rule named "UDP 6250" on 6251 is refused).
      Checked against this host's real rules: both pass; the TCP rule read as the UDP one is refused.

## 4. The Persian install guide (B3)

- [x] 4.1 `docs/release/0.9.0/install-guide.fa.md` — the seven sections in the prompt's order; every
      app label quoted exactly as the app shows it (`Export (.vcg)`, not its accessible name); one
      Playout-side point our records do not file, marked `[confirm with the Playout team]`: the name
      of the Playout's approve action.
- [x] 4.2 Four screenshots from the real apps, by the e2e harness (`guide-shots.spec.ts` in both apps,
      run only with `CG_GUIDE_SHOTS`): the Playout address (a documentation address), the sign-in
      (masked), the channel, the Designer's `Export (.vcg)`. No real address, token or password.
- [x] 4.3 The PDF: `tools/release/src/build-guide.mjs` — Chromium (Playwright, the installed Chrome),
      the repo's Vazirmatn inlined as the app declares it, RTL, pictures inlined; it refuses to print
      when the font did not load. Locally: 2 A4 pages, 165 KB.
- [x] 4.4 `tests/guide.test.ts` — the sections and their order, the release's version and file names,
      every quoted label against the source that renders it (control: a planted stale label reddens),
      the pictures, no private address or secret, the one marker; the markdown forms; the page (RTL,
      six faces, everything inlined). `turbo.json` hashes every file it reads.
- [x] 4.5 The English operator guide named the removed **CG Control → Open bridge log** menu; it now
      names **LOG → Open log folder**.

## 5. The tag release (B4)

- [x] 5.1 `desktop.yml`: a `v*` tag runs the installers and the smoke from the tagged commit; the
      version step refuses a tag that does not name the version, before anything is built; `release`
      (tag only, after both) builds the guide, assembles the four files
      (`tools/release/src/release-files.mjs`: the installers renamed without a space, which GitHub
      would rewrite; `SHA256SUMS.txt` in sha256sum's format), opens the draft pre-release and reads it
      back. `tests/release-files.test.ts`; the assembly dry-run locally on stand-in installers.
- [x] 5.2 It ran on `v0.9.0` — <https://github.com/yasermostafaee/cg/actions/runs/36583156212>,
      COMPLETED `success`, every job RAN: the version step read `REF_TYPE: tag`, `REF_NAME: v0.9.0` and
      accepted it; the scan was clean; installers, the clean-Windows smoke and `Draft release (tag only)`
      all green. The draft read back independently: `APASAI CG 0.9.0 (test build)`, draft, pre-release,
      exactly four assets — `CG-Control_0.9.0_x64-setup.exe` 240,540,708 B,
      `CG-Designer_0.9.0_x64-setup.exe` 226,128,109 B, `APASAI-CG-0.9.0-install-guide-fa.pdf` 166,246 B
      (2 pages, Vazirmatn embedded), `SHA256SUMS.txt` 298 B; downloaded, every sum OK; both installers'
      version resource `0.9.0`. <https://github.com/yasermostafaee/cg/releases/tag/untagged-d830df91bf1c34d88f63>
      (a draft's URL until it is published).

## 6. Gates, CI, the tag

- [x] 6.1 `pnpm gate` green, full and uncached (99/99, 0 cached; OpenSpec 91/91), as the pre-push gate
      of each push: `gate-20260929T125706Z-21104.log`, `gate-20260929T133718Z-16588.log`, and the tag's.
      ⚠ The Stop hook's gate between them went red on
      `packages/template-runtime/tests/clock-timeofday-zones.test.ts` — a one-BIT flip in the working
      file (`0x6B` → `0x69` at byte 12570, size and mtime kept, so `git status` stayed clean), not an edit:
      restored from git and the whole tree re-hashed against the index (3,598 files, 0 differ).
- [x] 6.2 Pushed; `origin/dev` read back at `6f20bd72`, `aba3c8fa` and `901a9d37`.
- [x] 6.3 CI on `aba3c8fa`, the tagged commit — both COMPLETED `success`, every job RAN:
      PR <https://github.com/yasermostafaee/cg/actions/runs/36577397241> (`E2E (Playwright)` in attempt
      1; `ci` in attempt 2, re-run by the owner after attempt 1's was cut off at its 15-minute cap on an
      uncached run — `901a9d37` raises the cap, measured) and Desktop
      <https://github.com/yasermostafaee/cg/actions/runs/36577397114> (installers; smoke 46/46). Push 1
      (`6f20bd72`): PR <https://github.com/yasermostafaee/cg/actions/runs/36572555950> green, every job
      RAN; Desktop <https://github.com/yasermostafaee/cg/actions/runs/36572556033> smoke 45/46 — the
      smoke's own uninstall race, fixed in `aba3c8fa`.
- [x] 6.4 `v0.9.0` pushed on `aba3c8fa` (annotated, tag object `08a2f754`), read back with
      `git ls-remote`; the draft release as in 5.2. Publishing it is the owner's.
