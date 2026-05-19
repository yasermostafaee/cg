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
- Templates ship with CSP `connect-src 'none'`, blocking outbound network calls;
  do not relax this without strong justification.

## Reporting a vulnerability

For security issues, do not open a public issue. Contact the maintainers via the
channel listed in the per-deployment contract or by encrypted email to the
release-signing key holder.

## Telemetry

The platform supports three telemetry modes: opt-in, opt-out, and air-gapped.
Air-gapped mode disables all outbound network calls regardless of other settings
— use it for stations on isolated networks.
