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
  [ADR 0009](docs/adrs/0009-timing-setting-ownership.md). It exists for exactly one message: a
  template telling the bridge that its own run has finished, so the row stops claiming ON AIR
  ([[C-013]]). **Do not widen it further without strong justification** — a host list or a
  scheme wildcard is what "phoning home" means, and `'self'` is not.
- **The narrow part is not the policy, it is the key.** A page opens no connection at all unless
  the bridge handed it a per-take token inside the reserved `__cg` payload. A single-file
  template dropped into CasparCG by hand, a template served by anything that is not this bridge,
  and the Designer's own preview all receive no token and therefore never open a socket.
- 🔴 **THE TEMPLATE-SERVING ORIGIN HOSTS TEMPLATES AND THEIR BOOK PAGES, NOTHING ELSE.** `'self'`
  is an ORIGIN, not a path, so a served template can reach **every route on the server that
  served it**. That origin therefore hosts exactly three routes — `GET /template/<id>`,
  `POST /complete` and `GET /page/<sha256>.<ext>` — and **no control, identity or data route may
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
    CSP admits it as `img-src data: 'self'` — the own origin, never a host list.

## Reporting a vulnerability

For security issues, do not open a public issue. Contact the maintainers via the
channel listed in the per-deployment contract or by encrypted email to the
release-signing key holder.

## Telemetry

The platform supports three telemetry modes: opt-in, opt-out, and air-gapped.
Air-gapped mode disables all outbound network calls regardless of other settings
— use it for stations on isolated networks.
