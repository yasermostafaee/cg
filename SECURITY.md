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
  `default-src 'none'`) until 2026-09-15; the relaxation is the owner's decision recorded in
  [ADR 0009](docs/adrs/0009-timing-setting-ownership.md) and built in
  `openspec/changes/template-signals-completion/`, and it exists for exactly one message: a
  template telling the bridge that its own run has finished, so the row stops claiming ON AIR
  ([[C-013]]). **Do not widen it further without strong justification** — a host list or a
  scheme wildcard is what "phoning home" means, and `'self'` is not.
- **The narrow part is not the policy, it is the key.** A page opens no connection at all unless
  the bridge handed it a per-take token inside the reserved `__cg` payload. A single-file
  template dropped into CasparCG by hand, a template served by anything that is not this bridge,
  and the Designer's own preview all receive no token and therefore never open a socket.

## Reporting a vulnerability

For security issues, do not open a public issue. Contact the maintainers via the
channel listed in the per-deployment contract or by encrypted email to the
release-signing key holder.

## Telemetry

The platform supports three telemetry modes: opt-in, opt-out, and air-gapped.
Air-gapped mode disables all outbound network calls regardless of other settings
— use it for stations on isolated networks.
