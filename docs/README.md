# Documentation

## Architecture phases

The complete architecture series produced during Phases 1–8 of the project.

- [Phase 1 — Requirements](phases/phase-1-requirements.md)
- [Phase 2 — System Architecture](phases/phase-2-system-architecture.md)
- [Phase 3 — Domain Modeling](phases/phase-3-domain-modeling.md)
- [Phase 4 — Export Architecture](phases/phase-4-export-architecture.md)
- [Phase 5 — CasparCG Runtime](phases/phase-5-caspar-runtime.md)
- [Phase 6 — UI/UX](phases/phase-6-ui-ux.md)
- [Phase 7 — Folder Structure](phases/phase-7-folder-structure.md)
- [Phase 8 — Development Roadmap](phases/phase-8-roadmap.md)

## Architecture Decision Records

Living decisions, numbered and never renumbered. Status moves
Proposed → Accepted → Superseded.

- [ADR 0001 — Monorepo with pnpm + Turborepo](adrs/0001-monorepo-with-pnpm-turborepo.md)
- [ADR 0002 — Two separate Electron apps](adrs/0002-two-electron-apps.md)
- [ADR 0003 — Persian rendering in CasparCG CEF](adrs/0003-persian-rendering-in-cef.md)
- [ADR 0004 — OSC schema revisions for CasparCG 2.3.x](adrs/0004-osc-schema-revisions.md)
- [ADR 0005 — Frame-rate sync in CasparCG CEF](adrs/0005-frame-rate-sync.md)
- [ADR 0006 — AMCP update mechanism for the HTML producer](adrs/0006-amcp-update-mechanism-unresolved.md)
  — open question RESOLVED (`CG UPDATE`)
- [ADR 0007 — Migrate from Electron to a browser-based React platform](adrs/0007-electron-to-browser-migration.md)
- [ADR 0008 — Thick CasparCG bridge (smart proxy), not a thin byte-relay](adrs/0008-thick-caspar-bridge.md)
- [ADR 0009 — Who owns which timing setting](adrs/0009-timing-setting-ownership.md)
- [ADR 0010 — CG Control's link to the Playout](adrs/0010-playout-link.md) — identity and channel
  permissions from the Playout; the path to air stays direct to CasparCG

⚠ Three decisions were once listed here as _planned_ at numbers **0003–0005** — iframe preview vs
Konva, OSC as the source of truth for on-air state, and frame-locked animations. Those numbers are
taken by the Accepted ADRs above ("numbered and never renumbered"), so the three are unwritten and
unnumbered, not missing files.

## Integration records

- [CG Control ↔ Apasai Playout](integration/playout/README.md) — the contract both teams
  signed, their responses and ours, and the dated evidence snapshots ([ADR 0010](adrs/0010-playout-link.md)).

## End-user guides

- [Operator guide](operator-guide/) _(M10)_
- [Designer guide](designer-guide/) _(M10)_
