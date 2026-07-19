# Tasks — the NO OSC indicator (B-094)

## 1. Recon (done)

- [x] 1.1 `ServerHealthSchema.oscFreshAt` already exists and is populated by NOTHING in the real
      bridge — only `MockRuntime` ever set it. So no schema change, no new channel.
- [x] 1.2 `HEALTHY` is derived from the AMCP axis alone (`amcpAxisOk: state === 'healthy'`), which
      is why a blind install reads confident green.
- [x] 1.3 `ServerSession` degrades on OSC silence and then force-disconnects, so a blind install
      FLAPS — reassuringly green for part of every cycle, mis-attributed for the rest.
- [x] 1.4 [[B-093]] already added the right signal: `OscOccupancyTap.lastOscTrafficAt`, source-
      filtered to the declared server. Reuse it; a second source of truth could disagree with the
      restore guard about whether the server has been heard.

## 2. Bridge

- [x] 2.1 `health()`'s `snapshot()` populates `oscFreshAt` from `lastOscTrafficAt` (absent = never
      heard this session).
- [x] 2.2 `#sweepOccupancy` re-publishes health when the heard-bit FLIPS — health is otherwise
      emitted only on adapter / failover / setConfig events, so the indicator would never appear or
      clear on its own. Publishes on change only, never per tick; no new timer.

## 3. Renderer

- [x] 3.1 `isDeafToServer()` — answering AMCP (`healthy`/`degraded`) with `oscFreshAt` absent. The
      state gate is what stops a cold start flashing the warning during connect/handshake/resync.
- [x] 3.2 `⚠ NO OSC` pill beside the health pill, amber (the caution tone) — NOT the red reserved
      for air claims and for a server that is genuinely down.
- [x] 3.3 Tooltip: names it a CasparCG-side CONFIG fault, states the server is UP, lists what is
      degraded (on-air confirmation, orphan detection, stack restore), gives the remedy. Never
      implies "restart the server".
- [x] 3.4 Suppressed while the bridge link is down, in test mode, and before the handshake.

## 4. The placement decision (reported, not assumed)

- [x] 4.1 SEPARATE INDICATOR, not a pill state. The pill's vocabulary mirrors the session state
      machine exactly, and this is an orthogonal axis. Separate lets the bar say both facts at once,
      and — decisively — survives the FLAP: a pill state would be overwritten by DEGRADED at exactly
      the moment the operator most needs the explanation. Matches the bar's existing grammar for
      orthogonal facts (`○ NO BACKUP`, the strategy pill, `⚠ NO SERVER — SIMULATED`).

## 4b. Raised by the design panel, and right (both adopted)

- [x] 4b.1 THE PILL MUST STOP ASSERTING. A confident green HEALTHY beside an amber NO OSC is the
      failure this bar has already been corrected for twice (B-081, R-006): two contradictory
      claims, same size, same row, and the reassuring one wins. A deaf server's pill now mutes to
      B-081's `stale` tone — the state WORD stays (it is the FSM's, still true on the AMCP axis),
      its confidence is withdrawn — and carries an "AMCP only" title. Both the majority and the
      dissenting judge raised this independently.
- [x] 4b.2 PER SERVER, AND NAMED. A and B are independent sessions with independent taps and
      independent bound UDP ports, so one can be deaf while the other is fine. One chip per deaf
      server, labelled `⚠ NO OSC FROM <label>`; an unattributed warning would send the operator to
      the wrong machine.

## 5. Tests

- [x] 5.1 OSC flowing → no indicator; the health pill is untouched.
- [x] 5.2 AMCP answering + never heard → indicator shows BESIDE a HEALTHY pill.
- [x] 5.3 Survives the flap — still shown while the pill reads DEGRADED.
- [x] 5.4 Copy: names a config fault + the remedy, says the server is UP, says what is degraded,
      and never says "restart".
- [x] 5.5 Suppressed during connect/handshake/resync, while the bridge is down, and in test mode.
- [x] 5.6 Clears once OSC arrives.
- [x] 5.7 Bridge: `oscFreshAt` is a real ISO timestamp when heard; absent when AMCP is fine but OSC
      goes nowhere; PRESENT for an idle-but-healthy server (the false positive that must never
      happen — an empty channel emits no per-layer producers, verified on 2.3.2); and health
      re-publishes on its own when OSC starts arriving.
- [x] 5.9 The deaf server's pill is muted, not confident (4b.1).
- [x] 5.10 In a mirror pair only the DEAF server is flagged, and the flag names it (4b.2).
- [x] 5.8 caspar-bridge green isolated AND under full parallel `pnpm test`; ports/sockets released
      in `afterEach`.

## 6. Gate

- [x] 6.1 `pnpm gate` green (uncached).
- [x] 6.2 `pnpm gate:e2e` with no dev server / mock / bridge competing for CPU.
- [x] 6.3 `pnpm openspec validate runtime-no-osc-indicator --strict`.
