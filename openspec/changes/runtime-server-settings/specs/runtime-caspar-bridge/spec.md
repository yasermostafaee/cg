# runtime-caspar-bridge (runtime server settings — R-010)

## MODIFIED Requirements

### Requirement: The bridge binds loopback by default

The bridge SHALL bind its WebSocket server to `127.0.0.1` by default, enforced
at socket bind (not merely documented). LAN exposure of the control WebSocket
SHALL require explicit configuration and SHALL never be the default.

The control-plane bind SHALL be independent of the CasparCG connection config:
no `ConnectionConfig` — including one applied at runtime via
`connections.set-config`, and including one that declares a REMOTE server —
may change where the control WebSocket binds. Only the DATA plane follows the
declared server's locality: the template HTTP server (content CasparCG
fetches) and the OSC UDP ingest (inbound telemetry only) bind routable
interfaces ONLY when the declared server host is non-loopback.

#### Scenario: Default bind is loopback-only

- **WHEN** the bridge starts with no host override **THEN** it binds
  `127.0.0.1` at the socket level, so non-loopback origins cannot reach it

#### Scenario: A remote server config never exposes the control plane

- **WHEN** a config declaring a remote (non-loopback) CasparCG host is applied
  at runtime **THEN** the control WebSocket remains bound to `127.0.0.1` (a
  new loopback client still connects and round-trips) **AND** only the
  template serve and OSC ingest go routable, with the LAN exposure reported to
  the operator

## ADDED Requirements

### Requirement: Server connection is reconfigurable at runtime, gated on air

The bridge SHALL accept a new `ConnectionConfig` (primary required, backup
optional) over a `connections.set-config` channel, validated against the
shared schema, and SHALL apply it to the RUNNING process: the declared
sessions and redundancy adapter are torn down and rebuilt from the new
config, OSC interest is re-registered for retained slots, the per-server
producer/adoption knowledge is reset (so a later Take heals via
adopt-CLEAR + re-ADD), the template serve options are re-derived from the new
primary host, and the sessions reconnect — WITHOUT restarting the WebSocket
bridge or dropping connected clients. The OSC bind SHALL derive from each
declared server's locality exactly like the template serve path (loopback
host → loopback bind; remote host → routable bind), so a remote server's
confirmations arrive.

Reconfiguration SHALL be REFUSED (bridge-authoritative) while anything is on
air or unsettled: any stack item with status `playing`, `on-air`, `updating`,
`exiting`, or `unconfirmed`, or with a pending intent, blocks the switch with
a clear reason. Items resting `idle`/`loaded`/`error`/`disconnected` do not
block.

Failure semantics SHALL be land-on-new-config: an invalid config is rejected
at the schema layer with nothing changed; an unreachable host is NOT an apply
error (sessions retry with backoff and health honestly reports
`disconnected`); if the template serve fails to bind even after a loopback
retry, the bridge reports `apply-failed` and remains running on the new
config in a defined, non-crashing state. Every applied config SHALL be
published to all connected clients (`connections.config-changed`).

The stack list SHALL be clearable in one operation (`stack.remove-all`): every
item is OUTed and REMOVEd with the per-item CLEAR-destroys semantics, in
sequence, clearing air and emptying the list — the sanctioned path to unblock
reconfiguration.

#### Scenario: Re-point to a different server

- **WHEN** nothing is on air and the operator applies a config naming a
  different CasparCG **THEN** the bridge rebuilds its sessions against the
  new server, subsequent loads/takes reach that server, and every connected
  client receives the new config and fresh health

#### Scenario: Refused while on air, accepted after Remove-All

- **WHEN** any item is on air (or unsettled) and a new config is applied
  **THEN** the bridge refuses with an on-air reason and nothing changes
- **WHEN** the operator runs Remove-All **THEN** every item is OUTed and
  REMOVEd (air cleared, list emptied) and a subsequent apply of the same
  config succeeds

#### Scenario: Unreachable host is honest, not fatal

- **WHEN** a config naming an unreachable host is applied with nothing on air
  **THEN** the apply succeeds, the sessions enter their normal
  reconnect/backoff loop, health reports the disconnected state, and the
  bridge neither crashes nor drops WS clients

### Requirement: The connection config persists across bridge restarts

The bridge SHALL persist a successfully applied `ConnectionConfig` to a local
JSON file (atomic write) when a persist path is configured, and SHALL load it
at boot with the precedence: explicit CLI connection flags > persisted file
(schema-validated; an invalid file is warned about and ignored) > the built-in
single-server default. A configured remote setup therefore survives a bridge
restart without being re-entered.

#### Scenario: Persisted config survives a restart

- **WHEN** a config is applied via `connections.set-config` and the bridge is
  restarted with the same persist path and no CLI connection flags **THEN**
  the bridge boots connecting to the persisted servers

#### Scenario: CLI flags override the persisted file

- **WHEN** the bridge starts with explicit connection flags **THEN** those
  flags win for the session and the persisted file is not silently
  overwritten by boot
