# runtime-caspar-bridge (B-038 Phase 3 — serve template HTML + render on CasparCG)

## ADDED Requirements

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

## MODIFIED Requirements

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
