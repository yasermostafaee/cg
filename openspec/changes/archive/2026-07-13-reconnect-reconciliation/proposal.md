# Reconnect reconciliation: template re-delivery + orphaned-layer adoption (B-038 follow-up + B-048)

## Why

Bridge-restart amnesia has two faces, both live-observed and now code-diagnosed
(full evidence in `design.md`):

- **Face 1 — templates forgotten.** The bridge's `TemplateRegistry` is
  in-memory only and the browser retains nothing after import; on reconnect
  `WebSocketRuntime#resync()` re-pulls only stack/health/lock. A live Load
  after a bridge bounce therefore `CG ADD`s a freshly-minted `/template/<id>`
  URL the bridge cannot serve. Real CasparCG **acks `202` without validating
  the URL** (server source, both v2.3.x-lts and master) and CEF loads the 404
  page asynchronously — a **silent blank on air** with READY/ON AIR badges.
  Only a manual re-import recovers. (The B-038 close explicitly descoped this;
  the living spec records it as an open follow-up.)
- **Face 2 — on-air producers orphaned.** A killed bridge leaves its producers
  playing. The fresh session deterministically re-allocates the same layers
  (lowest-free) and never clears or even learns about the orphan: the
  reconciler's designed defenses (`unexpected-onair`, `LayerManager.observe`,
  `beginResync`) have no production caller (C-010, frozen). Reproduced
  bridge→mock: the orphan's OSC routes to the _fresh_ item the moment interest
  is added, and fresh truth outranks acks — the item shows a false **ON AIR**
  right after Load, **even when the load failed** (`status:'on-air'` with
  `errorCode:'amcp-404'`).
- **B-048's documented symptom itself** (first Take renders nothing;
  Update-then-Take recovers) is **eliminated as a bridge/CasparCG defect** by
  the diagnosis: `CG ADD` always _replaces_ an occupied layer's html producer
  (`reusable_producer_instance=false` in both server branches — the
  stale-producer-hijack hypothesis is disproven), `play()` is queued (not
  dropped) until page load, and the reconciler math shows the reported
  READY-after-Update badge is only reachable if **no take intent ever reached
  the bridge** — a UI/link-layer miss on a pre-R-007 UI. Part C starts with a
  clean-main reproduction attempt + log capture to discriminate; a still-open
  B-048 does not block this change's own value.

## What Changes

- **Face 1 — browser retention + reconnect re-delivery** (`apps/runtime`
  platform tier): `WebSocketRuntime` retains the exact `{ template, html }` of
  every successful `templates.import` keyed by id (re-import replaces; cleared
  on dispose) and, on every reconnect, re-delivers each retained payload
  exactly once **before** the stack/health/lock snapshot re-pull. Single-socket
  FIFO + the bridge's synchronous registration guarantee a subsequent load sees
  a populated registry. A re-delivery failure surfaces as a visible command
  error and does not abort the resync. Scope: reconnect-without-reload;
  persisting `.vcg` bytes via `@cg/storage` (page-reload + both-restart) is the
  documented follow-up.
- **Face 1 — bridge-side load guard** (`tools/caspar-bridge`):
  `CasparRuntime.load()` rejects with `errorCode:'unknown-template'` (nothing
  sent) when the registry lacks the id — turning real CasparCG's silent
  `202`-blank into a visible failed load.
- **Face 2 — lazy layer adoption** (`tools/caspar-bridge`): the first `CG ADD`
  a bridge process issues onto a layer is preceded by `CLEAR <ch>-<layer>`,
  executed **before** the item's slot assignment and OSC interest, so an
  orphan's state can never route to the fresh item. Any bridge-issued CLEAR
  marks the layer adopted. **Explicitly no blind startup CLEAR** — a cold
  bridge cannot distinguish junk from a graphic deliberately riding through a
  controller bounce; on-air safety wins. The adopt-CLEAR destroys the orphan at
  the same moment a real `CG ADD` would anyway (server-source-proven), so it
  adds zero new on-air loss — only explicitness, producer/version independence,
  and mock-testability.
- **Mock fidelity** (`tools/amcp-mock`, the B-041 lesson): `CG ADD` with a URL
  arg acks `202` immediately and resolves **asynchronously**, recording a
  per-slot fetch verdict (real CasparCG performs no fetch before the ack;
  master's `OnLoadError` → empty frames); a bare id still `404`s (the real
  template-path miss). `CG UPDATE` on an empty layer fails `403` (real
  `get_expected_cg_proxy`). The unregistered-load test passes via the **bridge
  guard**, not mock strictness. Producer survival across control-connection
  drops (already real-accurate) gains an orphan-scenario harness.
- **Tests**: retention unit suite (retain / replace / replay-once-before-snapshot
  / dispose / failure isolation); bridge→mock orphan integration suite
  (adopt-CLEAR precedes the first ADD; no false ON AIR pre-take; post-restart
  load fails loud without re-delivery and succeeds with it); assertion updates
  in the existing B-038/B-039 suites for the guard + verdict + adopt-CLEAR;
  keep B-044 badge-settle, B-040 list, and R-003 staging suites green.

Out of scope (frozen / follow-ups, per approval): the AMCP escape rule (B-041),
R-003 semantics, the B-044 completion lifecycle, B-046 (phantom-B journal),
B-047 (failover listener rebind), C-010 (dead resync wiring), orphan-occupancy
surfacing (wire `unexpected-onair` → operator warning + Clear control), and
`#loaded` staleness across a _CasparCG_ restart (new candidate PRD entry).

## Capabilities

- `runtime-caspar-bridge` (MODIFIED): reconnect resync gains template
  re-delivery; the bridge-retention requirement's descoped-follow-up caveat is
  resolved; template-resolution modeling moves to real ack semantics
  (async verdict + bridge guard); playout verbs gain layer adoption + the
  unregistered-load rejection.
- `runtime-caspar-bridge` (ADDED): the browser retains delivered templates and
  re-delivers them on reconnect.

## Impact

- `apps/runtime` — `WebSocketRuntime` retention + resync re-delivery; tests.
- `tools/caspar-bridge` — `CasparRuntime` load guard + `#adopted` layer set +
  adopt-CLEAR ordering in `load()`; tests.
- `tools/amcp-mock` — `CG ADD` async-verdict resolution, `CG UPDATE` 403,
  verdict surface on `MockHandle`; tests.
- `docs/prd/bugs-runtime.md` — B-038 follow-up resolution + B-048 outcome are
  recorded **after** Part C live validation, per its discriminator.
- **Spec-delta coexistence**: `fix-amcp-escaping-v2` (B-041) and
  `fix-pending-update-completion` (B-044) hold open deltas on this spec while
  awaiting their 2.3.2 gates. This change's "Template resolution is validated,
  not blind-acked" delta is **based on the B-041 change's pending text** (its
  decode-rule sentences and scenarios are preserved verbatim); their files are
  untouched. **Archive ordering note:** archive `reconnect-reconciliation`
  AFTER `fix-amcp-escaping-v2`, or re-reconcile that requirement's text at
  archive time — whichever archives second must not clobber the other's edits.

## Archive ordering — ARCHIVE THIS CHANGE **SECOND** (held-pair pin)

**`fix-amcp-escaping-v2` MUST be archived BEFORE this change.**

Restating the "Spec-delta coexistence" bullet above as its own section, because the
pin is easy to miss inside an Impact list and the original pin commit was lost — it has
since only ever been surfaced verbally. Both changes hold an open delta on the SAME
requirement in `runtime-caspar-bridge` (`### Requirement: Template resolution is
validated, not blind-acked`), and THIS change's version is **based on
`fix-amcp-escaping-v2`'s still-pending text**. Archiving folds a delta into
`openspec/specs/`, so whichever archives second overwrites the other's edits:

- ✅ `fix-amcp-escaping-v2` → then `reconnect-reconciliation`: this change's later,
  richer text lands last. Correct.
- ❌ this change → then `fix-amcp-escaping-v2`: B-041's OLDER text clobbers this
  change's reconciliation delta, silently reverting it.

Both changes are held on hardware gates, so nothing else forces the order — it has to be
remembered. If it is ever broken, do not hand-patch `openspec/specs/`; re-reconcile that
requirement's text from both deltas at archive time. Counterpart note:
`fix-amcp-escaping-v2/proposal.md` ("Archive ordering") + its `tasks.md`.
