# CasparCG control / bridge — backlog

The Runtime currently runs against an in-memory mock. Real playout needs a
small local bridge because browsers can't open raw TCP/UDP. See
`docs/adrs/0007-electron-to-browser-migration.md`.

## [x] C-001 — Local CasparCG bridge + real transport ⟨priority: high⟩

**Done:** Phases 1–3 + the hardware AMCP-sequence validation are all complete —
transport (`tools/caspar-bridge` WS ↔ `WebSocketRuntime`), the real
`@cg/caspar-client` stack backing, real two-session redundancy/failover, and the
update verb hardware-validated as `CG UPDATE` on CasparCG 2.3.2 (`4de6d18f`,
ADR 0006). All four acceptance bullets met.

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
**Notes:** **Notes:** likely a new schema/domain area (`@cg/shared-schema` or a dedicated package) feeding bindings; foundation for C-005 + C-006. Scope it as a **declarative sport-definition** (state schema + allowed operations + default control-surface layout + default template bindings), NOT hardcoded per-sport logic — sports are data, not separate apps. See the "Multi-sport runtime architecture" note in `roadmap.md`.

## [ ] C-005 — Sports control: operator app ⟨priority: medium⟩

**What:** An operator UI to drive the match-state model live (increment score, start/
stop clock, fire event graphics) and push to air.
**Why:** Sports operators need a fast, purpose-built panel rather than editing raw
fields.
**Acceptance to be detailed when scheduled.**
**Notes:** **Notes:** depends on C-004 (state model) + C-002 (rundown/playout control). Render the operator control surface **from C-004's declared operations** (auto-generated buttons), so adding a sport = adding a sport-definition, not a new app. See the "Multi-sport runtime architecture" note in `roadmap.md`.

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

## [ ] C-008 — Graceful / soft stop for content-driven holds ⟨priority: low⟩

**What:** A rundown-layer "soft out" command: instead of the runtime's built-in
HARD stop (immediate outro — the ticker exits mid-scroll with the band), finish
the ticker's current pass (or fully drain the band), then play the outro by
letting natural content completion close the hold.
**Why:** Editorially, cutting a crawl mid-headline can look abrupt; a show may
prefer "finish the line, then out". The runtime deliberately ships only the
hard stop (pinned in the D-028 `designer-playout-lifecycle` spec) — graceful
exit is an operator policy, so it belongs at the control surface.
**Acceptance to be detailed when scheduled.**
**Notes:** implementable on the EXISTING override seam, no new runtime
behaviour: force the scope's ticker repeat to end at the current pass (the
D-028 `tickerRepeat` per-scope override / a driver-level "finish current pass"
variant) and let `whenComplete()` → the content-driven hold → the outro run
naturally. Depends on C-002 (rundown) + D-028; relates to C-003 (live
per-scope overrides).

## [ ] C-009 — OSC pipeline observability + operator setup doc (predefined-client → 6250) ⟨priority: medium⟩

**What:** Make OSC delivery observable and documented: log the OSC bind +
first-datagram arrival per server at bridge startup, surface session errors
(today swallowed — a bind failure silently aborts the session loop), expose the
pipeline's diagnostics counters — incl. a NEW counter on the change-tracker
(the exact suppressing stage, currently the only unobservable one) — and write
the operator doc pointing `casparcg.config`'s `<predefined-client>` at the
bridge's OSC port (6250).
**Why:** OSC delivery is entirely faith-based today: the bridge binds
`127.0.0.1:6250` silently and no bridge doc tells the operator to configure
CasparCG's OSC push (the only guidance lives in the retired spike docs). The
B-044 live probe (2026-07-07, CasparCG 2.5.0 `69e8ad5`) measured the reality:
~50 datagrams/s from this 2.5.0 box to 127.0.0.1:6250, zero parse failures
(2.5's address format decodes on the 2.3-shaped pipeline), 0 datagrams to the
phantom B port, ~10 event batches surviving the change-tracker over ~15 min
(all producer/file transitions; Take → producer empty→html; Update → ZERO
events). Without instrumentation, "OSC never arrives" and "reconciler bug" are
indistinguishable at the operator's desk.
**Acceptance:**

- WHEN the bridge starts THEN it logs the OSC bind (host:port) per server and,
  on the first datagram from each, an arrival line
- WHEN an OSC session error occurs (e.g. bind failure) THEN it is surfaced to
  the bridge log, not swallowed
- WHEN diagnosing THEN pipeline counters (datagrams received, parse failures,
  interest drops, change-tracker suppressions) are exposed
- WHEN an operator sets up CasparCG THEN a bridge doc states the
  `<predefined-client>` → 6250 configuration, incl. the loopback constraint
  **Notes:** the OSC bind host is hardcoded `127.0.0.1`
  (`tools/caspar-bridge/src/caspar-runtime.ts`) — a remote CasparCG's OSC can
  never arrive today; fold that decision into the doc or make it configurable.

## [ ] C-010 — dead production wiring: `beginResync`/`endResync` and `HeartbeatService` are never used ⟨priority: low⟩

**What:** Decide and wire (or remove): the Reconciler's resync window
(`beginResync`/`endResync` — no production caller, so a primary reconnect never
suspends/replays intents) and `HeartbeatService` (exported from
`@cg/caspar-client` but never instantiated in the bridge — no periodic VERSION
ping; the `amcp-ping-fail` health axis derives only from session/TCP state).
**Why:** Found in the B-044 investigation (2026-07-08): both exist, are
unit-tested, and are documented as part of the design — but nothing calls them,
so the behaviors they promise (post-reconnect state reconciliation, liveness
pings) silently don't exist in production.
**Acceptance to be detailed when scheduled.**
**Notes:** relates to B-046 (phantom backup) and B-048's cross-referenced
reconnect/startup reconciliation — one reconnect design should cover them
together.

## [ ] C-011 — persist the Loaded stack + template registry: durable, LAYER-AWARE reconciliation across bridge restart AND page reload ⟨priority: medium⟩

**What:** Persist the runtime's playout state — the template registry (delivered
`{ template, html }` or the raw `.vcg` bytes) AND the Loaded stack with its
layer occupancy (which template/item sits on which `(channel, layer)`) — behind
`@cg/storage` (a database later), surviving BOTH a bridge restart and a page
reload. On startup/reconnect the bridge reconciles by KNOWN occupancy: adoption
targets layers it can NAME the previous occupant of, instead of blindly clearing
whatever layer a fresh Load happens to be assigned.

**Why:** `reconnect-reconciliation` (B-038 follow-up + B-048) deliberately shipped
the in-memory precursor with two accepted gaps, both operator-confirmed live
(2026-07-10):

1. **Both-restart re-import gap** — browser retention is page-lifetime and the
   bridge registry is process-lifetime, so a bridge restart PLUS a page reload
   still needs a manual re-import (the change's documented scope matrix).
2. **Wrong-layer adopt risk** — the adopt-CLEAR is per `(channel, layer)` with
   NO cross-restart memory of what was where. After a restart, the fresh
   session's LayerManager assigns layers purely by allocation order; if that
   order diverges from the dead session's, the adopt-CLEAR wipes a DIFFERENT
   orphaned graphic than the one being replaced. Live testing didn't hit it only
   because the layout happened to repeat — luck of a stable layout, not a
   guarantee (recorded as a KNOWN LIMITATION in that change's `design.md`). The
   CLEAR never exceeds what the real `CG ADD` would do on that layer; the hazard
   is specifically choosing the WRONG layer when layouts diverge.

**Acceptance to be detailed when scheduled** (symptom/design-level entry — do not
start without a scheduling decision). Sketch: registry + stack/occupancy
persisted and restored; post-restart reconciliation adopts by known occupancy
(offering the operator resume-or-clear rather than silent luck); the manual
re-import is gone in ALL restart combinations; the persisted layout makes the
adopt-CLEAR target provably the layer being replaced.

**Notes / cross-references:** builds on `reconnect-reconciliation`'s in-memory
retention (its `design.md` names `@cg/storage` as this exact upgrade path);
context: [[B-048]] (orphaned producers), [[B-053]] (first-observation badge wart —
a layer-aware truth model would also ground its fix); C-010's dead
`LayerManager.observe`/`beginResync` wiring is the machinery a real
reconciliation would finally use — one reconnect/startup design should cover
C-010 + C-011 together. Placement note: filed as a single C- item (the bridge is
the center of gravity); the renderer/Library face (persisted `.vcg` bytes for
re-import-free page reloads) is part of THIS item, not a separate R- entry.

## [x] C-012 — CG STOP as a distinct operator action: a graceful exit that runs the template's outro and leaves the producer resident ⟨priority: medium⟩

**Done:** merged as #359 and archived
(`openspec/changes/archive/2026-07-19-runtime-stop-verb/`, folded into the
`runtime-caspar-bridge` spec). STOP ships link-gated beside PLAY/UPDATE/CLEAR,
fire-and-forget, with the stopped item resting at `loaded` via play-evidence
retraction and resume via bare `CG PLAY` on the resident producer.

**What:** A fifth AMCP verb, `CG <ch>-<layer> STOP`, offered beside PLAY / UPDATE / CLEAR. It tells
the template to run its OWN outro and leaves the producer resident on the layer, so a later PLAY
resumes it with no re-load. CLEAR remains the hard path that destroys the producer.

**Why now:** this was blocked on hardware evidence, and [[C-011]]'s probe (PR #353) produced it
against CasparCG 2.3.2 `4de6d18f`:

- `CG 1-45 STOP 0` → `202 CG OK`; OSC still reports `html`; the template's `window.stop` FIRED
- `CG 1-45 PLAY 0` → `202 CG OK`, `window.play` fired, playback RESUMED — with **no re-ADD**
- `CLEAR 1-45` → OSC goes **SILENT**; the producer is destroyed

So STOP and CLEAR reach genuinely different end states, and both are legible to the occupancy tap
(stopped reads OCCUPIED, cleared reads silent). `window.stop` is wired to `runtime.stop()` — the
graceful outro path, distinct from `remove()`'s synchronous kill — so STOP plays the template's
exit animation rather than yanking the graphic.

**ADR-0006 is deliberately extended, not violated.** That ADR froze the command surface to
ADD/PLAY/UPDATE/CLEAR _because the alternatives were unverified on hardware_ — the freeze was an
evidence rule, not a taste. The evidence now exists, so the change records the extension and the
measurements that justify it.

**Design decisions (see the change for the full reasoning):**

- **No new status.** A stopped item rests at `loaded` — which already means exactly "a producer is
  resident on the layer and it is not playing", and is what the hardware shows. Twelve files switch
  on `StackItemStatus`; a new member would be a new hole in each. The load-bearing part is
  retracting the play evidence: OSC reports `html` FOREVER after a STOP, so leaving `played` set
  would make a stopped graphic claim ON AIR indefinitely off real OSC.
- **Nothing waits on the outro.** The ack means CasparCG accepted the command, not that the
  animation finished. Outro completion is not observable from the bridge — [[B-030]] is precisely a
  case where a template's own completion never resolves while OSC keeps reporting `html` — so no
  timer chases it and no mechanism assumes it.
- **`#loaded` is NOT cleared** (unlike `out()`), which is what makes the resume work: `take()` sees
  the resident producer and issues a bare `CG PLAY` instead of the B-039 re-ADD.
- **One button and one menu item, from one declaration.** [[R-013]]'s `ui/rowAction.ts` means the
  row declares its actions once and renders them twice, so the context menu mirrors STOP for free.

**FROZEN:** on-air refusal (R-006 — STOP is link-gated like every on-air verb, and its refusal goes
to the toast), [[B-085]]'s library, [[B-086]]/[[B-087]]'s `unverified` badge, [[B-092]]'s restore,
[[B-093]]'s blind-tap guard, [[B-094]]'s NO OSC indicator, and the adopt-CLEAR safety are all
untouched. CLEAR's behaviour is unchanged — STOP is purely additive.

**Related:** [[C-008]] (graceful/soft stop for content-driven holds) is a DIFFERENT thing — a
content-timing policy that finishes the current pass before letting natural completion close the
hold, on the existing override seam. Once this verb exists, C-008 has a command to end with.

## [ ] C-013 — an item whose content has FINISHED should stop itself instead of staying ON AIR: the template signals completion to the bridge ⟨priority: medium⟩

**What:** When a playing item's content finishes, the item ends itself gracefully — via the
now-shipped STOP path ([[C-012]]): outro runs, the producer stays resident — instead of claiming
ON AIR indefinitely. The completion signal comes FROM THE TEMPLATE, because the template is the
only party that actually knows.
**Why:** The operator's complaint, recorded precisely: after a while the list shows several items
as ON AIR while only one thing is actually on output, so the operator cannot tell which row
corresponds to what the viewer sees. ON AIR loses its information value when finished items keep
claiming it.
**Acceptance:**

- WHEN a playing item's content finishes THEN the item comes off air via the graceful STOP path —
  outro runs, the producer stays resident — rather than remaining ON AIR
- WHEN an item has ended by content completion THEN its row no longer claims ON AIR, and a later
  PLAY resumes it without a re-load (the [[C-012]] residency contract)
- WHEN no completion signal arrives (older template, no channel) THEN behaviour degrades to
  today's — nothing guesses at completion with a timer

**Notes:** WHY IT HAPPENS (not a reporting bug): a finished graphic has hidden itself but its
HTML producer remains RESIDENT on the layer, so OSC honestly reports `html`. Residency is
deliberate — it is what lets a lower-third be UPDATEd for the next guest without a reload.
Nothing tells the bridge the CONTENT finished. — RELATIONSHIP TO [[B-030]]
(`bugs-designer.md`): likely the same root family — content done, item still on air. JUDGED: new
number rather than a note on B-030, because B-030 is a Designer template-runtime STRAND bug
(nested timed-auto-out halts a content-driven parent's wait) whose fix lives in the lifecycle
coordinator, while THIS is a Runtime/bridge capability — a completion-signal transport out of
CEF — and the session split keeps Runtime-side filing out of `bugs-designer.md`. — WHAT CHANGED
since B-030 was filed: CG STOP is hardware-validated on 2.3.2 (probe #353; shipped as
[[C-012]], #359) — the producer survives, the template's `stop()` runs the outro, a bare
`CG PLAY` resumes with no re-ADD. For the first time there is a CORRECT VERB with which to end an
item; the open problem is only knowing WHEN. — OWNER'S DIRECTION on the signal: the TEMPLATE
signals completion back to the bridge. The alternative — deriving completion from authored timing
metadata — is REJECTED: it is a guess that breaks on dynamic content, variable CEF render speed,
or frame-dependent animation — the same "invented number pretending to be knowledge" that C-012
deliberately avoided by going fire-and-forget. — KNOWN GAP (the real work): `runtime.stop()`
already exists as the graceful path and the D-029 sequence drivers know when a sequence ends, but
there is NO CHANNEL today for that knowledge to reach the bridge from inside CEF. That transport
is the substance of this item. — Distinct from [[C-008]]: C-008 is an OPERATOR-initiated soft-out
policy on the override seam; this is the item ending ITSELF when its content completes.
