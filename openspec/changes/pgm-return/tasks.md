# Tasks — `pgm-return` (C-016, `PGM-RETURN-01` v2)

Lane: **FULL** — a new network path from the bridge to the playout core, a new IPC channel, and a
new route on the console origin.

## 1. The contract

- [ ] 1.1 `@cg/shared-ipc` `channels/pgmReturn.ts` — the state enum, the status schema,
      `pgmReturn.status` (read) and `pgmReturn.status-changed` (publish), `pgmReturnPath(n)`
- [ ] 1.2 `window.cg.pgmReturn` — `feedUrl`, `status`, `onStatusChanged` — on the contract, the
      WS runtime and the mock (no relay offline); the `B-074` parity guard lists it

## 2. The bridge

- [ ] 2.1 `pgmPort(n) = 9250 + n − 1` — the one place the number is written
- [ ] 2.2 The part parser: framing by `Content-Length`, bounded heads and bodies
- [ ] 2.3 The feed connection: the exact request and nothing after it; connect/head bounds; stall
      at 2 s; closed at 8 s without a frame
- [ ] 2.4 The relay hub: demand = attached viewers; linger 1.5 s; one upstream per channel;
      backoff 1-2-4-8-10 s with a healthy-connection reset; channels ≥ 21 `unavailable` + log
- [ ] 2.5 `createBridge` — the hub, its host (C6 IPv4 / server A), the route, the publish, a
      config change restarts upstreams, `close()` disposes it
- [ ] 2.6 The console server's `/pgm/<n>` route — loopback only, `multipart/x-mixed-replace`,
      bytes untouched; the CLI hands it the hub

## 3. The console

- [ ] 3.1 `useProgramReturn(channel)` — the feed URL, the published state, remount on reconnect
      and after an error with backoff
- [ ] 3.2 The PROGRAM pane — the picture only while `live` over a live link; "No return signal" /
      "Return feed stalled" in the strip and on the screen; the lamp by state; no prose

## 4. Tests (each absence with its positive control)

- [ ] 4.1 The exact request (bytes recorded by the fake; nothing after; control: it arrived)
- [ ] 4.2 Framing (a JPEG containing the boundary arrives whole; control: ordinary frames)
- [ ] 4.3 Never preview (`pgmPort(1..20)` ∉ 9350–9369; control: `pgmPort(2) === 9251`)
- [ ] 4.4 Pull only when watched (e2e: hidden → no connection; show → connects; hide → closed
      within the bound)
- [ ] 4.5 Stall and reconnect (stalled appears; measured growing backoff; control: resumed frames
      clear it)
- [ ] 4.6 One upstream (two consoles one channel → one connection; control: two channels → two)
- [ ] 4.7 Loopback only (non-loopback refused; control: loopback served)
- [ ] 4.8 The e2e: the owner's path — SHOW MONITORS → the live picture → stalled → resumed

## 5. Cost

- [ ] 5.1 The bridge's CPU and memory, monitor shown vs hidden, against the fake at 25 fps with
      13 KB frames (recorded in `design.md` §7)

## 6. Records

- [ ] 6.1 `C-016` — what is built, how it works, its limits; `[~]` with this change
- [ ] 6.2 `docs/integration/playout/` — the feed as used (port rule, 🔴 preview trap, the
      well-behaved-client rule and why, whole-LAN readability), beside the Playout team's response
- [ ] 6.3 The operator guide — one line on the PROGRAM monitor
- [ ] 6.4 The superseded "PGM is an empty placeholder" claims (active changes, comments) corrected

## 7. Gate and discharge

- [ ] 7.1 Prettier; `pnpm gate`; `pnpm openspec validate --all --strict`
- [ ] 7.2 Pushed to `dev`; the `e2e` and installer runs RAN green — URLs here
