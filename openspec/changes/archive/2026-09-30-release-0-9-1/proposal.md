# release-0-9-1 — release `0.9.1` (`P-060`)

Prompt: `RELEASE-091-01` (v2), with `DELTA RELEASE-091-01-A` (§7–§10, A1–A2) and `DELTA RELEASE-091-01-B`
(replacing A's §9 and §10), 2026-09-29. Order: after `CLIENT-TEST-RELEASE-01` (`d1799c6a`, the `v0.9.0`
draft read back). `0.9.0` is never delivered.

## Why

The owner checked the installed `0.9.0` (2026-09-29) and found six things a client installing alone would
meet, each without a manual way round — which is the product's rule:

- **PVW** refused to rehearse a template this browser had not imported itself, and a re-import fixed it
  (`B-288`). The bridge already holds the page and serves it to CasparCG.
- **A media clip's sound**: on his own CasparCG a clip played silent and AUDIO → ON changed nothing
  (`B-289`). His decision: a D11 clip starts silent exactly like a D10 input, and the operator raises it.
- **The taskbar** showed one icon for both apps (`B-290`).
- **Rows at start**: every row was shown again (`B-291`).
- **Another station's CLEAR** left our plates on air, and ours kept showing ON AIR for layers CasparCG
  no longer had (`B-292`). Two stations on one channel stop being supported (`R-068`, built by
  `CENTRAL-BRIDGE-01`); what is fixed here holds whoever clears our layer.
- **The Designer's version** should be in Help → About (`D-161`).

And the release: its `SHA256SUMS.txt` against the files, the version, and a draft.

## What changes

- **PVW from the bridge's store.** A read-class `templates.page` returns the page of the version the row's
  channel lists — the same bytes `/template/<id>~<version>` serves CasparCG. The console asks the bridge
  first; the browser's own copy (`LibraryStore`) is a fallback only while the bridge cannot be reached.
  When the bridge has no file, PVW shows one line naming the template and the reason. Nothing stored is
  deleted; PVW still sends nothing to CasparCG.
- **Rule 2 extended to D11.** `startsSilentFromPlayout(origin)` — a D10 input or a D11 clip — is the one
  predicate for both the mute before an in-place `PLAY` and the 25-frame ramp (`PLATE_VOLUME_RAMP_FRAMES`,
  renamed from `D10_VOLUME_RAMP_FRAMES`). A media plate's raise now sends `VOLUME <v> 25`. PVW audio is
  unchanged (it never played any).
- **Each app its own icon** — the dark tile for CG Control, the light tile for CG Designer (the first
  installer's, `42af1a96`, both from the Apasai logo). The clean-Windows smoke reads each exe's icon, each
  shortcut's icon and each shortcut's AppUserModelID, and requires the two apps' values to differ.
- **Rows at start.** A bank no operator has applied since first-run declared it with every row shown is
  brought once to the five-row rule, by the bridge, when the channel's occupancy is known, keeping every
  occupied row shown, through the validated door.
- **Our layer cleared from outside** (`B-292`): OSC silence on a layer we hold on air is a question — one
  `INFO <ch>-<layer>` read after about 1 s; an empty answer takes the row off air with a notice. The
  orphan strip lists every occupied layer in 50–99 that nothing in this bridge's ledger holds, each
  clearable, plus "clear all listed"; never a layer outside 50–99, never a channel-wide `CLEAR`, never a
  layer the ledger holds. `@cg/amcp-mock` behaves like the core: a cleared layer goes silent, and `INFO`
  answers per-layer stage data.
- **Help → About** in the Designer names the app, `Version <release>` and the build.
- **Release `0.9.1`**: the version through `tools/release`; the installer job no longer writes a
  `SHA256SUMS.txt` into its CI artifacts, so the release's is the only one; the release job checks it
  against the uploaded assets; the `0.9.1` install guide, with the known limit "one channel from one CG
  Control"; `P-031`'s floor left open (the owner: `CENTRAL-BRIDGE-01` sets it at `0.10.0`); the `v0.9.0`
  draft retitled `v0.9.0 — superseded, do not use`.
- **Filed only:** `R-075` (the playlist output as a plate source), `R-076` (PGM audio and a VU meter),
  `R-077` (licensed through the Playout's dongle) — each blocked on the Playout team's answer.

Not changed: a take's wire and anything on air, beyond the plate-band volume commands of rule 2; no
stored template, list or default is deleted or rewritten; the channel dot (§8 — it already follows D4's
`output`, and a grey channel is one the Playout reports `off`).

## Capabilities

- `runtime-playout-sources` — RENAMED + MODIFIED: the silent start covers every Playout plate.
- `runtime-ui` — ADDED: PVW renders the bridge's page. MODIFIED: the five-row bank; the orphan strip.
- `runtime-caspar-bridge` — ADDED: `templates.page`; the one-time bank bring-in; a cleared layer of ours
  leaves ON AIR; the AMCP mock's cleared layer and `INFO`. MODIFIED: orphan occupancy and its clear.
- `desktop-delivery` — ADDED: each app its own icon; one `SHA256SUMS.txt`, checked against the assets.
- `designer-shell` — ADDED: Help → About.

## Impact

- `@cg/shared-ipc` (a channel, the five-row rule), `tools/caspar-bridge`, `tools/amcp-mock`,
  `apps/runtime` (PVW, the orphan strip), `apps/designer` (About), `apps/*/src-tauri/icons`,
  `apps/runtime/tests/desktop` (the smoke), `tools/release`, `docs/release/0.9.1`.
- **On-air / product source:** the plate volume ramp for D11; the bank bring-in; the silence reconcile;
  clearing band leftovers.
- **Shared config:** `.github/workflows/desktop.yml`, `turbo.json`.
