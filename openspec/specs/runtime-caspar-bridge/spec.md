# runtime-caspar-bridge Specification

## Purpose

TBD - created by archiving change caspar-bridge-architecture. Update Purpose after archive.

## Requirements

### Requirement: The bridge hosts the full caspar-client stack (thick bridge)

The system SHALL run the complete `@cg/caspar-client` stack — `ServerSession`,
`CommandQueue`, the OSC pipeline, `Reconciler`, and `LayerManager` — inside a
localhost Node bridge process (`tools/caspar-bridge`), using
`AmcpTransport`/`OscTransport` with real sockets. Protocol logic SHALL NOT run in
the browser, and `@cg/caspar-client` SHALL NOT be imported by the renderer or the
browser platform layer.

The bridge SHALL connect to a CasparCG server from a connection config (AMCP
host/port + OSC bind). In Phase 2 this is integration-tested **only against
`tools/amcp-mock`**, NOT real hardware; real redundancy/failover across two
sessions and on-hardware validation are Phase 3.

#### Scenario: Real stack runs in the bridge

- **WHEN** the bridge starts with a connection config **THEN** it drives a real
  `ServerSession` (AMCP over TCP, OSC over UDP) with `CommandQueue`, `Reconciler`,
  and `LayerManager`, and no `@cg/caspar-client` / `node:*` import crosses into
  browser code

#### Scenario: The throwaway in-memory backing is gone

- **WHEN** the bridge answers stack channels **THEN** it does so from the
  `Reconciler`, not a hand-rolled in-memory state machine

### Requirement: Browser↔bridge wire protocol is `@cg/shared-ipc` over a WebSocket

The browser and the bridge SHALL communicate over a single WebSocket carrying the
existing `@cg/shared-ipc` request/response and publish channels as JSON frames —
the same contract `MockRuntime` implements. The system SHALL NOT define a
low-level AMCP/OSC byte protocol over the WebSocket. Both ends SHALL validate
each frame against the channel's Zod schema at the boundary.

The wire **frame envelope** SHALL be defined once and shared by both ends (in
`@cg/shared-ipc`), as JSON-serialized frames discriminated by `type`:

- `request` — `{ type: 'request', id, channel, payload }`
- `response` — `{ type: 'response', id, payload }` or `{ type: 'response', id, error }`
- `publish` — `{ type: 'publish', channel, payload }`

A request and its response SHALL be correlated by `id`. The inner `payload` of
each frame SHALL be the existing channel's request / response / publish schema,
validated against that channel before dispatch (request) and before send
(response/publish).

In Phase 1 the bridge answers from a throwaway in-memory backing (no
`@cg/caspar-client`, no real sockets); Phase 2 replaces that backing behind the
unchanged envelope.

#### Scenario: Channel calls are relayed over the WebSocket

- **WHEN** the renderer invokes a `RuntimeBridge` method **THEN** it is serialized
  as the corresponding `@cg/shared-ipc` channel frame, answered by a correlated
  response frame, and push channels arrive as `publish` frames — with the renderer
  unchanged

#### Scenario: Round-trip is provable end to end through an in-memory backing

- **WHEN** the bridge runs its in-memory backing and a `WebSocketRuntime` connects
  **THEN** `stack.load` / `take` / `update` / `out` issued over the WebSocket are
  reflected back to the browser via `stack.state-changed` publish frames, proving
  the full request/response + publish round-trip without any real CasparCG

#### Scenario: Frames are schema-validated at the boundary

- **WHEN** a frame arrives whose inner payload does not match its channel schema
  **THEN** it is rejected at the boundary (the request gets an `error` response;
  a malformed publish is dropped) rather than reaching application logic

### Requirement: Commands reach a reachable CasparCG server

The Runtime's take / update / out intents SHALL reach a reachable CasparCG server
through the bridge's `ServerSession` + `CommandQueue` + `AmcpTransport` whenever
the bridge is running and the server is reachable. The load path SHALL build the
`CG ADD` template argument as the **served `/template/<id>` URL** (not the bare
template id) and SHALL carry the item's **real field values** — the template's
field-schema defaults at minimum, and operator-entered Inspector values when
present — never an empty `"{}"`. The command-construction seam is unchanged; the
caller supplies the served URL and the real field values.

#### Scenario: Take/update/out reach the server

- **WHEN** the bridge is running and a CasparCG server is reachable **THEN**
  take / update / out from the Runtime reach the server

#### Scenario: Load issues CG ADD with the served URL and real fields

- **WHEN** a registered template (with field defaults) is loaded **THEN** the
  `CG ADD` template argument is its served `/template/<id>` URL and the data
  argument is the seeded field values (not `"{}"`), so CasparCG fetches and renders
  a real page; a subsequent `CG UPDATE` carries the operator's edited values

### Requirement: Stack state updates from real OSC confirmations

The OSC firehose SHALL be consumed and reduced entirely inside the bridge
(interest → rate-limit → change-track → `Reconciler`); only reconciled
`StackItemState` deltas SHALL cross the WebSocket via `StackStateChangedChannel`.
Stack item states SHALL reflect real OSC confirmations from the server, with the
`Reconciler` as the single source of truth — not an internal state machine.
Outbound deltas SHALL be coalesced per `itemId` (last-write-wins) and SHALL NOT
be unbounded-queued.

#### Scenario: Real OSC drives stack state

- **WHEN** the server emits OSC (a layer's `foreground/producer` flips to
  `html` / `empty`) **THEN** the affected item's reconciled status updates from
  that real confirmation (e.g. `on-air` when the producer is live, `idle` when it
  empties), routed via the `LayerManager`-driven interest set — and raw OSC does
  not cross the WebSocket

#### Scenario: Outbound deltas are coalesced, not unbounded-queued

- **WHEN** OSC churns faster than the UI needs **THEN** the bridge coalesces
  pending `StackItemState` changes per `itemId` (last-write-wins) into bounded
  snapshot publishes rather than queuing every intermediate state

### Requirement: Bridge selection at boot

`createRuntimeBridge()` SHALL be async and decide the backend **once** at startup
by probing the configured bridge WebSocket with a short timeout (default 1500ms).
The Runtime SHALL present the same UI either way and SHALL NOT crash when the
bridge is absent.

#### Scenario: Bridge reachable

- **WHEN** the bridge WebSocket connects within the timeout **THEN** the app uses
  the `WebSocketRuntime` and shows a "connected / live" indicator

#### Scenario: Bridge absent

- **WHEN** the probe is refused or times out **THEN** the app falls back to
  `MockRuntime` **AND** shows a persistent, unmistakable
  "OFFLINE (mock) — not connected to CasparCG" indicator

### Requirement: Live connection is never silently downgraded

A connection chosen as live SHALL NOT be silently replaced by the mock. A
mid-session loss of the bridge SHALL surface as a visible disconnected state with
rejected commands, never as on-air or mock activity.

#### Scenario: Bridge drops mid-session

- **WHEN** the WebSocket to a previously-connected bridge drops **THEN**
  `WebSocketRuntime` enters a visible DISCONNECTED/reconnecting state and
  take / update / out are rejected with a clear error (NOT shown as on-air, NOT
  routed to a mock)
- **AND** on reconnect the renderer re-pulls a full snapshot (stack / health /
  lock) to resync

#### Scenario: Command issued while disconnected

- **WHEN** the operator issues take / update / out while the bridge is down
  (disconnected/reconnecting) **THEN** the command is rejected with a visible
  error and is never shown optimistically as on-air

### Requirement: The bridge binds loopback by default

The bridge SHALL bind its WebSocket server to `127.0.0.1` by default, enforced at
socket bind (not merely documented). LAN exposure SHALL require explicit
configuration and SHALL never be the default.

#### Scenario: Default bind is loopback-only

- **WHEN** the bridge starts with no host override **THEN** it binds `127.0.0.1`
  at the socket level, so non-loopback origins cannot reach it

### Requirement: Failover to backup per the redundancy strategy

The bridge SHALL run two `ServerSession`s (A/B) under the `@cg/caspar-client`
`RedundancyAdapter`, each built from its own connection config (AMCP host/port +
OSC bind). WHEN the active (primary) server fails — per the redundancy strategy's
triggers (primary-session disconnect/degraded, the command-timeout budget, or a
5xx burst) — the adapter SHALL switch to the backup, and subsequent commands SHALL
continue to the new primary. The operator SHALL also be able to switch manually
via the `connections.failover` channel (`adapter.failover('manual')`).

`connections.health` SHALL reflect the **real** current primary, both sessions'
live states, and the last failover event — replacing the earlier mock health. The
Reconciler SHALL remain the source of truth across a switch: it consumes OSC from
the **current primary** (both sessions receive mirrored commands and OSC interest
is registered on both), so the new primary's OSC re-confirms state after failover.

The browser side and the `@cg/shared-ipc` wire SHALL remain unchanged, and the
bridge SHALL stay bound to `127.0.0.1` by default.

#### Scenario: Auto-failover on primary failure

- **WHEN** the primary server fails (its session drops/degrades) **THEN** the
  `RedundancyAdapter` switches to the backup per the configured strategy, commands
  continue to the new primary, and `connections.health` reports the new current
  primary plus a `lastFailover` event

#### Scenario: Manual failover via the channel

- **WHEN** the operator invokes `connections.failover` **THEN** the adapter performs
  a real `manual` switch to the backup, and `connections.health` reflects the new
  current primary with a `lastFailover` of reason `manual`

#### Scenario: Stack state survives the switch

- **WHEN** failover completes **THEN** the Reconciler keeps the stack state and
  re-confirms it from the new primary's OSC (no reset to a mock), with the bridge
  still loopback-bound and the browser/wire unchanged

### Requirement: AMCP command construction sits behind a verifiable seam

The bridge SHALL construct AMCP commands (load / keep-alive / update / stop for
HTML producers) behind a small command-construction seam, so the
on-hardware-verified sequence (ADR 0006) can be slotted in without reworking the
session / queue / reconciler. The verified sequence SHALL be established on real
CasparCG before this capability is considered complete, and ADR 0006 / Phase 4 §9
SHALL be updated with it.

In Phase 2 the seam emits an **`amcp-mock`-validated, NOT hardware-validated**
sequence: `load → CG ADD`, `take → CG PLAY`, `update → CG UPDATE`, `out → CLEAR`.
ADR 0006's candidate update verbs (`CALL "update"` / `CG INVOKE`) remain
unresolved on hardware; `amcp-mock` acks `CG UPDATE`, so Phase 2 uses it.

#### Scenario: The update sequence can change without reworking the stack

- **WHEN** the verified AMCP update sequence is determined on real hardware
  (Phase 3) **THEN** it is applied at the command-construction seam without changes
  to `ServerSession` / `CommandQueue` / `Reconciler`, and ADR 0006 is updated

#### Scenario: The Phase-2 sequence is marked mock-validated

- **WHEN** the seam is consulted **THEN** code and spec clearly mark the Phase-2
  command sequence as `amcp-mock`-validated and NOT yet hardware-validated

### Requirement: The single-file HTML exporter is a shared, browser-importable package

The scene → self-contained-HTML single-file export SHALL live in one shared,
browser-tier package (`@cg/single-file-export`) consumed by BOTH the Designer and
the Runtime — exactly one exporter and one runtime bundle, no per-app copy. The
package SHALL contain no Node-only APIs that would break browser bundling. This is
the architectural precondition for the bridge to obtain render HTML (B-038
Phase 2+); extracting it SHALL NOT change the produced HTML.

#### Scenario: One exporter, both apps

- **WHEN** the Designer's export feature and the Runtime both need the single-file
  HTML **THEN** they import the same `@cg/single-file-export` package (one
  exporter, one bundle), and both build green

#### Scenario: Extraction preserves byte-identical export output

- **WHEN** the Designer exports a composition after the extraction **THEN** the
  produced HTML is byte-identical to before — same base64-inlined fonts and images,
  same IIFE runtime, same scene literal — as proven by the existing single-file
  export unit tests and the D-019 export E2E

### Requirement: Imported templates deliver their rendered HTML to the bridge

The `templates.import` channel SHALL carry the template's rendered **self-contained
HTML** (a string) alongside its `TemplateInfo`. At import the browser SHALL produce
that HTML from the unpacked `.vcg` via the shared single-file export (operator
`asset-*` fonts and images inlined as base64 data URIs, so the page references no
external resources) and deliver `{ template, html }` over the channel. The payload
SHALL be validated at the channel boundary. This is a Runtime-only channel; the
Designer does not consume it.

The bundled app fonts (Vazirmatn / Exo 2) are **not** inlined in this phase — the
Runtime ships no bundled faces — so a template relying on them renders with a
fallback face until Phase 3 wires bundled-font inlining. The produced HTML
nonetheless stays self-contained (no broken external font references).

#### Scenario: Import produces and delivers the standalone HTML

- **WHEN** the operator imports a verified `.vcg` **THEN** the browser produces the
  self-contained single-file HTML (runtime + scene inlined; no external `<link>` or
  `https:`/`/fonts/` references) and sends it over `templates.import` together with
  the `TemplateInfo`

#### Scenario: Image assets are inlined from the package

- **WHEN** the imported `.vcg` contains an image element whose bytes are in the
  package **THEN** the produced HTML inlines that image as a base64 `data:` URI
  (resolved from the `.vcg`'s unpacked file map), so the delivered page carries the
  image with no external fetch

#### Scenario: A bad package delivers nothing

- **WHEN** the uploaded file fails verification, cannot be unpacked, or the export
  fails **THEN** a clear error is shown, `templates.import` is not called, and
  nothing is registered (the R-001 invariant)

### Requirement: The bridge retains delivered template HTML keyed by id

The bridge's in-memory template registry SHALL store the delivered HTML keyed by
`templateId` alongside the `TemplateInfo` it already holds. Re-importing the same
id SHALL replace the stored HTML (and info). The registry SHALL expose the stored
HTML by id so a later phase can serve it over HTTP (`GET /template/<id>`) and
resolve the `CG ADD` URL to it. The registry holds the HTML only — it does **not**
serve it in this phase. The store is in-memory (empty on bridge restart);
browser-side retention + re-delivery on reconnect was descoped from B-038's
close and is tracked as an open follow-up in `docs/prd/bugs-runtime.md` — until
it lands, a bridge restart requires a manual re-import.

#### Scenario: Import retains the HTML by template id

- **WHEN** a `templates.import` for id `X` arrives over the WebSocket **THEN** the
  bridge stores the HTML so the registry returns exactly that HTML for id `X`, and
  `templateGet` / `templateList` still surface its `TemplateInfo`

#### Scenario: Re-import replaces the stored HTML

- **WHEN** a second `templates.import` for the same id `X` arrives with different
  HTML **THEN** the registry returns the new HTML for id `X` (the prior HTML is
  replaced, not duplicated)

#### Scenario: Unknown id has no stored HTML

- **WHEN** the registry is queried for the HTML of an id that was never imported
  **THEN** it returns nothing (null), with no error

### Requirement: The bridge serves retained template HTML over HTTP

The bridge SHALL run a small HTTP server (separate from the control WebSocket)
that serves each retained template at a stable URL `/template/<templateId>`,
returning the stored HTML as `200 text/html; charset=utf-8`, and `404` for an id
that is not registered. The HTML is served from the in-memory `TemplateRegistry`
(the Phase-2 retention seam, `templateHtml(id)`). Re-importing an id SHALL serve
the replacement HTML on the next fetch; removing/clearing a template SHALL stop
serving it. The server holds template HTML only — it exposes no control surface.

The served HTML SHALL be self-contained: the runtime, scene, images, AND the
bundled app fonts (Vazirmatn / Exo 2) are inlined (base64), so CasparCG fetches
nothing else — Persian text renders with the correct face and intact shaping.

#### Scenario: A known template serves its stored HTML

- **WHEN** a registered template's URL `/template/<id>` is fetched **THEN** the
  server returns `200 text/html; charset=utf-8` with exactly the stored HTML

#### Scenario: An unknown template id is 404

- **WHEN** `/template/<id>` is fetched for an id that was never imported **THEN**
  the server returns `404`

#### Scenario: Re-import replaces the served HTML

- **WHEN** a template id is re-imported with different HTML **THEN** the next fetch
  of its URL returns the new HTML (the prior HTML is no longer served)

#### Scenario: The served page is self-contained including fonts

- **WHEN** the served HTML is inspected **THEN** it contains the bundled Persian
  `@font-face` faces inlined as base64 `data:` URIs and references no external
  `/fonts/…`, `https:` or `<link>` resource

### Requirement: The bridge's template HTTP server is reachable by CasparCG

The template HTTP server SHALL serve on a host CasparCG can reach, while the
control WebSocket SHALL remain bound to `127.0.0.1`. WHEN CasparCG is local
(connection host is loopback) the server SHALL bind `127.0.0.1` and the `CG ADD`
URL SHALL use `127.0.0.1` (no LAN exposure). WHEN CasparCG is remote the server
SHALL bind a routable interface **only by explicit opt-in** and the `CG ADD` URL
host SHALL be the bridge's address as CasparCG sees it (configured, or a guessed
LAN IPv4), logged loudly.

#### Scenario: Local CasparCG stays loopback

- **WHEN** CasparCG runs on the same machine **THEN** the template server serves on
  `127.0.0.1`, the `CG ADD` URL uses `127.0.0.1`, and the control WebSocket stays
  loopback

#### Scenario: Remote CasparCG uses an opt-in routable serve host

- **WHEN** CasparCG runs on another host **THEN** the template server binds a
  routable interface by explicit configuration and the `CG ADD` URL uses the
  bridge's CasparCG-reachable address (configured or guessed), while the control
  WebSocket stays loopback

### Requirement: Template resolution is validated, not blind-acked

`tools/amcp-mock` SHALL stop blind-acking `CG ADD`: it SHALL resolve the template
argument — for a URL, an HTTP `GET` (`202` only when it returns a page; `404 CG ADD
FAILED` otherwise) and a bare non-URL id SHALL be `404` — and SHALL expose the
`CG ADD` / `CG UPDATE` data payload so tests can assert it is the real, non-empty
field JSON. Integration tests SHALL exercise a real served URL and non-empty field
values end-to-end, not just command acceptance.

#### Scenario: Mock 404s an unresolvable template reference

- **WHEN** `CG ADD` references a bare id or a URL the mock cannot `GET` **THEN** the
  mock returns `404 CG ADD FAILED` (matching real CasparCG), so a "looks acked,
  renders nothing" regression fails the test

#### Scenario: Integration test asserts a served URL + real fields

- **WHEN** the bridge (with its HTTP server) drives the hardened mock for a loaded,
  taken, then updated template **THEN** the test asserts `CG ADD` used a served URL
  the mock fetched (`202`) and a non-empty field payload, and `CG UPDATE` carried
  the updated fields
