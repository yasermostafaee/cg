# release-0-11-0 — the delivery build `0.11.0` (`P-064`)

Prompt: `RELEASE-0110-01` (v3), 2026-10-04. Order: after `PLAYOUT-FEATURES-01`, `CONSOLE-POLISH-01` (and
its delta A) and `INSTALLER-DESIGN-01` landed on `dev`, each CI-green. Part A of the same prompt (`B-308`)
is recorded in `console-polish`, not here.

## Why

`0.11.0` is the build the client gets (the owner, 2026-10-03): `0.9.0`, `0.9.1` and `0.10.0` were never
delivered. Three installers ship together — CG Bridge, CG Control, CG Designer — from one green commit,
with a Persian install guide and a draft release the owner publishes himself. The owner's own machines and
the `.111` test plant hold the classic NSIS `0.10.0`, and the new CG Setup installers must upgrade them in
place. `INSTALLER-DESIGN-01` proved only a synthetic upgrade (a registry value rewritten), so the real one
is proved here, on clean Windows, before the draft opens.

## What changes

- **One version, `0.11.0`, SET through `tools/release`** (`release-version.mjs --set`): every file that
  carries it, in one command; the build still refuses files that disagree.
- **The release line is pinned both ways**: a `0.11` console refuses a `0.10` CG Bridge in words and the
  other way round, with nothing sent (`bridgeSkew.test.ts`).
- **`P-031`'s compatibility floor moves to `0.11.0`**, the first build a client holds.
- **The Persian guide for `0.11.0`**: the setup window's pages, first-run's CG Bridge address left empty,
  the check in four groups with the sign-in between them, Station setup's Check, the Playout floor and
  the CG licence line; six pictures from the `0.11.0` build; no unconfirmed Playout-side point left.
- **The release, accepted on clean Windows** (`release-acceptance.mjs`, two Desktop jobs, a fake Playout
  and CasparCG's stand-in): the three installers in the guide's order with the network cut; the INSTALLED
  CG Control driven end to end against the INSTALLED CG Bridge (sign in, channel 2, CG Bridge signed in, a
  take ON AIR, a clear); the real upgrade from the `v0.10.0` draft's own installers with a row ON AIR
  through it — the Welcome's update line, `/S` exiting 0, the service, settings, session and station
  kept, and no `CLEAR` reaching CasparCG; the uninstall.
- **The built installers are scanned** — each engine opened and listed, every text file read, and the
  strings of every program we build read (CG Setup, `cg-control.exe`, `cg-designer.exe`) — for tokens
  and dev-only code as well as private addresses and test secrets.
- **The draft waits for both acceptances**, and is titled `APASAI CG <version>`.

## What does not change

No product behaviour beyond `B-308`'s wording: no take's wire, no send guard, no refusal condition. No
code signing, no auto-update, fully offline, no manual side step.
