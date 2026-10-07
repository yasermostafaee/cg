# console-check-scope — design

## §0 — what happened on the owner's PC (read on that PC; nothing dialled `.111` or `.114`)

- **Installed:** CG Control `0.11.3`, CG Designer `0.11.3`. **No CG Bridge** — no Installed-apps row, no `CGBridge`
  service. The System log shows the service installed on 2026-09-30 20:03 (event 7045, then 7040 → auto); it is
  gone now; `%ProgramData%\CG Bridge` remains, closed to an ordinary user. No Playout engine and no CasparCG.
- **Listeners after the restart:** none on TCP 5280, 7911, 8080, 5250 or UDP 6250, 6251, 6252. Nothing of the
  CasparCG started earlier holds a port.
- **The station record** (`cg.runtime.station.v1`, WebView2's local storage): `http://192.168.21.111:8080`,
  `http://127.0.0.1:8080`, …, `http://192.168.111:8000`, `http://192.168.21.111:8000` — never a CG Bridge address.
  `192.168.111` is a three-part IPv4 the URL parser reads as `192.168.0.111` (picture 5).
- **Why the check described `.111`:** `setup.check` rode the socket the console was on (`.111`'s CG Bridge,
  `0.11.2`). Typed `127.0.0.1` was `.111`'s own loopback there; `.111`'s CG Bridge is configured with
  `http://127.0.0.1:8080`, so the before-sign-in narrowing let it through. Every line — v2rayN, ports, "run on this
  machine", `CasparCG on 127.0.0.1 answered …`, `Playout 2.9.5` — was `.111`'s. `Connect` dialled
  `ws://127.0.0.1:5280` on the owner's PC.
- **Picture 6:** no CG Bridge answering; `setup.check` refused on the down socket with `BridgeDisconnectedError`'s
  sentence. Sign in stayed locked (`signInCanWork` over no lines), and first-run's opaque ground (z-index 1002, a
  focus trap) covered the banner's `Retry connection` and `Set up again`.
- **Read, not seen yet, the same family:** a console on another PC signs in at `caps.signInUrl`; a CG Bridge
  configured as `http://127.0.0.1:8080` advertises `127.0.0.1`, so the console would sign in to its own loopback;
  and before a sign-in that CG Bridge refuses a check of the Playout's real address.

## Decisions

1. **The check runs where `Connect` will go.** `bridgeUrlForStation` stays the one resolver; the platform's
   `setup.check` takes the typed fields, resolves, and uses the open socket only when it is that URL and live;
   otherwise a one-shot socket (`capabilities` + `setup.check`, then closed). Not answering within the connect
   bound is `BridgeNotAnsweringError` — the operator's sentence, `CG Bridge is not answering at <host>:<port>.`
   The main socket is never retargeted by a check.
2. **The CG Bridge line is the check's own fact**, from where the check ran — never `link.bridgeAddress()`.
3. **A remembered address is a button**, `Use <host> (last used)`, which fills the CG Bridge field (a person's
   choice) and checks again. First-run shows the CG Bridge field too, so nothing is carried silently.
4. **Rebase, don't rewrite configuration.** A loopback host in CG Bridge's advertised sign-in/refresh URL is
   replaced by the host the console reached CG Bridge at, only when that host is not loopback. One place:
   where the capabilities are adopted.
5. **The before-sign-in narrowing is NOT changed** (the prompt's hard stop: no refusal condition changes). Instead
   the console asks the check by the address CG Bridge knows its own Playout by, when the typed host is the CG
   Bridge host it dialled and CG Bridge names its Playout by loopback on the same port: the same Playout, seen from
   CG Bridge's machine, and still "this station's own Playout" to the narrowing.
6. **`ports` and `topology` stay in the wire enum** so an older CG Bridge's answer still parses; the new CG Bridge
   never sends them and the console drops them. CG Bridge's own port trouble is on `/health` — the existing,
   never-emitted code `port-refused`, so no enum grows that another CG Bridge's guard parses (`B-313`); the holder
   looked up when the bind fails — and rides the check's answer (`bridgeProblems`, optional and additive).
   ⚠ **Measured, not assumed:** the first version read `/health` from the page (`cors: *`). On the clean runner
   CG Bridge answered Node at `127.0.0.1:5280/health` and CG Control's page `fetch` of the same URL never did,
   while its WebSocket to the same port works (Desktop run 37599351497, installer smoke). So nothing in the console
   reads CG Bridge over HTTP: the address gate's probe is a socket (`bridge.capabilities`) too.
7. **VPN/proxy:** the line is a finding, not a process list. A proxy counts only with a listener (or a non-local
   host); a tunnel adapter counts when up (Teredo/ISATAP/6to4 excluded); red needs the route to the Playout or
   CasparCG through the tunnel. CG Bridge's own requests never use the system proxy (`playout-http.ts`), so a
   proxy is reported, never red.
8. **CG Bridge here (`R-091`) belongs to the shell**: `local_bridge_state(host)` (SCM read + the TCP 5280 holder via
   the IP helper, no elevation) and `local_bridge_act(action)`, which relaunches `cg-control.exe` elevated
   (`ShellExecuteExW` `runas`) with `--cg-service start|free <pid>`; that instance does only that — it re-checks
   that a holder is ours by its image path before stopping it — and exits before Tauri starts. "Ours" is an image
   named `cg-bridge.exe` in a folder named `CG Bridge` or `CG Control`. `local_bridge.rs` carries no Tauri (its two
   commands are thin wrappers in `main.rs`), so its tests — real reads of Windows' service and TCP tables
   included — run without a window or a manifest.
9. **Fold** is presentation over the same lines; the choice is one per-viewer key, `cg.runtime.check-show-all.v1`.
