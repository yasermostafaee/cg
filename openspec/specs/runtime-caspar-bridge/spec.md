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

OSC truth is **transition-driven**: the change-track stage suppresses repeated
identical values, so OSC observations exist only around producer-state
transitions. Verbs that cause no producer transition (`CG UPDATE`) SHALL NOT
depend on OSC for intent completion — their completion signal is the AMCP ack
(see "Transient stack intents complete on ack or expire").

A producer's mere existence is NOT play evidence (B-053): CasparCG stage-plays
the html producer at `CG ADD` while the template page stays hidden until its
`play()` is invoked, and `CG PLAY` causes no OSC-observable transition — a
load-only producer is wire-identical to a played one. The `Reconciler` SHALL
store the raw observation (producer present vs empty) and derive the truth
status at READ time from the item's own intent-side play evidence: a non-empty
producer observation SHALL read `on-air` only for an item the operator has
taken (a `take` intent recorded since the item's record was created), and
`loaded` otherwise; an `empty` observation reads `idle`. Deriving at read time
means a take issued while a load-time observation is still fresh immediately
re-reads as `on-air` (the pre-existing optimistic confirm), and the value
published at observation time equals the value the merge ladder resolves to
after the truth TTL decays — the badge never reverts-and-sticks.

#### Scenario: Real OSC drives stack state

- **WHEN** the server emits OSC (a layer's `foreground/producer` flips to
  `html` / `empty`) **THEN** the affected item's reconciled status updates from
  that real confirmation — `on-air` when a producer is live on a TAKEN item,
  `loaded` when a producer merely exists for a never-taken item, `idle` when
  the layer empties — routed via the `LayerManager`-driven interest set, and
  raw OSC does not cross the WebSocket

#### Scenario: First load per layer rests READY, not ON AIR

- **WHEN** a template is loaded (`CG ADD`, play-on-load OFF) onto a layer whose
  producer report passes the change-tracker (the first load on that layer this
  bridge process, or a post-reconnect resync re-observation) and no take has
  been issued **THEN** the item's published status is `loaded` (badge READY,
  PLAY enabled, UPDATE/OUT gated) — never `on-air` — and it stays `loaded`
  after the OSC truth TTL decays with no further event (no revert-and-stick)

#### Scenario: A take within the fresh-observation window confirms on-air immediately

- **WHEN** the operator takes an item while its load-time producer observation
  is still within the truth TTL **THEN** the reconciled status reads `on-air`
  at once (the same fresh observation now carries play evidence), preserving
  the pre-existing optimistic confirm

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

### Requirement: Failover to backup per the redundancy strategy

The bridge SHALL run one `ServerSession` per DECLARED server under the
`@cg/caspar-client` `RedundancyAdapter`: always A (primary), and B (backup)
only when the connection config declares it. Each session is built from its
own connection config (AMCP host/port + OSC bind).

WHEN a backup is declared and the active (primary) server fails — per the
redundancy strategy's triggers (primary-session disconnect/degraded, the
command-timeout budget, or a 5xx burst) — the adapter SHALL switch to the
backup, and subsequent commands SHALL continue to the new primary. The
operator SHALL also be able to switch manually via the `connections.failover`
channel (`adapter.failover('manual')`). WHEN no backup is declared, manual
failover SHALL be refused (`ok: false`) and auto-failover SHALL never fire.

The failover triggers SHALL key off the CURRENT primary at event time: the
adapter binds its state-change handling to both sessions at construction and
evaluates `label === currentPrimary` when each event fires (no listener
rebinding). After a failover A→B, the death of B SHALL fire the auto trigger,
and state changes of the demoted A SHALL NOT.

Backup divergence accounting SHALL be gated on backup liveness: a
backup-unreachable send failure counts as a mirror divergence ONLY while the
backup session believes itself live (`healthy`/`degraded`); a rejected send
to a disconnected/connecting/resyncing backup records nothing. A divergence
between two answered ack codes SHALL always count. The corrective resend and
any failover-time journal replay SHALL skip a target session that is not
live at fire time. A genuinely diverged LIVE backup SHALL still escalate to
`split-brain-persistent` and receive the corrective resend.

`connections.health` SHALL reflect the **real** current primary, every
declared session's live state (no backup entry when none is declared), and
the last failover event. Aggregated health SHALL be published only when the
aggregate actually changed (no repeat publishes of an unchanged snapshot).
The Reconciler SHALL remain the source of truth across a switch: it consumes
OSC from the **current primary** (declared sessions receive mirrored commands
and OSC interest is registered on each), so the new primary's OSC re-confirms
state after failover.

The browser side and the `@cg/shared-ipc` wire SHALL remain unchanged, and
the bridge SHALL stay bound to `127.0.0.1` by default.

#### Scenario: Auto-failover on primary failure

- **WHEN** a backup is declared and the primary server fails (its session
  drops/degrades) **THEN** the `RedundancyAdapter` switches to the backup per
  the configured strategy, commands continue to the new primary, and
  `connections.health` reports the new current primary plus a `lastFailover`
  event

#### Scenario: Manual failover via the channel

- **WHEN** the operator invokes `connections.failover` with a backup declared
  **THEN** the adapter performs a real `manual` switch to the backup, and
  `connections.health` reflects the new current primary with a `lastFailover`
  of reason `manual`
- **WHEN** the operator invokes `connections.failover` with NO backup
  declared **THEN** the call is refused (`ok: false`) and the primary is
  unchanged

#### Scenario: Stack state survives the switch

- **WHEN** failover completes **THEN** the Reconciler keeps the stack state
  and re-confirms it from the new primary's OSC (no reset to a mock), with
  the bridge still loopback-bound and the browser/wire unchanged

#### Scenario: Triggers follow the current primary (B-047)

- **WHEN** a failover A→B has completed and B subsequently dies **THEN** the
  auto-failover trigger fires (keyed off B, the current primary)
- **AND WHEN** the demoted A's reconnect loop keeps changing state **THEN**
  no auto-failover fires off A's transitions (primary never ping-pongs back
  onto a dead server)

#### Scenario: Dead backup is quiet; live diverged backup is not

- **WHEN** a declared backup is down (session not live) and the operator
  drives playout **THEN** sends succeed on the primary with NO
  `mirror-divergence`, NO `split-brain-persistent`, and NO corrective resend
  (the backup's down state remains visible via health)
- **WHEN** a declared backup is LIVE and its ack codes genuinely diverge past
  the budget **THEN** `split-brain-persistent` fires and the corrective
  resend replays the retained ok-journal entries to the backup

### Requirement: AMCP command construction sits behind a verifiable seam

The bridge SHALL construct AMCP commands (load / play / update / clear for HTML
producers) behind a small command-construction seam, so the verified sequence is
isolated from the session / queue / reconciler. The sequence is:
`load → CG ADD` **with play-on-load OFF** (loaded, not playing), `take → CG PLAY`
(preceded by a re-issued `CG ADD` when no live producer exists on the slot),
**`update → CG UPDATE`**, `out → CLEAR`. `CG UPDATE` remains the
**hardware-validated** (CasparCG 2.3.2 `4de6d18f`, ADR 0006) way to deliver a
Persian-laden JSON payload to `window.update` intact.

Every AMCP string argument SHALL be quoted by a **single canonical quoter** (one
source of truth), applied **exactly once** per argument. Because the data argument
is already a `JSON.stringify` string (the JSON layer has escaped `"`, `\`, and
newline), the AMCP layer SHALL escape **only what CasparCG 2.3.x's quoted-string
parser requires** — a `"` → `\"` (the one escape CasparCG un-escapes) — and SHALL
NOT re-escape backslashes (which would double them and corrupt the payload). A JSON
payload containing `"`, `\` (any count), or a newline SHALL therefore survive
`CG ADD` and `CG UPDATE` byte-exact to what the template's `JSON.parse` receives.
The load/take/out/retake cycle AND the special-character payload SHALL be
re-validated on real CasparCG before B-041 closes.

#### Scenario: The verified update sequence is applied at the seam

- **WHEN** the bridge updates a playing HTML producer **THEN** it issues the
  hardware-validated `CG UPDATE` via the command-construction seam — established on
  real CasparCG 2.3.2 (ADR 0006) — without changes to `ServerSession` /
  `CommandQueue` / `Reconciler`

#### Scenario: Special characters survive the AMCP data argument

- **WHEN** a field value contains a double-quote, a backslash (odd or even count),
  or a newline **THEN** the canonical quoter (applied once over the JSON payload)
  produces a `CG ADD` / `CG UPDATE` data argument that round-trips byte-exact: the
  value reaches the template's `JSON.parse` unchanged (Persian intact), with no
  double-escaping

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
argument (for a URL, an HTTP `GET` — `404 CG ADD FAILED` when it does not return a
page; a bare id → `404`) and SHALL expose the `CG ADD` / `CG UPDATE` data payload so
tests can assert it. The mock SHALL decode quoted arguments per **real CasparCG
2.3.x rules** (un-escape only `\"` → `"`; every other character, including `\`,
literal), **independently of the bridge's own escaper**, so a double-escaped payload
is decoded WRONG (caught) and only a correctly single-escaped payload decodes to the
original. Integration tests SHALL `JSON.parse` the decoded data argument and assert
it equals the original object.

#### Scenario: Mock 404s an unresolvable template reference

- **WHEN** `CG ADD` references a bare id or a URL the mock cannot `GET` **THEN** the
  mock returns `404 CG ADD FAILED` (matching real CasparCG)

#### Scenario: Mock decodes the data arg per real CasparCG and catches double-escaping

- **WHEN** a `CG ADD` / `CG UPDATE` data argument is decoded by the mock **THEN** it
  un-escapes only `\"`→`"` (backslashes literal) and the test `JSON.parse`s the
  result: a correctly single-escaped payload equals the original object, while the
  old double-escaped payload decodes to a different (corrupted) object — so the
  regression fails the test instead of passing silently

### Requirement: Playout verbs are chosen from producer state (prescriptive)

The bridge SHALL choose the AMCP playout verb sequence from the **actual per-slot
producer state**, not blindly. It SHALL track, bridge-side, whether a live producer
currently exists on each stack item's slot — independent of the descriptive
`Reconciler` status — and keep that bookkeeping consistent across load / take / out /
remove and across a failover (commands fan out to both servers, so producer
existence is identical on each).

- **load** SHALL issue `CG ADD` only, with the **play-on-load flag OFF** — the
  producer is loaded, NOT playing.
- **take** SHALL issue `CG PLAY`; but WHEN no live producer exists on the slot (e.g.
  a prior out destroyed it) it SHALL FIRST re-issue `CG ADD` (a fresh load), THEN
  `CG PLAY`.
- **out** SHALL exit + `CLEAR` (destroying the producer) and SHALL update the
  producer-existence bookkeeping so a subsequent take re-ADDs. The slot stays
  reserved to the (still-on-stack, idle) item until remove.
- **remove** SHALL fully remove the item (clear + deallocate the layer + drop the
  bookkeeping).

#### Scenario: Load does not auto-play

- **WHEN** the operator loads a template **THEN** the bridge issues `CG ADD` with
  play-on-load OFF and the producer is loaded but NOT playing (nothing on air until
  take)

#### Scenario: Take plays the loaded producer

- **WHEN** a loaded template is taken **THEN** the bridge issues `CG PLAY` and the
  producer plays

#### Scenario: Out destroys the producer

- **WHEN** a playing template is taken out **THEN** the bridge issues `CLEAR`, the
  producer is destroyed, and the bridge records that no producer exists on that slot

#### Scenario: Take after Out re-ADDs then plays

- **WHEN** a template that was taken out is taken again **THEN** the bridge — seeing
  no live producer on the slot — FIRST re-issues `CG ADD` (a fresh load) and THEN
  `CG PLAY`, so the template renders again (it does not `CG PLAY` an empty layer)

#### Scenario: Producer existence drives the choice, not the descriptive status

- **WHEN** the bridge decides between `CG PLAY` and re-ADD-then-`CG PLAY` **THEN** it
  uses its own per-slot producer-existence bookkeeping (not the `Reconciler` status,
  which is descriptive and does not choose verbs)

### Requirement: Transient stack intents complete on ack or expire

The `updating` and `exiting` stack-item statuses SHALL be **transient**: they
SHALL NEVER be a permanent resting state. The Reconciler SHALL settle a
transient intent when the AMCP ack of the intent's own command arrives — the
`CG UPDATE` line for an update; the single `CLEAR` the bridge emits for an out:

- An OK ack SHALL settle the item to its underlying state — the pre-update
  status (normally `playing`) for an update; `idle` for an out. The ack means
  **accepted by CasparCG**; it is not proof the template applied the value
  (B-041's `202`-plus-template-failure history) — deeper applied-verification
  is out of scope of this requirement.
- A failure ack SHALL surface the existing `error` state with its `errorCode`.
- An ack for a superseded intent (an older sequence than the item's latest)
  SHALL NOT mutate the item's state.

If no ack arrives within a bounded time (5 s), the bridge SHALL expire the
intent to an explicit **`unconfirmed`** status (with an `errorCode`), surfaced
to the operator UI — never a silent revert to the prior status, never a fake
success, never an indefinite `updating`/`exiting`. A late OK ack after expiry
SHALL settle the item honestly. Any subsequent operator intent SHALL overwrite
an `unconfirmed` state.

#### Scenario: An update settles when CasparCG acks it

- **WHEN** the operator updates an on-air item and CasparCG acks the
  `CG UPDATE` with `202` **THEN** the item's status returns to its underlying
  on-air state within a bounded time — regardless of whether any OSC event
  accompanies the update (none does: an update causes no producer transition)

#### Scenario: An out settles to idle on the CLEAR ack

- **WHEN** the operator takes an item out and CasparCG acks the `CLEAR` **THEN**
  the item rests at `idle` — never permanently `exiting`

#### Scenario: A lost ack expires to an explicit unconfirmed state

- **WHEN** the bridge sends a `CG UPDATE` and no ack arrives within the bound
  (e.g. CasparCG stopped mid-update) **THEN** the item lands in the explicit
  `unconfirmed` (or `error`, for a detected send failure) state visible in the
  UI — the badge never sticks on "UPDATING"

#### Scenario: A subsequent intent clears unconfirmed

- **WHEN** an item is `unconfirmed` and the operator issues a new intent
  (update / take / out) **THEN** the new intent's lifecycle replaces the
  `unconfirmed` state

### Requirement: Single-server operation is declared, quiet, and memory-bounded

The connection config SHALL support declaring a single server: `servers.B` is
optional (`{ A: required, B?: optional }`), and `ConnectionHealth.backup` is
correspondingly optional. The bridge's default connection SHALL be
single-server (A on `127.0.0.1:5250/6250`); the CLI SHALL construct a backup
only from explicit `--backup-host` / `--backup-amcp-port` / `--backup-osc-port`
flags. Declared intent — not runtime detection — distinguishes "no backup"
(quiet) from "backup down" (alarmed via health).

Under a single-server config the redundancy machinery SHALL be inert: no
backup session is constructed (no reconnect loop, no health churn), `send()`
targets the primary only under every strategy, and no divergence, split-brain,
or corrective-resend event can be emitted. `whenServerHealthy()` SHALL resolve
when all DECLARED servers are healthy (single-server: A alone; two-server:
both). The operator UI SHALL render the absence of a backup as an explicit
"no backup" state and disable manual failover.

The command journal SHALL be memory-bounded in every configuration: the
in-memory `CommandJournal` enforces a maximum entry count and a resolved-entry
retention age on append (defaults 500 entries / 300 000 ms, tunable). The
retention window SHALL be at least 10× the divergence window so a corrective
resend for a briefly-lagged live backup never needs an evicted entry;
full-history cold-backup rebuild is explicitly the province of a persistent
`CommandJournal` implementation.

#### Scenario: Default single-server boot is quiet

- **WHEN** the bridge boots with the default (A-only) connection against one
  CasparCG **THEN** `whenServerHealthy()` resolves on A alone, playout works,
  `connections.health` carries no backup entry, and no divergence /
  split-brain / corrective-resend events are emitted over a sustained run

#### Scenario: Journal stays bounded

- **WHEN** more commands are sent than the journal's entry cap (in any
  configuration, including a healthy two-server pair) **THEN** the journal
  holds at most the cap and heap growth over a sustained soak stays under the
  leak budget

#### Scenario: Bounded journal still serves the legitimate replay

- **WHEN** a LIVE backup briefly lags and diverges past the budget within the
  divergence window **THEN** the corrective resend replays every ok entry the
  backup missed (retention ≥ 10× the divergence window guarantees they are
  retained)

#### Scenario: Operator UI shows the single-server state

- **WHEN** the runtime UI receives health with no backup **THEN** the status
  bar renders an explicit "no backup" indication (not a phantom backup card)
  and the manual failover control is disabled

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

Applies SHALL be SERIALIZED: at most one `set-config` executes at a time,
and a concurrent request is refused loudly (`reason: 'apply-in-progress'`)
with nothing changed — two applies can never interleave their
teardown/rebuild.

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

Template-serve INTEGRITY across applies: the serve teardown SHALL be bounded
(held client connections — e.g. CasparCG CEF keep-alive or preconnect
sockets — are force-destroyed, on every Node version), and whenever serving
has been started for the process, a completed apply SHALL leave the template
server genuinely listening or SHALL report `apply-failed` — never `ok` with
the serve down. A load issued while serving is intended but down SHALL be
refused loudly (`template-serve-down` on the item), and the bridge SHALL
NEVER emit a bare template id as the `CG ADD` argument in that state (an
unservable bare id is a silent 404 on real CasparCG).

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

#### Scenario: Concurrent applies cannot interleave

- **WHEN** a second `set-config` arrives while one is executing **THEN** it
  is refused with `reason: 'apply-in-progress'` and nothing changes, and a
  subsequent sequential apply succeeds with uncorrupted sessions and a
  listening template serve

#### Scenario: An apply cycle never strands the template serve silently

- **WHEN** any apply cycle completes (including one whose predecessor was
  interrupted or slow) and serving was started for this process **THEN** the
  template server is genuinely listening, or the apply reported
  `apply-failed` — never `ok` with the serve down
- **WHEN** a Load is issued while serving is intended but down **THEN** the
  load is refused with a clear `template-serve-down` reason and NO `CG ADD`
  reaches the wire (never a silent bare-id 404)

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

### Requirement: Orphaned layer occupancy is swept, surfaced, and operator-clearable

The bridge SHALL periodically compare server-side layer occupancy against the
layers it owns and surface every mismatch as an orphan: a layer whose
foreground producer is non-empty on the CURRENT PRIMARY, observed fresh, and
whose (channel, layer) is not owned by the bridge (not a reserved slot).
Occupancy SHALL be sourced from a passive tap on the already-parsed OSC
producer stream — upstream of the interest filter, adding no events to the
OSC pipeline and no AMCP traffic — so the interest set, rate limiter, and
change tracker (the B-044 firehose protections) remain untouched. (Verified
on CasparCG 2.5.0: AMCP `INFO` carries no per-layer data on the 2.3+
lineage; OSC is the only per-layer occupancy signal.)

The sweep SHALL run on a bounded periodic cadence, query only the current
primary (following it across failover and reconfiguration), and skip while
the primary session is not healthy — existing warnings freeze rather than
falsely resolve while disconnected. Surfacing SHALL be debounced (an orphan
appears after consecutive sightings; it resolves on the first sweep that
observes the layer empty or no longer reported) and published only when the
orphan set changes. The sweep timer SHALL be disposed with the runtime.

The orphan set SHALL be pullable (`layers.orphans`) and pushed on change
(`layers.orphans-changed`). A `layers.clear` request SHALL send an urgent
`CLEAR <channel>-<layer>` for a surfaced layer — refusing (`reason: 'owned'`)
any layer the bridge owns (clearing owned layers is Out/Remove's job) and
never touching slots or interest it does not own; a CLEAR executed on the
current primary counts as layer adoption. The warning resolves only on the
next sweep's observed empty — never optimistically, and the bridge SHALL
NEVER clear a layer without an explicit operator request.

#### Scenario: A foreign producer surfaces within the sweep cadence

- **WHEN** a producer exists on a layer the bridge does not own (e.g. left by
  a dead bridge session) and the primary session is healthy **THEN** within
  two sweep cycles the layer is surfaced as an orphan, named by
  channel-layer, and published to connected clients

#### Scenario: Owned layers never surface; idle is quiet

- **WHEN** every non-empty layer maps to a bridge-owned slot **THEN** no
  orphan is surfaced and nothing is published (no idle noise, no per-tick
  logging)

#### Scenario: Operator Clear resolves on observed empty

- **WHEN** the operator invokes `layers.clear` on a surfaced layer **THEN**
  the bridge sends `CLEAR <ch>-<layer>` (urgent) and the warning resolves on
  the next sweep that observes the layer empty or gone silent
- **WHEN** `layers.clear` names a layer the bridge owns **THEN** the request
  is refused with `reason: 'owned'` and nothing is sent

#### Scenario: The sweep follows the primary and freezes when it is down

- **WHEN** a failover or runtime reconfiguration switches the primary
  **THEN** subsequent sweeps read the new primary's occupancy
- **WHEN** the primary session is not healthy **THEN** the sweep skips and
  previously surfaced warnings persist unchanged (absence of knowledge never
  resolves a warning)

### Requirement: Session reconnect invalidates producer-existence bookkeeping

The bridge SHALL treat a declared session's completion of an AMCP reconnect
cycle (connect → handshake → resync → healthy) as invalidating its
producer-existence bookkeeping (`#loaded`), wholesale across items: a server
that just completed a connect cycle may have restarted, and its producer set
can no longer be vouched for. The next take therefore re-verifies through
the prescriptive re-load path (`CG ADD` then `CG PLAY`) instead of trusting
process-lifetime memory and playing an empty layer. The invalidation itself
SHALL send no AMCP commands and SHALL NOT disturb anything on air; it only
changes the verb choice of the next explicit operator take. A
degraded→healthy recovery (OSC blip with the AMCP connection intact) SHALL
NOT invalidate. Adoption bookkeeping (`#adopted`) is NOT invalidated: a
restarted server's layers are empty, so a skipped adopt-CLEAR is a no-op by
construction. The subscription SHALL survive `setConfig` session rebuilds
and failover, and SHALL die with its session objects on teardown.

#### Scenario: Take after a CasparCG restart re-loads and renders

- **WHEN** an item is loaded and taken on air, CasparCG restarts (its layers
  now empty), the AMCP session reconnects to healthy on its own, and the
  operator takes the item again **THEN** the bridge issues a fresh `CG ADD`
  (re-load, served URL, reconciler-merged fields) before `CG PLAY`, and the
  layer renders (producer exists, on air) — never a bare `CG PLAY`
  blind-acked `202` onto the empty layer

#### Scenario: Adoption memory stays; the re-load is not re-adopted

- **WHEN** the post-restart take re-loads onto a layer this process already
  adopted **THEN** no adopt-`CLEAR` precedes the re-ADD (the restarted
  server's layers are empty; the skipped CLEAR is a no-op) and the re-ADD
  lands directly

#### Scenario: A transient AMCP blip stays on-air-safe

- **WHEN** the AMCP connection drops and reconnects while the same server
  keeps its producers (no restart) **THEN** the reconnect itself sends no
  AMCP commands beyond the session handshake and nothing on air changes
- **AND** the next take conservatively re-loads onto the item's own layer
  (stage-replacing its own producer with the same template and fields) and
  then plays — an extra `CG ADD`, never a blank take

#### Scenario: Any declared session's reconnect invalidates wholesale

- **WHEN** only the backup server of a mirror pair restarts while the
  primary keeps its producers and output **THEN** the next take re-loads
  through the fan-out — recreating the backup's lost producer and benignly
  stage-replacing the primary's — so the pair reconverges instead of
  silently diverging until a failover exposes the empty backup

#### Scenario: The invalidation survives reconfiguration and failover

- **WHEN** a `setConfig` rebuilds the sessions and the newly configured
  server later restarts and reconnects **THEN** the next take still
  re-loads before playing (the subscription is rewired with the sessions)
- **AND WHEN** a failover flips the current primary and a server restart
  follows **THEN** the next take still re-loads (failover replaces no
  session objects and needs no rewiring)
- **AND WHEN** the runtime is stopped **THEN** its sessions never reconnect
  or fire the invalidation again (teardown by session lifetime)

#### Scenario: OSC-degradation recovery does not invalidate

- **WHEN** a healthy session degrades on OSC silence and recovers without
  losing the AMCP connection **THEN** producer-existence bookkeeping is
  untouched and the next take plays without a re-load (the reconnect-cycle
  signal never fires on this path)

### Requirement: Owned-slot occupancy raises a warning when adoption misses the primary

The bridge SHALL raise an owned-slot occupancy warning — identifying the
channel, layer, and item — when a load's adopt-CLEAR does NOT land on the
current primary (backup-only success, or a failed CLEAR — the layer stays
unadopted) AND the current primary session's passive OSC occupancy tap
reports the target (channel, layer) as non-empty within the R-009 freshness
window, sampled at load time BEFORE the item's own `CG ADD` is sent. The
load itself SHALL proceed exactly as without the warning: same acceptance,
same slot binding and OSC interest, same `CG ADD` — the warning is purely
additive. Unknown occupancy SHALL NOT warn: when the primary's occupancy is
unobservable (its OSC silent or stale), no warning is raised — observed
occupancy only.

The warning set SHALL be pullable (`layers.owned-occupancy`) and pushed on
change only (`layers.owned-occupancy-changed`). R-009's orphan channels,
sweep, debounce, and `layers.clear` owned-refusal are unchanged by this
requirement.

A warning SHALL resolve ONLY on provable events, never optimistically, and
the bridge SHALL NEVER auto-clear the layer:

- a bridge-issued `CLEAR` for that (channel, layer) lands on the current
  primary (`ok && onPrimary` — the adopt-CLEAR, out, remove, or an operator
  `layers.clear`), or
- the item is removed / the layer deallocated — the layer becomes unowned
  and the R-009 sweep owns surfacing whatever remains there, or
- a runtime reconfiguration (`setConfig`) swaps the server pair — warnings
  described the old primary and are dropped wholesale.

A take SHALL NOT resolve a warning (a take may `CG PLAY` the surviving
orphan on the primary once it reconnects), and a failover SHALL NOT resolve
one (a later fail-back would make the orphan live again with no
re-detection).

#### Scenario: Backup-only adopt with observed foreign occupancy warns; the load is unchanged

- **WHEN** a mirror pair's current primary has its AMCP link down (no
  failover), a previous session's producer is still reported non-empty and
  fresh by the primary's OSC occupancy tap for a layer, and a load
  allocates that layer — its adopt-CLEAR succeeding backup-only —
  **THEN** an owned-slot occupancy warning naming that channel-layer and
  the item is raised and published
- **AND** the load still proceeds unchanged: it is accepted, the slot stays
  bound to the item, and the item's own `CG ADD` is still sent

#### Scenario: Unknown occupancy does not warn

- **WHEN** the adopt-CLEAR misses the primary but the primary's occupancy
  tap has no fresh entry for the target layer (OSC silent, stale, or never
  received) **THEN** no owned-slot occupancy warning is raised — the load
  proceeds with no warning

#### Scenario: A CLEAR landing on the primary resolves the warning

- **WHEN** a warned item is taken out while the primary is still
  unreachable (the CLEAR lands backup-only) **THEN** the warning persists
- **AND WHEN** the primary's AMCP link recovers and a later out/remove
  CLEAR for that layer executes on the current primary **THEN** the warning
  resolves and the resolution is published

#### Scenario: Removing the item resolves and hands the layer to R-009

- **WHEN** a warned item is removed (directly or via Remove-All) — even
  while the primary is still unreachable — **THEN** the warning resolves
  (the layer is deallocated and unowned; the R-009 sweep surfaces any
  surviving producer as a regular orphan once the primary is observable)

#### Scenario: A take does not resolve the warning

- **WHEN** a warned item is taken **THEN** the warning persists unchanged

#### Scenario: Reconfiguration drops old-server warnings

- **WHEN** `setConfig` applies a new server pair while owned-slot warnings
  are surfaced **THEN** the warning set empties (published once) — the
  warnings described the old primary

### Requirement: Operator position overrides ride the served URL query

The bridge SHALL store at most one operator position override per stack
item (`stack.set-position`), and SHALL append it — as
`?pos=<anchor>&dx=<x>&dy=<y>` — onto the ALREADY-RESOLVED served template
URL when building a `CG ADD`, and nowhere else: never onto a bare (unserved)
template id, never into the data payload (the AMCP escape rule is
untouched), and the template-serve-down loud-failure contract stays exactly
as it is. Both a load's `CG ADD` and a take's re-ADD SHALL carry the stored
override (they share the single ADD-construction path). With no stored
override the URL carries NO position query — the bridge stays opaque about
the manifest default, which the runtime reads from the scene itself.

`stack.set-position` SHALL be REFUSED (`reason: 'on-air'`) while the item
is on air or unsettled (pending, playing, on-air, updating, exiting, or
unconfirmed — the R-010 on-air predicate), and refused
(`reason: 'unknown-item'`) for an item not on the stack. For a
LOADED-not-taken item, accepting a new position SHALL re-ADD the template
(an invisible re-serve with the new query, on a non-intent sequence so the
item's status is not perturbed); for an idle item the override is stored
for the next load. Stored overrides SHALL survive a runtime
reconfiguration (`setConfig`) — an operator's placement is not server
knowledge — and SHALL be dropped when the item is removed.

#### Scenario: No override, no query

- **WHEN** an item with no stored override is loaded **THEN** its `CG ADD`
  references the served URL with NO position query

#### Scenario: A loaded item's new position re-serves with the query

- **WHEN** the operator sets a position on a loaded-not-taken item
  **THEN** the bridge re-ADDs the served URL carrying
  `?pos=<anchor>&dx=<x>&dy=<y>`, the URL still resolves (served, not a
  bare id), and the item's status is unchanged

#### Scenario: The take re-ADD inherits the override

- **WHEN** an item with a stored override is taken after an out (the
  B-039 re-ADD path) **THEN** the fresh `CG ADD` carries the SAME position
  query

#### Scenario: Refused on air; unknown item refused

- **WHEN** `stack.set-position` targets an item that is on air or
  unsettled **THEN** it is refused with `reason: 'on-air'` and nothing is
  sent or stored
- **WHEN** it targets an item not on the stack **THEN** it is refused with
  `reason: 'unknown-item'`

#### Scenario: Overrides survive reconfiguration, die with the item

- **WHEN** `setConfig` rebuilds the connection layer **THEN** stored
  positions persist and the next ADD for the item still carries the query
- **WHEN** the item is removed **THEN** its stored override is dropped
