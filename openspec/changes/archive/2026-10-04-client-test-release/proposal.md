# client-test-release — the first client test release, `0.9.0` (`P-059`)

Prompt: `CLIENT-TEST-RELEASE-01` (v1), 2026-09-29. Order: after the archive commit `0d857d81`.

## Why

The owner's decisions of 2026-09-23: a first test version goes to the client fast; the client installs
it **by itself**, on its own machines and addresses, with nobody from our side there; there are **no
manual side steps** (no scripts, no config edits, no firewall commands — only steps inside an app's own
UI); two Tauri installers, CG Control (with the bridge, per-machine) and CG Designer (per-user); no code
signing for this build; one account, `cg-admin`, whose password is random per Playout install and never
written by us.

What was missing for that: a release identity (every part read `0.0.0` or `0.1.0`), a way to cut a
release from a tag, and a guide the client can follow alone. Establishing the facts first (design §B0)
found one more: two of the owner's plant addresses shipped in the console's copy, and a third in a
source comment the bridge bundle keeps.

## What changes

- **One version, `0.9.0`**, for CG Control, CG Designer and the bridge, in the nine files that carry it
  (`package.json` ×3, `tauri.conf.json` ×2, `Cargo.toml` ×2, `Cargo.lock` ×2). `tools/release` (a new
  zero-dependency workspace) reads them all and refuses a build whose files disagree. The version shows
  in both installers' names, in Windows' Installed apps, in one line in each app — CG Control: Station
  setup's rail; CG Designer: its start screen — and in the bridge's first start line. It sets `P-031`'s
  compatibility floor.
- **No real address, no test secret in the installers.** The console's backup-host placeholder and its
  host-required hint use documentation addresses (RFC 5737) instead of the plant's; the bridge comment
  loses the addresses; the installer workflow scans every text file both installers are built from.
- **The firewall rules** (`DESKTOP-APPS-01`: UDP 6250 and TCP 7911, inbound, for `cg-bridge.exe` only,
  removed on uninstall) are unchanged. The clean-Windows smoke now judges each by the fields `netsh`
  prints — it was satisfied by the rule's name.
- **A Persian install guide**, `docs/release/0.9.0/install-guide.fa.md`, about two pages, built by
  Chromium into a PDF in the repo's Vazirmatn, right to left, with up to four screenshots taken from the
  real apps by the e2e harness.
- **A tag release.** A `v*` tag builds both installers from the tagged commit, runs the clean-Windows
  smoke, and opens a DRAFT pre-release with exactly four files: the two installers, `SHA256SUMS.txt` and
  the guide PDF. The owner publishes it, or hands the files over, himself.

Not changed: the take's wire, any refusal condition, the rendering-contract version
(`CG_RUNTIME_VERSION`, `1.0.0`), the `.vcg` manifest's `designerVersion` (still the literal `0.0.0`;
written, never read — `apps/designer/src/platform/Exporter.ts:406`), and the startup splash (design §A0).

## Impact

- `tools/release/` (new workspace), `tools/caspar-bridge` (`bin/caspar-bridge.mjs`,
  `scripts/bundle.mjs`, a comment in `src/command-builder.ts`), `apps/runtime` and `apps/designer`
  (version line, copy, vitest `define`), `apps/runtime/tests/desktop` (the smoke).
- **Shared config:** `.github/workflows/desktop.yml`, `turbo.json` (`@cg/release#test` inputs),
  `pnpm-lock.yaml` (the new workspace's importer).
- Specs: `desktop-delivery` (ADDED requirements).
