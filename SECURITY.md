# Security

## Deployment requirement: network segmentation

CasparCG's AMCP protocol is plaintext and unauthenticated. Anyone on the same
network as a CasparCG server can issue commands. **This is a CasparCG limitation,
not something this software can fix.**

Deployment policy:

- Place CasparCG servers on an isolated VLAN reachable only from authorized
  Runtime workstations.
- Do not expose AMCP ports (default 5250) or OSC ports (default 6250) to general
  office or public networks.
- Treat the Runtime workstation as an air-critical asset — restrict who can log
  in, disable removable media, configure Windows Update for after-hours only.

## Template trust

`.vcg` packages contain executable JavaScript that runs inside CasparCG. They
should be treated like signed software:

- Use the optional Ed25519 signing block (`manifest.signing`) in environments
  where templates flow between teams or organizations.
- Configure the Runtime to require signatures (`runtime.requireSignedTemplates: true`)
  for production playout chains.
- Templates ship with CSP `connect-src 'self'` — a template can reach the bridge that
  served it, and no other destination. It was `'none'` (by falling back to
  `default-src 'none'`) until 2026-09-15.
  🔴 **ACCEPTED BY THE OWNER ON 2026-09-16**, for the reasons set out in
  `openspec/changes/template-signals-completion/design.md` §1 and recorded in
  [ADR 0009](docs/adrs/0009-timing-setting-ownership.md). It lets a token-bearing
  template report its completion or the live page of a book so the console stays
  honest ([[C-013]]). Keep the policy limited to the template's own origin.
- **Run-state reports require a per-take token.** The bridge supplies that token
  inside the reserved `__cg` payload. A single-file template dropped into
  CasparCG by hand or Designer's own preview receive no token and send no reports.
- 🔴 **THE TEMPLATE-SERVING ORIGIN HOSTS TEMPLATES, BOOK PAGES, UPCOMING PROGRAMS MEDIA AND TWO TOKEN-BOUND REPORTS, NOTHING ELSE.** `'self'`
  is an ORIGIN, not a path, so a served template can reach **every route on the server that
  served it**. That origin hosts five routes — `GET /template/<id>`,
  `POST /complete`, `POST /page-state`, `GET /page/<sha256>[.<ext>]` and
  `GET /upcoming-media/<sha256>` — and **no control, identity or general data route may
  ever be added to it.** The control WebSocket is deliberately a separate server on a separate
  port (`DEFAULT_BRIDGE_PORT`), which is what keeps it outside `'self'`. The rule is enforced,
  not merely stated: the router consults `TEMPLATE_SERVER_ROUTES` and nothing else, and
  `tools/caspar-bridge/tests/template-server-route-set.test.ts` fails on any change to that
  list. Identity work belongs on the control socket's origin.
  - **The page route (added 2026-10-14, `R-100` / `IMAGE-PAGES-01`).** A book read on air turns
    hundreds of pictures, and the owner asked for them to be served the way templates are — one
    host rule, a backup core included, no new port. The other road, the picture's bytes inside
    the operator's `CG UPDATE`, was built first and MEASURED: CasparCG 2.5.0 keeps ~2.6 MB in
    its main process for every 1 MB update, for the life of the process (`CLEAR` gives none of it
    back). The route is READ-ONLY and GET-only, named by the picture's SHA-256, and serves only a
    PNG, JPEG or WebP that CG Bridge stored after its own checks, `no-store` and `nosniff`. A
    template that can reach it learns only the pictures it was told the names of. The template's
    CSP admits it as `img-src data: 'self'` — the own origin, never a host list. The bare-hash
    spelling was added on 2026-10-24 so an Auto turn can fetch a stored page whose extension URL
    was not carried by an operator command; it selects the same hash-only reader.
  - **The page-state route (added 2026-10-24, `book-in-cg-control` delta B).** A template may POST
    only `{ take, field, index }`; the bridge accepts it only when the unguessable token names the
    current live take, the field is that row's declared page list and the integer is in range. It
    updates that row's published counter, spends no token, exposes no lookup or enumeration, and
    performs no playout verb. Malformed, stale and off-air reports are indistinguishable `404`s.
  - **The Upcoming Programs media route (D-219).** A template can fetch an individual stored
    PNG, JPEG, WebP, WebM or MP4 by its full content hash. The store validates media type and a
    24 MiB upload limit through the separate control socket. The template origin admits only
    GET for this route, with no listing, access to other files or CORS permission. It rejects
    cross-origin browser requests and serves typed bytes with `nosniff`, `no-store` and
    `Cross-Origin-Resource-Policy: same-origin`. One byte range supports video seeking. The
    template endpoint should stay on the secured graphics network with the other template routes.
    A network client that can reach it and knows the full hash can request that object.

## Reporting a vulnerability

For security issues, do not open a public issue. Contact the maintainers via the
channel listed in the per-deployment contract or by encrypted email to the
release-signing key holder.

## Telemetry

The platform supports three telemetry modes: opt-in, opt-out, and air-gapped.
Air-gapped mode disables all outbound network calls regardless of other settings
— use it for stations on isolated networks.
