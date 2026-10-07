# console-check-scope

## Why

The owner's check of `0.11.3` on his own PC (2026-10-07, `RELEASE-0114-01`). Set up's check ran on whatever CG
Bridge the console was already connected to — `.111`'s — so a typed `127.0.0.1` was checked as `.111`'s own
loopback, and every line (its v2rayN, its ports, "The Playout and CasparCG run on this machine") described `.111`
while reading as his PC. `Connect` then dialled `127.0.0.1:5280` on his PC, where nothing listens. With no CG
Bridge answering, Set up showed the console→bridge refusal
(`Bridge disconnected — command rejected. Not sent to CasparCG.`), kept Sign in disabled with no reason, and covered the banner's way back. The check also still judged
the console's own machine — ports and topology from the era when CG Control carried its own bridge — and the
VPN/proxy line failed on a process name alone. `B-317`, `B-318`, `R-090`…`R-093`.

## What changes

- **One CG Bridge address (`B-317`).** The CG Bridge field if a person typed it, else the Playout's host on 5280:
  the check runs on THAT CG Bridge (a short-lived socket of its own when it is not the one the console is on), its
  "found at" line, `Connect`, the banner and the reconnect all name it. A remembered address is a choice ("Use …
  (last used)"), never used silently; a CG Bridge on another host than the Playout is said in one line.
- **No dead end (`B-317`).** `Connect` only when CG Bridge answered there. Set up says
  `CG Bridge is not answering at <host>:<port>.` and keeps Check, the fields and Sign in usable; the sign-in never
  waits on CG Bridge.
- **CG Bridge on the Playout's machine (`B-317`).** A loopback address CG Bridge advertises (its sign-in and
  refresh URLs) names CG Bridge's machine, so a console on another PC is rebased onto CG Bridge's host; and before
  a sign-in, a CG Bridge whose own Playout is loopback accepts its own machine's address as "this station's
  Playout".
- **The check judges only what a console needs (`R-090`).** No local ports line, no topology advice. CG Bridge's
  `/health` names a port it cannot open and its holder; the console says it, naming CG Bridge's host. Lines CG
  Bridge writes about its own machine say "CG Bridge's machine". An older CG Bridge's `ports`/`topology` lines are
  dropped by the console (the ids stay in the wire schema so its answer still parses).
- **VPN/proxy, exact or not at all (`B-318`).** Only an active proxy (a listener on its address), a tunnel adapter
  up, or a route through a tunnel makes a line, naming the process and PID, the proxy and its holder, the adapter;
  amber, red only when the route to the Playout or CasparCG goes through the tunnel.
- **CG Bridge here and stopped (`R-091`).** CG Control reads its own Windows: `Start CG Bridge` (UAC is the app's own
  step; the service starts), the holder of TCP 5280 named, `Free the port` only for a holder of ours. No PowerShell.
- **Fold the passes (`R-092`).** Each group shows what needs attention; its passes fold into `Reachable · 4 OK`;
  `Show all` opens them, remembered per viewer.
- **The last prose (`R-093`).** The NOT CONNECTED banner keeps the state, the address and
  `Takes are refused until it is back.`; `Loading the layer list…` keeps its title only.

## Impact

- `tools/caspar-bridge` — `connection-check.ts`, `bridge.ts` (`checksThisStation`, `/health` port holder), `health.ts`.
- `packages/shared-ipc` — `setup.ts` (groups, subjects; `ports`/`topology` kept on the wire for older bridges).
- `apps/runtime` — the platform's check and sign-in addressing, `PlayoutConnection`, `ConnectionCheckList`,
  `FirstRunScreen`, the banner, `LayersPanel`, a new per-viewer key (`cg.runtime.check-show-all.v1`), and CG
  Control's shell (`src-tauri`: the local CG Bridge service read and its start).
- No change to a take's wire, the send guard, the backup mapping or any refusal condition.
