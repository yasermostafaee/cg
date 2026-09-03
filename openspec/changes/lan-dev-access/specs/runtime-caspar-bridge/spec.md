# runtime-caspar-bridge — delta (the probe follows the page's origin, P-041)

## MODIFIED Requirements

### Requirement: Bridge selection at boot

`createRuntimeBridge()` SHALL be async and decide the backend **once** at startup. The
Runtime SHALL present the same UI either way and SHALL NOT crash when the bridge is absent.

The URL it probes SHALL be decided in ONE module (`src/platform/bridgeUrl.ts`), in this order:
the test-harness override (`__CG_BRIDGE_URL__`, a non-empty string) when armed; otherwise the
page's own host — `ws://<location.hostname>:<DEFAULT_BRIDGE_PORT>`, `wss:` when the page is
`https:` — because the bridge runs beside the server that served the page; otherwise, with no
page origin to follow, the bridge's loopback default. A hardcoded `ws://127.0.0.1:5280` is
forbidden in client code: from a second machine it is that machine's own loopback, and the
app then sits in DISCONNECTED with nothing wrong anywhere it can see.

An unreachable bridge SHALL NOT select the mock. When the probe (default 1500ms) is refused
or times out, the app SHALL remain on the **live** backend in an explicit, visible
**disconnected** state — reconnecting on its own, with every command rejected and never
routed to a simulation. A silent fallback is forbidden: it pins the whole session to an
in-memory simulation that reports success for commands that reach nothing, which is how an
operator comes to believe a graphic is on air when none is.

The in-memory mock SHALL be selected **only** on an explicit request (an operator-chosen
test mode, or a test harness arming the flag) — never as an automatic consequence of the
bridge being absent, and never mid-session.

#### Scenario: The probe follows the page's origin

- **WHEN** the Runtime page is served from a LAN host (an origin that cannot be loopback)
  **THEN** the bridge probe targets `ws://<that host>:5280` and never `ws://127.0.0.1:5280`
  or `ws://localhost:5280`

#### Scenario: Bridge reachable

- **WHEN** the bridge WebSocket connects within the timeout **THEN** the app uses the
  `WebSocketRuntime` and shows a "connected / live" indicator

#### Scenario: Bridge absent — disconnected, NOT the mock

- **WHEN** the probe is refused or times out **THEN** the app stays on the live backend in
  a visible DISCONNECTED state, keeps trying to reconnect, and refuses commands — it SHALL
  NOT construct the mock, SHALL NOT report any server as healthy, and SHALL NOT show any
  item as on air

#### Scenario: The mock is only ever entered on purpose

- **WHEN** the operator (or a test harness) explicitly requests test mode **THEN** — and
  only then — the app runs the in-memory mock, and says so unmistakably
