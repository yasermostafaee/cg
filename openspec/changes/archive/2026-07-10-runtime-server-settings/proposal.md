# Runtime server settings — configure primary (+ optional backup) CasparCG at runtime (R-010)

## Why

The CasparCG connection is frozen at bridge boot: `ConnectionConfig` enters
`CasparRuntime` once at construction, `connections.config` is read-only, and
the only way to change servers is killing the bridge and restarting it with
CLI flags — invisible to the operator. B-046 made the config shape UI-ready
(`servers: { A, B? }`); R-010 is the UI plus a runtime path to apply it,
including pointing the bridge at a REMOTE CasparCG on another machine.

Diagnosis (full file:line map in `design.md`) also surfaced a real gap: remote
was only HALF-plumbed. The template-HTTP side derives a routable bind/serve
host (`deriveServeOptions`), but **OSC ingest is hardcoded to bind loopback**
(`caspar-runtime.ts:159`) — a remote CasparCG's UDP OSC would never arrive:
templates would render with dead truth/confirmations, exactly the churn
failure B-046 removed. Owner decision: fix it here (derive the OSC bind
alongside the serve path), never ship remote as render-only.

## What Changes

Six owner-approved decisions (rationale + tradeoffs in `design.md`):

1. **Runtime reconfiguration** — new `connections.set-config` channel
   (request = `ConnectionConfigSchema`); `CasparRuntime.setConfig()` tears
   down the declared sessions/adapter, rebuilds them from the new config
   (fallible-last ordering; template serve re-derived with a retry-once
   loopback fallback), re-registers OSC interest for retained slots, clears
   the per-server `#loaded`/`#adopted` knowledge (Take heals via
   adopt-CLEAR + re-ADD per B-039), and reconnects — WITHOUT restarting the
   WS bridge or dropping clients. Failure semantics: LAND-ON-NEW-CONFIG (an
   unreachable host is not an error — health honestly shows disconnected).
   `connections.config-changed` publishes the new config to every client.
2. **Remote server** — the config may point A (and B) at a non-loopback
   host. The template serve path derives routable bind/serve as before, and
   the OSC bind now derives the same way (loopback server → `127.0.0.1`,
   remote → `0.0.0.0`). The LAN-exposure fact is returned to the panel and
   printed to stderr.
3. **On-air safety** — reconfiguration is REFUSED (bridge-authoritative)
   while anything is on air or unsettled: any item `playing` / `on-air` /
   `updating` / `exiting` / `unconfirmed`, or `pending`. The UI mirrors the
   predicate to pre-disable Apply with the reason.
4. **Remove-All** — new `stack.remove-all` channel;
   `CasparRuntime.removeAll()` sequentially runs the existing per-item
   `remove()` (urgent CLEAR, interest removal, dealloc, adoption mark) for
   every stack item — clears air AND empties the list; caution-variant
   button with confirm in the StackPanel header. This is the sanctioned
   on-air-clearing path that unblocks reconfiguration.
5. **SECURITY invariant** — the control WebSocket stays loopback-bound
   regardless of server config: there is NO code path from `ConnectionConfig`
   to the WS bind (structural), stated in the spec and asserted by an
   integration test. Control plane loopback always; data plane (template
   HTTP out, OSC UDP in) routable ONLY when the declared server is remote.
6. **Persistence** — bridge-side JSON file (`persistPath` option; bin
   default `~/.cg-runtime/bridge-connection.json`; atomic tmp+rename;
   persisted only after a successful apply). Boot precedence: explicit CLI
   flags > persisted file (Zod-validated, invalid → warn+ignore) >
   `defaultConnection()`.

UI: `ServerSettingsPanel` (modal, AuditPanel pattern, opened from a StatusBar
SERVERS button): primary host/AMCP/OSC, optional backup add/remove, strategy +
auto-failover (required schema fields), Apply gated on the on-air predicate
with the reason shown, non-loopback warning row confirmed post-apply from the
response's `exposed`. Bridge-contract ripple chased through `runtime-bridge.ts`,
`WebSocketRuntime`, and the mock wrapper + `MockRuntime` parity.

## Capabilities

- `runtime-caspar-bridge` (MODIFIED — Requirement "The bridge binds loopback
  by default": the invariant now stated against runtime reconfiguration and
  the data-plane boundary; ADDED — Requirement "Server connection is
  reconfigurable at runtime, gated on air"; ADDED — Requirement "The
  connection config persists across bridge restarts").
- `runtime-ui` (ADDED — Requirement "Server settings panel and Remove-All").
- Ordering: the held `fix-amcp-escaping-v2` / `reconnect-reconciliation`
  deltas own neither the loopback requirement nor any `runtime-ui`
  requirement (verified against their delta headings), so this change
  archives ordering-independent of that pair.

## Impact

- `packages/shared-ipc` (new channels + exported `ConnectionConfigSchema`),
  `tools/caspar-bridge` (`CasparRuntime.setConfig`/`removeAll`/on-air gate,
  OSC-bind derivation, routes, persistence, bin flags), `apps/runtime`
  (contract, WebSocketRuntime, mock parity, ServerSettingsPanel, StackPanel
  Remove-All, StatusBar button), tests across all three + Playwright e2e.
- Frozen (reference only): AMCP escape rule, B-044 lifecycle,
  reconnect-reconciliation behavior, R-003, and the B-046 redundancy
  internals (this change CONSUMES the optional-backup shape; the adapter's
  divergence/journal logic is untouched).
- Validation is mock/integration-based; an OPTIONAL live remote smoke is a
  Part-C nice-to-have, not a gate.
