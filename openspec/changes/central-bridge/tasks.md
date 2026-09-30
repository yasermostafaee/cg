# central-bridge — tasks

## 0. Established and filed

- [x] 0.1 §0 answered (`design.md` §0.1–§0.8), four read-only surveys plus the upstream CasparCG `v2.5.0-stable`
      source.
- [x] 0.2 Filed: `B-293`…`B-295`, `C-046`…`C-048`, `P-061`, `P-062`, `R-078`, `R-079`; `R-067`, `R-068` and
      `B-262` point at this change; the registry records the numbers.
- [x] 0.3 The Playout's letter and our ask copied to `docs/integration/playout/` (byte for byte, scanned: no
      BOM, no control byte); the folder's index names both.

## 1. `OSC SUBSCRIBE` (rule 7, `C-046`) and a failed bind (`B-295`)

- [x] 1.1 `@cg/amcp-mock`: `OSC SUBSCRIBE`/`UNSUBSCRIBE` bound to the connection, reference-counted endpoints,
      the core's default per-client subscription (`oscToAmcpClientsPort`), `restartCore()`
      (`osc-subscribe.test.ts`).
- [x] 1.2 `@cg/caspar-client`: `ServerSession` `oscSubscribe` (inside the handshake, after `INFO`), the
      `oscSubscription` and `oscUnavailable` events; a failed OSC bind no longer stops the loop; the transport
      drops channels not served (`server-session-osc-subscribe.test.ts`).
- [ ] 1.3 Bridge: every session subscribes; A = the configured OSC port (default `6251`), B = `+1`; `6250`
      refused; served channels = the declared ones; the outcome logged; defaults moved off `6250` everywhere.
- [ ] 1.4 Bridge integration: a test holds the core's default port first and the bridge still starts and hears
      the core; the subscribe re-sent after a reconnect; another channel's OSC dropped.

## 2. The start check and a core restart (rules 2–3, `C-047`)

- [ ] 2.1 A core restart (the mock drops every layer and every connection): reconnect, re-subscribe, the
      restart notice with PUT BACK ON AIR; nothing re-sent without it.
- [ ] 2.2 At start, `INFO <ch>` per declared channel decides every restored row and every ledger entry; an
      emptied entry → off air with the notice, nothing sent; an occupied layer in 50–99 no entry holds → the
      strip; control: a layer still playing stays ON AIR. The automatic re-ADD on restore is gone.

## 3. One store, on the bridge (`B-294`, `B-293`)

- [ ] 3.1 `bridge-stack.json`: written atomically on every stack change, restored at start through
      `restore()`.
- [ ] 3.2 The console re-delivers nothing: `StackRetentionStore`, the template re-delivery and `stack.restore`
      removed; the living requirements that described them superseded.
- [ ] 3.3 Every new template version served at `<id>~<versionId>`; the page sent `Cache-Control: no-store`.

## 4. The console ↔ bridge connection (`R-068`, `B-262`)

- [ ] 4.1 Auth always on in service mode; an expired or revoked token is refused like none (no read, no
      publish).
- [ ] 4.2 Per-socket channel scope over every channel-scoped publish and read route, with a coverage test.
- [ ] 4.3 `bridge.capabilities.bridgeVersion`; the console's `major.minor` check — one line, no command.
- [ ] 4.4 Audit rows name the user and the console machine (the socket's peer address).
- [ ] 4.5 e2e: two consoles, one bridge (the multi-box take, the clear, the control).
- [ ] 4.6 Tokens: none, expired, without channel 2 — refused; control: channel 2 works.

## 5. The bridge's own session (rule 8), unlicensed (rule 11), backup (rules 9–10)

- [ ] 5.1 `bridge-session.json`: the rotating refresh token persisted before use; `needs-admin`; the
      admin's one-time sign-in; D4/D9/D10/D11 on the bridge's bearer.
- [ ] 5.2 The crash-between-receive-and-use test; control: the old token never reused.
- [ ] 5.3 A take on an `unlicensed` channel refused with the reason; control: a licensed channel takes.
- [ ] 5.4 A backup's loopback `casparHost` reaches the backup's host (pinned).
- [ ] 5.5 No `Origin` and no `X-Apasai-Mirrored` on any request to the Playout (bridge and native).

## 6. CG Bridge as a service (`R-067`)

- [ ] 6.1 `--service-config`, `%ProgramData%\CG Bridge\` state and logs, `SIGINT`/`SIGBREAK` shutdown.
- [ ] 6.2 `/health` (no auth, no secret, < 1 s, fixed shape, schema-tested).
- [ ] 6.3 The reserved-port check at start (and `--check-ports` for the installer).
- [ ] 6.4 One-time import of an older per-user state (`--import-state`); nothing deleted.
- [ ] 6.5 `/logs.zip` for a station admin; the console's Download logs.
- [ ] 6.6 `/pgm/<n>` on `5280` behind a socket-issued ticket.
- [ ] 6.7 The installer (`tools/bridge-installer/cg-bridge.nsi`) + Shawl, built in CI.

## 7. CG Control, the console

- [ ] 7.1 Bundled console; no sidecar, no Node, no firewall rule; per-user installer.
- [ ] 7.2 Native D1/D2 (no `Origin`); a browser keeps `fetch`.
- [ ] 7.3 The bridge found from the Playout address; the Station setup override; the lines (not reachable,
      needs admin, unlicensed, version); the splash `CONNECTING`.

## 8. Dev station

- [ ] 8.1 `pnpm dev:station` (`--fake`, `--caspar`) starts a bridge the console connects to as to CG Bridge.
- [ ] 8.2 The fake Playout: loopback AMCP, `OSC SUBSCRIBE`, a rotating refresh token, an `unlicensed` channel.

## 9. Release `0.10.0` (`P-061`)

- [ ] 9.1 `tools/release` covers three apps; every file carries `0.10.0`.
- [ ] 9.2 The Persian guide `docs/release/0.10.0/install-guide.fa.md`.
- [ ] 9.3 The clean-Windows smoke: CG Bridge's service, `/health`, rules, `6250` unbound, silent
      install/upgrade/uninstall exit codes; CG Control connects; control: no token, no state.
- [ ] 9.4 `P-031`'s floor at `0.10.0`.
- [ ] 9.5 Tag `v0.10.0` → the draft, its files and sizes read back.

## 10. For the Playout team, and the report

- [ ] 10.1 `docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md`, copied to `Claude outputs/`.
- [ ] 10.2 `Claude outputs/REPORT-CENTRAL-BRIDGE-01-v3-<date>.md`.
