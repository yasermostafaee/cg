## MODIFIED Requirements

### Requirement: An oversized single-file export is reported by the existing preflight

An oversized export SHALL be reported BEFORE any file is produced: when the projected
single-file INLINE payload (base64-inflated) exceeds the threshold, the EXISTING preflight /
issues path raises a WARNING that never blocks (owner decision (d) — the operator may have a
legitimate reason).
The message SHALL be actionable: the projected total, the dominating assets by name, and that it
applies to the `.vcg` too, because CG Control renders an imported `.vcg` into the same kind of
page (`BOOK-EXPORT-01` measured it; the message used to say the `.vcg` "has no such limit", which
was false). The threshold (40 MiB inline) is PROVISIONAL until the Phase-6 hardware pass — chosen
from a desktop-Chromium `file://` load sweep recorded in `design.md`, with margin for CasparCG
2.3's older CEF. Past `TEMPLATE_MEDIA_MAX_BYTES` the `.vcg` export is refused outright
(`designer-composition-export`).

#### Scenario: Crossing the size threshold warns, actionably, before export

- **WHEN** a template's projected single-file inline payload exceeds the threshold
- **THEN** the issues panel shows a WARNING naming the projected total, the dominating assets,
  and that this applies to both exports — before any file is produced, and without blocking
  either export
