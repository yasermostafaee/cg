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
- [x] 1.6 `P-031`: the compatibility floor is set at `0.9.0`.
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

- [ ] 4.1 `docs/release/0.9.0/install-guide.fa.md`.
- [ ] 4.2 Up to four screenshots from the real apps, by the e2e harness.
- [ ] 4.3 The PDF, built by Chromium from the repo's Vazirmatn, right to left.

## 5. The tag release (B4)

- [ ] 5.1 A `v*` tag builds, smokes and opens a draft pre-release with exactly four files.

## 6. Gates, CI, the tag

- [ ] 6.1 `pnpm gate` green, uncached.
- [ ] 6.2 Pushed; `origin/dev` read back.
- [ ] 6.3 CI: the `e2e` and installer runs COMPLETED green on the commit to be tagged, every job RAN.
- [ ] 6.4 `v0.9.0` pushed on that commit; the draft release's four files read back.
