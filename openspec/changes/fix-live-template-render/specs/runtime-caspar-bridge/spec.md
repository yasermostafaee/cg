# runtime-caspar-bridge (B-038 — live template render: content delivery + serve + real fields)

## ADDED Requirements

### Requirement: Imported templates are delivered as self-contained HTML and served over HTTP

A registered template SHALL reach CasparCG as a **self-contained HTML page**
(runtime, scene, fonts, and images all inlined — no external fetch). At import the
browser SHALL produce that page (the D-019 single-file export) and deliver it to
the bridge over the extended `templates.import` channel; the bridge SHALL store it
by `templateId` and **serve it over HTTP** at a stable URL
(`/template/<templateId>`). `CG ADD` SHALL reference that **URL**, not the bare
template id. The browser SHALL retain the produced HTML per template and
re-deliver it on (re)connect so loads survive a bridge restart.

#### Scenario: A loaded template references a served, resolvable URL

- **WHEN** the operator loads a registered template with the Runtime LIVE **THEN**
  the bridge issues `CG ADD "http://<serve-host>:<port>/template/<id>"` (a page the
  server returns `200 text/html` for), not a bare id — so CasparCG can fetch and
  render it

#### Scenario: The served page is self-contained

- **WHEN** CasparCG loads the served template URL **THEN** it fetches nothing
  else — fonts and images are inlined as base64 data URIs by the single-file
  export — so Persian fonts and logos render with no network dependency

#### Scenario: HTML survives a bridge restart

- **WHEN** the bridge restarts and the browser reconnects **THEN** the browser
  re-delivers each registered template's HTML, so subsequent loads still resolve

### Requirement: Live playout commands carry real field values

`CG ADD` and `CG UPDATE` SHALL carry the stack item's **real field values** — the
template's field-schema defaults at minimum, and operator-entered values from the
Inspector when present — never an empty `{}`. The command-construction seam is
unchanged; the caller supplies the real values (and the served URL).

#### Scenario: Load and update send real data

- **WHEN** a template with field defaults is loaded and then updated **THEN** the
  `CG ADD` data argument is the seeded field values (not `{}`), and `CG UPDATE`
  carries the operator's edited values via the hardware-verified `CG UPDATE` verb

### Requirement: The bridge's template HTTP server is reachable by CasparCG

The bridge SHALL serve template HTML on a host CasparCG can reach, while the
control WebSocket SHALL remain bound to `127.0.0.1`. WHEN CasparCG is local
(connection host is loopback) the HTTP server SHALL serve on `127.0.0.1` and the
`CG ADD` URL SHALL use `127.0.0.1` (no LAN exposure). WHEN CasparCG is remote the
HTTP server SHALL bind a routable interface **only by explicit opt-in**, and the
`CG ADD` URL host SHALL be the bridge's address as CasparCG sees it (configured, or
a guessed LAN IPv4), logged loudly. The HTTP server SHALL expose template HTML
only — no control surface.

#### Scenario: Local CasparCG stays loopback

- **WHEN** CasparCG runs on the same machine **THEN** the template server serves on
  `127.0.0.1` and `CG ADD` uses a `127.0.0.1` URL, with no non-loopback exposure

#### Scenario: Remote CasparCG uses a routable, opt-in serve host

- **WHEN** CasparCG runs on another host **THEN** the template server binds a
  routable interface by explicit configuration and `CG ADD` uses the bridge's
  CasparCG-reachable address (configured or guessed), while the control WebSocket
  stays loopback

### Requirement: Template resolution is validated, not blind-acked

Integration tests SHALL exercise a **real template reference and non-empty field
values**, not just command acceptance. `tools/amcp-mock` SHALL stop blind-acking
`CG ADD`: it SHALL resolve the template argument (for a URL, an HTTP `GET` —
`404 CG ADD FAILED` when it does not return a page) and SHALL expose the `CG ADD` /
`CG UPDATE` data payload so tests can assert it is the real field JSON.

#### Scenario: Mock 404s an unresolvable template reference

- **WHEN** `CG ADD` references a bare id or a URL the mock cannot `GET` **THEN** the
  mock returns `404 CG ADD FAILED` (matching real CasparCG), so a "looks acked,
  renders nothing" regression fails the test

#### Scenario: Integration test asserts a served URL + real fields

- **WHEN** the bridge (with its HTTP server) drives the hardened mock **THEN** the
  test asserts `CG ADD` used a served URL the mock fetched (`202`) and a non-empty
  field payload, and `CG UPDATE` carried the updated fields
