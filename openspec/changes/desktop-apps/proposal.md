# Two Windows installers: CG Control (with its bridge) and CG Designer

## Why

The client installs the Playout, CG Control and CG Designer itself, on its own machines and its own
addresses, with nobody from our side present and often no internet (owner decision, 2026-09-23).
Until now the product was two browser SPAs and a Node bridge started from a checkout — which
assumes a developer. `DESKTOP-APPS-01` asks for two installers that a station can install, open
and connect from ONE typed address; `DESKTOP-APPS-01-A` asks that nothing else about the client's
addresses — not the Playout's issuer, not the CasparCG host — ever has to be typed.

## What changes

- **The bridge serves the console** on its own loopback origin, `http://127.0.0.1:5174`, with a
  health identity — never on the template origin 7911 (ADR 0010 rule 13).
- **The bridge runs as a sidecar**: `--state-home` roots every station file in the app's own data
  folder; `--exit-on-stdin-close` stops it with its parent; the whole CLI bundles into one ESM file
  run by the official `node.exe`.
- **The console's fonts are self-hosted** in both apps (`P-001`): no font request leaves the machine.
- **CG Control** — a Tauri shell that starts the sidecar, waits for it, and loads the console from
  it; one instance; close and crash both leave no bridge; an NSIS per-machine installer that adds
  and removes the two firewall rules; WebView2 offline.
- **CG Designer** — a Tauri shell with the Designer's `dist` bundled; NSIS per-user, no admin, no
  bridge, no firewall rule.
- **First-run** — the Playout's address, the seven-line connection check, a `station-admin`
  sign-in, the Playout's channels in that account's grant, the detected serve address — and the
  station is written through the existing doors.
- **`DESKTOP-APPS-01-A`** — every endpoint derives from the Playout's ADDRESS; the issuer is learned
  from the first `station-admin` sign-in and never typed; before adoption only adoption is accepted;
  a loopback `casparHost` is the Playout's own machine; the Playout target is written only by CG
  Control's own door, never over the control socket.
- **CI** builds both installers on `windows-latest` and smoke-tests them on a second, clean runner.

## Impact

- Capabilities: `runtime-caspar-bridge` (ADDED), `runtime-ui` (ADDED), `desktop-delivery` (NEW).
- ADR 0011 (new); ADR 0010 amended (the issuer is learned).
- No refusal condition on the path to air changes. Two surfaces gain a door each, both deliberate
  and both named in the route censuses: `channels.catalogue` (station-admin, read) and the
  `setup.*` reads; the lock, auth and permission gates and the station fence are unchanged.
- Shared config: root `Cargo.toml`, `turbo.json` (`lint` inputs hash `src-tauri/**`),
  `pnpm-lock.yaml` (esbuild, `@tauri-apps/cli`), `.gitignore`, a new workflow.
