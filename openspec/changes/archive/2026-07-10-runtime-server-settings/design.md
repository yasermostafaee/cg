# Design — runtime server settings (R-010)

## Part A diagnosis (confirmed against code, 2026-07-11)

- **Config is construction-frozen.** `ConnectionConfig` enters once at
  `new CasparRuntime(config)` and is stored `readonly`
  (`caspar-runtime.ts:86`); sessions are built from it in the constructor
  (`:164`), the `RedundancyAdapter` at `:168`, serve options derived once at
  `:152`. `start()` (`:177`) wires reconciler/OSC/adapter listeners once
  (idempotent `#started`); `stop()` (`:238`) tears down everything including
  the template server. No rebuild path exists — changing servers means
  killing the process.
- **The config channel is read-only.** `bridge.ts:284`:
  `route(ConnectionsConfigChannel, () => b.config())`; `config()` returns the
  frozen object (`caspar-runtime.ts:438`). No write channel exists in
  `shared-ipc`.
- **No Remove-All.** Only per-item `remove()` (`caspar-runtime.ts:416`) —
  which is already OUT+REMOVE in one: slot delete, OSC-interest removal,
  layer dealloc, urgent `CLEAR` (B-039 producer-destroy semantics).
- **"On air" is knowable from the Reconciler.** Precedent at
  `caspar-runtime.ts:540`: `updateRequest` counts
  `snapshot().some(status === 'on-air' || 'playing')` (B-053 parity). Full
  status vocabulary: `shared-schema/src/runtime/item-state.ts:13-26`.
- **Remote was only HALF-plumbed (new finding).** `deriveServeOptions`
  handles HTTP (remote → bind `0.0.0.0`, serve `guessLanHost()`,
  `template-http-server.ts:50-60`) and `createBridge` prints the LAN-exposed
  warning (`bridge.ts:174`). But OSC ingest hardcodes
  `oscBindHost: '127.0.0.1'` (`caspar-runtime.ts:159`): a remote CasparCG's
  UDP OSC (pushed per its `casparcg.config` client entry) would never
  arrive — render-but-never-confirm, sessions degrading on OSC silence.
  Owner decision: derive the OSC bind alongside the serve path; never ship
  remote as render-only.
- **Renderer hosting.** No settings surface exists (R-002 unbuilt). House
  overlay pattern: `AuditPanel` opened from a StatusBar button
  (`App.tsx:90-92`). Three bridge implementations must stay in parity:
  `runtime-bridge.ts:89-96` (contract), `WebSocketRuntime.ts:365-371`,
  mock wrapper `createRuntimeBridge.ts:97-102` + `MockRuntime`.

## Decisions (owner-approved 2026-07-11)

### 1. The write path — `CasparRuntime.setConfig(next)`

`#config` / `#sessions` / `#adapter` / `#serveOptions` become mutable
privates. Ordered so everything fallible happens as late as possible:

1. **Gate** — `#isOnAir()` → `{ ok:false, reason:'on-air-block', message }`,
   nothing touched. (Invalid configs never reach here: the channel schema
   rejects them — nothing touched.)
2. **Construct** new `ServerSession`s (pure, no I/O — connecting happens in
   `start()`), with `oscBindHost` derived PER SERVER:
   `isLoopbackHost(host) ? '127.0.0.1' : '0.0.0.0'`.
3. **Teardown old** — `await` old sessions' `stop()` (rejects queued
   commands; safe, nothing on air), drop the old adapter (its listeners die
   with the old sessions), stop the template HTTP server. The Reconciler,
   `TemplateRegistry`, `#slots`, lock/audit/settings state survive — stack
   rows and imported templates are not connection-scoped.
4. **Rebuild + rewire** — new adapter over the new sessions; re-bind
   OSC→Reconciler, `health`, `failover-complete` (extracted from `start()`
   into `#wireAdapter()`, used by both); re-register OSC interest for every
   retained slot on the new sessions; **clear `#loaded` and `#adopted`** —
   both are per-server knowledge (a producer/adoption on the old server says
   nothing about the new one). A retained `loaded` badge stays honest: Take
   heals via adopt-CLEAR + re-ADD (B-039 / reconnect-reconciliation
   semantics). `#lastFailover` resets (it described the old pair).
5. **Template serve** — re-derive `deriveServeOptions(next.servers.A.host)`
   and restart the server. Only realistically fallible step (bind conflict):
   on failure retry ONCE with safe loopback-ephemeral options.
6. `start()` the new sessions, publish `connections.config-changed` + fresh
   health, audit as the existing `'reconnect'` action (no audit-schema
   change), persist (bridge layer, below), return
   `{ ok:true, templateServe: { serveHost, port, exposed } }`.

**Failure semantics — LAND-ON-NEW-CONFIG (approved over rollback).**
Invalid → schema-rejected, nothing changed. On-air → refused, nothing
changed. Unreachable/bad host → NOT an error: sessions retry with backoff by
design, `ok:true`, health honestly shows `disconnected` — the operator sees
exactly what a wrong IP looks like and re-applies. If step 5's retry still
throws → `{ ok:false, reason:'apply-failed', message }` with sessions running
on the new config and template serve down: a defined, non-crashing,
visibly-degraded state (loads fail loudly via the existing unknown-template
guards). Rollback was rejected: a half-rollback has two configs' worth of
failure modes; recovery here is one more Apply.

### 2. Remote server + the OSC-bind fix

The config may point A (and B) at non-loopback hosts. HTTP side unchanged
(`deriveServeOptions`). OSC side fixed: bind derives per server exactly like
the serve path. The response carries `exposed` so the panel states the fact;
stderr gets the same warning `createBridge` prints.

### 3. On-air gate (bridge-authoritative)

`#isOnAir()` = any snapshot item with status in
`{'playing','on-air','updating','exiting','unconfirmed'}` OR
`pending === true`. Stricter than the `updateRequest` precedent,
deliberately: `updating`/`exiting` ride an on-air producer, and B-044's
`unconfirmed` means the on-air result is UNKNOWN — unknown must block a
server switch (Remove-All cures it: its CLEAR settles the layer).
`idle`/`loaded`/`error`/`disconnected` don't block. Message: "N item(s) are
on air or unsettled — Remove All (or Out each item) first." The UI mirrors
the same predicate from `useStack()` to pre-disable Apply; the bridge check
is the authority.

### 4. Remove-All

`removeAll()`: snapshot → sequentially `await remove(itemId)` per item
(reusing OUT+REMOVE semantics — urgent CLEAR, interest removal, dealloc,
adoption mark). Sequential, not parallel: layer-ordered CLEARs, no burst; a
per-item failure doesn't abort the rest. Publishes ride the existing
coalesced `stackChanged`. Returns `{ ok:true, removed }`. UI: caution
AsyncButton in the StackPanel header with `window.confirm` (house precedent:
StatusBar's `window.prompt`; the e2e fixture handles dialogs).

### 5. Loopback invariant (SECURITY)

Structural: the WS bind happens once in `createBridge` from
`BridgeOptions.host` (default `127.0.0.1`, enforced at socket bind);
`CasparRuntime` holds no reference to the `WebSocketServer`; `setConfig`
lives entirely inside `CasparRuntime`. There is NO code path from
`ConnectionConfig` to the WS bind. **Boundary, auditable:** control plane
(the WS) loopback, always, regardless of server config; data plane goes
routable ONLY when the declared server is remote — template HTTP (outbound
content CasparCG fetches) and OSC UDP ingest (inbound telemetry only, parsed
and rate-limited; no control surface). Asserted by integration test: after
applying a remote-host config, a brand-new WS client still connects via
`127.0.0.1` and round-trips; `handle.host` unchanged; only
`templateServe.exposed` flipped.

### 6. Persistence — bridge-side JSON file

The bridge is the config's authority, so durability lives beside it, not in
a browser profile: a renderer-side re-push would leave the bridge booting
against the wrong server until some page connects, split truth across two
stores, and die with a cleared profile. Mechanism: `BridgeOptions.persistPath?`
(bin default `~/.cg-runtime/bridge-connection.json`; `--persist-path`
override; tests use temp paths; omitted → no persistence). Boot precedence:
**explicit CLI `--caspar-*`/`--backup-*` flags > persisted file
(Zod-validated via `ConnectionConfigSchema`; invalid → warn + ignore) >
`defaultConnection()`** — flags are session overrides and never silently
clobber the file. `setConfig` persists only after a successful apply, atomic
tmp+rename.

## UI

`ServerSettingsPanel` — modal (AuditPanel pattern), opened from a StatusBar
SERVERS button. Primary host/AMCP/OSC fields; optional backup section with
Add/Remove backup; strategy select + auto-failover toggle (required schema
fields — hiding them would hardcode them); Apply (AsyncButton) disabled with
the on-air reason when the stack predicate blocks; a warning row when any
entered host is non-loopback ("template serve + OSC will listen on your LAN
address; control stays on 127.0.0.1"), confirmed post-apply from the
response's `exposed`. Loads current values from `connections.config()`;
refreshes on `config-changed`. Native inputs/selects with inline styles
follow the AuditPanel precedent; buttons are the shared `Button`/`AsyncButton`.

## Test matrix

- shared-ipc: new channel schemas round-trip (backup-less config accepted;
  empty host / non-int port rejected).
- Bridge integration (amcp-mock; two mocks = "local" and "remote" stand-ins):
  re-point A → playout verifiably reaches mock2 (recorded handlers); refused
  while on-air then accepted after Remove-All; Remove-All empties air+stack
  (CLEARs observed on mock1) and unblocks; loopback invariant (new WS client
  on 127.0.0.1 after a remote config); unreachable TEST-NET host
  (`192.0.2.1`) → `ok:true` + health `disconnected`, no crash; persistence
  round-trip (a second `createBridge` on the same `persistPath` boots the
  pushed config).
- Renderer jsdom: panel validation, Apply gating + reason, warning row,
  setConfig payload shape; StackPanel Remove-All confirm (accept → call,
  cancel → no call).
- Playwright e2e (mock backend): open panel, blocked-Apply messaging while
  an item is on air, Remove-All confirm-accept → empty stack → Apply
  succeeds.
- All existing caspar-client / caspar-bridge / runtime suites + the failover
  integration test stay green; only immutable-config assumptions updated,
  intent preserved.

## Optional live smoke (Part C, NOT a gate)

Point primary at a second machine's CasparCG IP; Apply with nothing on air;
confirm the LAN warning; Load+Take renders on the remote output (proves
serve AND OSC are both routable); Remove-All clears it; restart bridge →
config persisted.

## Out of scope (frozen)

AMCP escape rule, B-044 lifecycle, reconnect-reconciliation behavior, R-003,
B-046 redundancy internals (divergence/journal logic untouched — this change
consumes the optional-backup shape only).
