# Tasks — runtime-server-settings

## 1. Artifacts

- [x] Part-A diagnosis (incl. the hardcoded-loopback OSC-bind finding) +
      six owner-approved decisions recorded in `design.md`.
- [x] `pnpm openspec validate runtime-server-settings --strict` passes.

## 2. `@cg/shared-ipc`

- [x] Export `ConnectionConfigSchema`; add `ConnectionsSetConfigChannel`
      (request = config schema; response carries ok / reason / message /
      templateServe), `ConnectionsConfigChangedChannel` (publish),
      `StackRemoveAllChannel`.
- [x] Schema tests: round-trips incl. backup-less config; empty host /
      non-integer port rejected.

## 3. `tools/caspar-bridge`

- [x] OSC-bind derivation: session builder binds OSC per server locality
      (loopback host → `127.0.0.1`, remote → `0.0.0.0`).
- [x] `CasparRuntime.setConfig()` — fallible-last sequence: on-air gate →
      construct sessions → teardown old (sessions/adapter/template server) →
      rebuild + `#wireAdapter()` + re-register slot interest + clear
      `#loaded`/`#adopted` + reset `#lastFailover` → re-derive serve options
      and restart template server (retry once loopback) → start sessions →
      publish config-changed + health → audit `'reconnect'` →
      `{ ok, templateServe }`. Land-on-new-config failure semantics.
- [x] `CasparRuntime.removeAll()` — sequential per-item `remove()`,
      `{ ok, removed }`.
- [x] `#isOnAir()` — playing/on-air/updating/exiting/unconfirmed or pending.
- [x] `bridge.ts`: routes for set-config (persist-after-success) +
      remove-all; `config-changed` in `wirePublishes`; `persistPath` option +
      load precedence (explicit connection > persisted file > default).
- [x] `bin/caspar-bridge.mjs`: default persist path
      `~/.cg-runtime/bridge-connection.json`, `--persist-path` override.
- [x] Integration tests (two mocks): re-point reaches mock2 (recorded
      handlers); refused-on-air → Remove-All (CLEARs observed) → accepted;
      loopback invariant with a remote host (new WS client on 127.0.0.1,
      `handle.host` unchanged, serve exposed); unreachable TEST-NET host →
      `ok:true` + disconnected health, no crash; persistence round-trip.

## 4. `apps/runtime`

- [x] Contract + `WebSocketRuntime` + mock wrapper: `connections.setConfig`,
      `connections.onConfigChanged`, `stack.removeAll`; `MockRuntime` parity
      (on-air gate mirror, health re-derived with/without backup, failover
      refused without backup, removeAll empties stack).
- [x] `ServerSettingsPanel` (AuditPanel pattern) + StatusBar SERVERS button;
      Apply gated with reason from the stack predicate; non-loopback warning
      row + post-apply `exposed` confirmation; validation.
- [x] StackPanel header Remove-All (caution Button + native confirm — the
      lock-PIN house precedent; feedback is the stack visibly emptying via
      the state publish).
- [x] jsdom tests: panel validation / gating / warning / payload;
      Remove-All confirm accept+cancel.
- [x] Playwright e2e: blocked-Apply while on air; Remove-All confirm-accept →
      empty stack → Apply succeeds; panel opens with current config.

## 5. Gate

- [x] Full uncached gate (`turbo --force`) for every touched workspace +
      root `pnpm format:check`.
- [x] `pnpm test:e2e` (full run).
- [x] `pnpm openspec validate --all --strict`.

## 6. Wrap-up (Part C)

- [x] Optional live remote smoke checklist delivered (clearly non-gating;
      recorded in `design.md` §Optional live smoke — no second machine this
      session, so it was NOT run; mock/integration validation stands alone).
- [x] Flip R-010 → [x] with the validation record (no live smoke ran).
      Remove-All PRD decision: FOLDED into R-010's entry — it shipped as this
      change's companion; the OpenSpec requirement carries its scenarios.
- [x] Archive with the shared-spec ordering check — re-verified at archive
      time: the held pair owns seven requirement headings (AMCP seam,
      template resolution ×2, silent-downgrade, retained HTML, playout
      verbs, browser re-delivery), none of which this delta touches, and
      neither held change has a runtime-ui delta → archived independently.
- [x] Conventional commits, push, compare URL, final report.
