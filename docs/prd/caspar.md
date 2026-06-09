# CasparCG control / bridge — backlog

The Runtime currently runs against an in-memory mock. Real playout needs a
small local bridge because browsers can't open raw TCP/UDP. See
`docs/adrs/0007-electron-to-browser-migration.md`.

## [ ] C-001 — Local CasparCG bridge + real transport ⟨priority: high⟩

**What:** A tiny Node tool (`tools/caspar-bridge`) that exposes a WebSocket and
relays AMCP over TCP + OSC over UDP to CasparCG; plus a browser
`WebSocketTransport` so the Runtime drives real servers through the existing
`@cg/caspar-client` protocol logic.
**Why:** It's the one capability the browser can't do alone, and it unblocks
real on-air use. The protocol/reconciler/redundancy logic already exists in
`@cg/caspar-client` behind a transport interface — only the socket transport is
missing.
**Acceptance:**

- WHEN the bridge is running and a CasparCG server is reachable THEN take /
  update / out from the Runtime reach the server
- WHEN CasparCG emits OSC THEN the stack item states update from real
  confirmations (not the mock state machine)
- WHEN the bridge is absent THEN the Runtime degrades to an offline/mock mode
  with a clear indicator (does not crash)
- WHEN primary fails THEN failover switches to backup per the redundancy strategy
  **Notes:** Large — write a thorough `design.md` (transport interface, OSC return
  path over the same socket, where the reconciler runs, packaging the bridge).
  Swap `MockRuntime` for the real stack behind the unchanged `RuntimeBridge`.
  Use `tools/amcp-mock` for integration tests. Likely several OpenSpec changes
  (bridge transport, real ConnectionService, real stack/reconciler, failover).

<!-- Backlog stubs (registered for hygiene; Acceptance to be detailed when scheduled). -->

## [ ] C-002 — Preset + rundown / playout control ⟨priority: high⟩

**What:** An on-air control surface: build presets (a template + saved field
values) into a rundown and take/update/out them live, in order.
**Why:** The Runtime can play a template but there's no operator-facing rundown to
sequence and fire presets on air.
**Acceptance to be detailed when scheduled.**
**Notes:** depends on C-001 (real transport) for live playout; the per-run playout
override seam already exists in `@cg/template-runtime` (`scopeOverrides`). This is the
home for D-029/D-031 sequencing on air.

## [ ] C-003 — On-air per-child timing override ⟨priority: medium⟩

**What:** Expose the runtime's per-scope playout overrides (mode / holdMs / repeat,
keyed by nested-instance path) as a LIVE on-air control, not just a preview session.
**Why:** D-026 built per-scope overrides for the Designer preview; operators will want
to retime nested instances live during a show.
**Acceptance to be detailed when scheduled.**
**Notes:** the runtime seam exists (`RuntimeBootOptions.scopeOverrides`); this is the
control-app surface for it. Depends on C-002 + D-026.

## [ ] C-004 — Sports core: match-state model ⟨priority: medium⟩

**What:** A domain model for live match state (teams, score, clock, period, events)
that graphics bind to.
**Why:** Sports is a major use case; a shared state model is the foundation the
operator app and graphics both consume.
**Acceptance to be detailed when scheduled.**
**Notes:** likely a new schema/domain area (`@cg/shared-schema` or a dedicated
package) feeding bindings; foundation for C-005 + C-006.

## [ ] C-005 — Sports control: operator app ⟨priority: medium⟩

**What:** An operator UI to drive the match-state model live (increment score, start/
stop clock, fire event graphics) and push to air.
**Why:** Sports operators need a fast, purpose-built panel rather than editing raw
fields.
**Acceptance to be detailed when scheduled.**
**Notes:** depends on C-004 (state model) + C-002 (rundown/playout control).

## [ ] C-006 — Roster ingestion (manual / file / API) ⟨priority: low⟩

**What:** Import team/player rosters from manual entry, a file (CSV/JSON), or an
external API into the sports state model.
**Why:** Re-typing rosters per match is error-prone; ingestion makes setup fast.
**Acceptance to be detailed when scheduled.**
**Notes:** depends on C-004; API ingestion may need the bridge/host (browsers can't
reach arbitrary origins) — confirm CORS/host story when scheduled.

## [ ] C-007 — Confirm single-file CEF / file:// hardening ⟨priority: medium⟩

**What:** Verify the D-019 single-file HTML export runs correctly under CasparCG's CEF
from `file://` (no module/CORS/codec surprises) and harden any gaps found.
**Why:** The export targets old CEF (≈ Chromium 71) from `file://`; this needs
on-target confirmation before relying on it on air.
**Acceptance to be detailed when scheduled.**
**Notes:** the IIFE bundle + `window.CG` path already targets this (D-019,
`bundle-runtime.mjs`); this item is the validation + any fixes. Relates to the
frame-accuracy validation note in `roadmap.md`.
