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

🔴 **RECORDED 2026-08-10 (owner) — a rundown INSIDE this Runtime was considered and REJECTED. Do
not re-propose it.** The **CIAB client** (the plant's modified CasparCG Client) owns the programme
bed and keeps that role, and **two applications each believing they own the channel is worse for the
operator than two with clear roles** — the operator would have to hold in their head which surface
last touched the output. The division stands: CIAB drives the bed and its rundown; this Runtime
drives the graphics. [[C-022]] is the seam between them — the bridge serves the live source list
that CIAB reads INTO its rundown, which is the role the shared database played in the previous
automation.

**And a second output channel this Runtime alone would drive** — a studio monitor, a video wall, a
stream — **does not exist today, so it justifies nothing now.** Recorded so it is not used as
motivation for a feature; if such a channel ever appears, this note is where to start.

⚠ **Starting here, as invited — and it is NOT the channel this note rejects.**
`openspec/changes/live-source-multibox/design.md` **§9b** (2026-08-10) evaluates a second channel
carrying the multi-box composition with **no consumer of its own**, whose picture returns to the
playlist channel over a `route://`, so the plant's air path is untouched ([[C-020]]). It is
**recommended in principle and NOT adopted** — gated on §12.5's four measurements and one owner
question (is a second channel acceptable in the production config at all, and who changes it).

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

## [x] C-014 — occupancy-aware layer allocation: an ordinary Add must not adopt-CLEAR a foreign producer sitting inside a template-type range ⟨priority: high⟩ — merged (#368) + archived: `openspec/changes/archive/2026-07-19-occupancy-aware-allocation/` — on-air validation owner-verified on real CasparCG hardware, 2026-07-22

Code shipped AND owner-validated on hardware — see the **OWNER ON-AIR VALIDATION — DISCHARGED 2026-07-22** block directly below, and task 7.1 (now checked) in `openspec/changes/archive/2026-07-19-occupancy-aware-allocation/tasks.md`.

**OWNER ON-AIR VALIDATION — DISCHARGED 2026-07-22. This `[x]` now covers the hardware pass, not
only the merge and the local gate.** Both decisive checks below were performed on real CasparCG
hardware and **PASSED**, as part of the ONE consolidated session that also discharged [[B-100]],
[[B-101]] and [[B-082]]'s check #1 — recorded here and as the now-checked task 7.1 in the archived
`tasks.md`.

The history this block was filed for, kept for the record: when this item was first flipped `[x]`
it covered the merge and the local gate only. Unlike [[B-040]] (operator-validated on CasparCG
2.5.0 `69e8ad5`, 2026-07-07, recorded before its flip) and [[C-012]], no on-air check was recorded
anywhere in this change's dir or its PR. It changes WHICH LAYER a live graphic lands on, so it
earned one. The two decisive checks, then carried as unchecked task 7.1 in the archived
`tasks.md`, both now verified:

1. **The pool must not leak.** CLEAR a foreign layer, wait for the tap to age the observation
   out, then re-Add — the layer must return to the allocatable pool. This is the only exercise
   of the newly-wired `LayerManager.deallocate()` release path, and a leak stays invisible until
   Adds start refusing with `no-layer-foreign-occupied` for no visible reason.
2. **The restore narrowing.** With an item on a layer: kill the bridge, PLAY a foreign producer
   onto that same layer, restart the bridge. The item must land ELSEWHERE and the foreign
   producer must survive. This is the [[B-092]] interaction flagged in #368 — restore reaches
   `reserve()` first, and a quarantined retained slot now falls through to the pre-existing
   allocate-elsewhere path.

**What:** `load()`'s first `CG ADD` onto a layer this process has never cleared is preceded by an
adopt-CLEAR (`#adoptLayer`, `tools/caspar-bridge/src/caspar-runtime.ts`) — and the layer it lands
on comes from `LayerManager.allocate`, which consults ONLY its own bookkeeping (lowest free layer
in the template-type range), never the occupancy tap. So a foreign producer sitting inside a
policy range (layers 10–99 on the default policy — e.g. a video another system parked on
layer 15) is silently DESTROYED by an ordinary "Add item". Allocation must become
occupancy-aware: skip (or refuse, or quarantine) a layer whose fresh observation reports a
producer — at minimum any non-`html` producer, which [[R-015]] made unclearable by every
OPERATOR path while this programmatic path still kills it.
**Why:** This is the one remaining route by which this system can take another system's output
off air, and it fires without a warning — [[B-056]] warns only when the adopt-CLEAR _fails_ over
observed foreign content; when it succeeds the foreign producer is simply gone. It violates
R-015's owner rule ("a graphics operator must never be able to clear a video layer") from inside
the most ordinary operator action there is.
**Acceptance:**

- WHEN the operator adds an item while a foreign producer sits on the lowest free layer of the
  template-type range THEN the allocation does not land on that layer (or the load refuses with
  an explanation) — the foreign producer survives, no CLEAR reaches its layer
- WHEN the foreign layer later empties THEN the layer returns to the allocatable pool
- WHEN no foreign producer is observed in the range THEN allocation behaves exactly as today

**Notes:** IMPLEMENTATION LEAD (a pointer, not a decision): `LayerManager` already has
purpose-built `collision` / `quarantine` / `observe` wiring
(`packages/caspar-client/src/layers/layer-manager.ts:176-211`) that is currently DEAD — nothing
in the bridge calls it (the [[C-010]] dead-wiring family) — and it is the natural seam if
allocation becomes occupancy-aware. — CAUTION: this touches the load hot path and the
B-039/B-056 adoption semantics; the blind-tap rule ([[B-093]]) applies here too — an unobserved
layer is NOT knowably free, and real CasparCG goes silent for empty layers (B-053), so
"no fresh observation" must not read as "occupied forever" either. Relates to [[B-092]]'s
restart-misadoption limit (recorded in `openspec/changes/runtime-protect-video-layers/design.md`):
both need the bridge to reason about producer KINDS it did not place.

## [~] C-015 — Live Source routing: map Live Source ids to DECKLINK / ROUTE / media / NDI (fill+key capable) and composite them behind the template ⟨priority: high⟩ — in progress: `openspec/changes/live-source-multibox/` (design + phases 1–4 landed — authoring, the declaration carrier, the mock, and the MAPPING STORE with its CG Control surface, which is what makes a symbolic id resolve to a real producer; DECKLINK / NDI / fill+key split out to [[C-021]])

**What:** The Designer track is adding a "Live Source" element — a template region exported as a
FULLY TRANSPARENT hole plus metadata (geometry in scene px, a source id, an optional key source
id, expectedAspect, and whether the id is DYNAMIC/field-bound). When an item whose template
declares Live Sources is taken, the BRIDGE places each Live Source's mapped source on its own
CasparCG layer BELOW the template's layer, geometrically behind the hole. The Runtime settings
expose the installation's source-id → concrete source mapping: a DECKLINK input, another
channel/layer via the ROUTE producer, a media file, or an NDI source.
**Why:** An HTML template cannot render live video; CasparCG composites layers. The template
stays portable — it names sources by id only (Cinegy's Live ID model); mapping id → concrete
source is an INSTALLATION concern configured in the Runtime.
**Acceptance:**

- WHEN the Runtime settings expose a source-id → source mapping THEN a source can be any of: a
  DECKLINK input device, another channel/layer via the ROUTE producer, a media file from the
  CasparCG media folder, or an NDI source (subject to the NDI note below)
- WHEN an item whose template declares Live Sources is taken THEN for each Live Source the bridge
  allocates a dedicated layer below the template's layer, plays the mapped producer there, and
  applies MIXER FILL derived from the Live Source's scene-px geometry (normalized), so the source
  sits exactly behind the hole — sources are up BEFORE the template's intro reveals them (exact
  ordering is a design.md decision: pre-roll Live Source producers, then CG PLAY)
- WHEN a Live Source declares a KEY source id THEN the fill and key sources are composited as a
  fill+key pair — likely the key on the layer beneath the fill with `MIXER KEYER` — the exact
  CasparCG mechanism is VERIFIED at recon on real 2.3.2 via `tools/caspar-amcp-probe`, never
  assumed
- WHEN a Live Source's source id is DYNAMIC and the operator updates its field value THEN the
  bridge retargets that Live Source's layer to the newly mapped source (swap the producer on the
  SAME layer) without disturbing the template's layer or other Live Sources
- WHEN the item is stopped or cleared THEN the Live Source layers are cleared alongside it, and
  the template's own STOP/CLEAR verb semantics ([[C-012]]) are unchanged
- WHEN a declared source id has no mapping THEN the take refuses legibly with a distinct
  errorCode (never a silent empty hole on air)
- WHEN the bridge restarts while Live Sources are on air THEN Live Source layers are re-adopted
  or re-established consistently with the [[B-092]] occupancy-aware adopt (design.md decision —
  never a blind CLEAR of a live source)
- WHEN Live Source layers exist THEN the occupancy model treats them as BRIDGE-OWNED non-html
  layers: never quarantined or counted as foreign by [[C-014]] allocation, and never an [[R-009]]
  reclaim target. **CORRECTED 2026-08-03 (`live-source-multibox` design.md §4, C5):** this bullet
  originally said "exempt from [[R-015]]'s foreign-refusal (the bridge may CLEAR what it owns)".
  Applying that literally is BACKWARDS. `clearLayer` is the OPERATOR-facing `layers.clear` path
  only — its own docstring says "clearing owned layers is Out/Remove's job"
  (`caspar-runtime.ts:2649-2651`) and it refuses an owned layer at `:2682-2686` BEFORE the html
  test at `:2690`. The bridge needs no exemption to clear what it owns (teardown calls
  `#builder.out(slot)` directly), and granting one as worded would make Live Source layers
  OPERATOR-clearable — inverting the protection. The correct behaviour is a REFUSAL with a
  distinct `live-source` reason, following the owner-approved config-declared carve-out precedent
  at `docs/prd/runtime.md:882-885` (`clearBankLayer`, which consults no producer kind at all).
- WHEN a template declaring N Live Sources is configured THEN CG Control can assign **each of them
  individually** to a concrete producer, persisted bridge-side
- WHEN the two-box `route://` demo is run THEN it works on the plant's real CasparCG **2.3.2** —
  which needs no capture card

**NARROWED 2026-08-08 (owner, `live-source-multibox` design.md §12.1).** The two bullets above
REPLACE the original _"WHEN DECKLINK / ROUTE / media sources are used THEN behavior is verified on
real CasparCG 2.3.2 hardware before archive; WHEN NDI is used THEN the FIRST step is verifying the
NDI producer exists on the client's 2.3.2 build at all"_. The reasoning is the owner's and it is
structural, not a concession: **the Designer never names a concrete device.** A template declares
SYMBOLIC ids only, and binding an id to a producer is an INSTALLATION act performed in CG Control —
so this item's done-condition is about ASSIGNMENT, which is fully testable here, not about capture
hardware, which is not. The DECKLINK and NDI arms are **parse-verified only** on this installation
and **fill+key cannot be validated here at all** (no Decklink card; fill+key reaches air over
NewTek iVGA into a TriCaster, [[C-020]]); all three moved to **[[C-021]]**, `[!]` blocked on
hardware. With that split, `live-source-multibox` phases 1–6 carry **no undischargeable hardware
debt** — the two mixer facts the geometry rests on (`FILL`'s per-axis normalization and `CLIP`'s
masking semantics) are already confirmed on 2.3.2.

**Notes:** **THE structural risk, flag it loudly:** "non-html OSC producer kind" is the PRIMARY
foreign/owned discriminator ([[R-015]], [[C-014]]). **CORRECTED 2026-08-03: this said "SOLE" and
that is stale.** Two config-declared notions already outrank it — `clearLayer` evaluates `reserved`
(`caspar-runtime.ts:2679-2681`) then `owned` (`:2682-2686`) BEFORE the kind test, and
`clearBankLayer` (`:2577-2643`) decides purely from config and never consults kind at all.
`docs/prd/runtime.md:886-888` already names three composing ownership notions INCLUDING this item's
ledger. The risk below is real; only the word "SOLE" was wrong. This feature deliberately creates
bridge-OWNED non-html layers, so ownership must become explicit (the bridge's own ledger of
Live Source layers) rather than inferred from producer kind — that interaction needs its own
tests and careful design against the R-015/C-014/R-009/B-092 suite. Layer plan (reserved
sub-range below the template's layer vs adjacent layers) is a design.md decision. Exact AMCP
producer forms (DECKLINK DEVICE syntax, route:// addressing, NDI) verified at recon, never
assumed. MIXER FILL is axis-aligned — matches the Designer half's v1. Cinegy parity is the
NEED, not the UI. Designer-side counterpart: the "Live Source element" item in
`docs/prd/designer.md` (cross-reference by title now; numbers when both are merged). On-air
behavior throughout ⇒ real-hardware verification is part of done. RECON-FIRST, needs its own
design.md. **Naming (owner, 2026-07-23):** the user-facing name is **Live Source** — the plate
is live/on-air ONLY (file video is the separate `video` element, D-128 on the designer track),
so "plate" was misleading; this item's title/prose were renamed to match the designer track's
D-137. The schema type remains `video-placeholder` (`VideoPlaceholderElementSchema`) — renaming the
TYPE is a scene MIGRATION, not a label change, and is deliberately out of scope. **CORRECTED
2026-08-03: the stated evidence for that was two-thirds wrong.** It said the type "is referenced by
scene-builder, saved scenes on disk, and specs". Only scene-builder is true
(`packages/template-runtime/src/scene-builder.ts:197`). It appears in **no living spec**
(`git grep "video-placeholder" -- openspec/specs` → 0 hits) and in **no stored scene in the repo**
(the two `fixtures/b034/*.scene.json`, `fixtures/b068/legacy-root-layers.cg.json` and all six
tracked `.vcg` archives were byte-scanned; none contains it). The conclusion still stands, on
scene-builder plus union membership (`packages/shared-schema/src/elements.ts:1121, 1142, 1188`) —
only its evidence needed correcting.

## [ ] C-016 — operator PGM confidence view: periodic program-channel grabs served over the bridge's HTTP server ⟨priority: medium⟩

**What:** Operators need to SEE the on-air output inside the Runtime (Cinegy parity). CasparCG
has no browser-native video return, so v1 is a CONFIDENCE MONITOR: the bridge periodically
captures the program channel via a CasparCG grab/print-class command, serves the latest frame
over its existing HTTP server, and the Runtime shows it in a PGM panel refreshing ~1 s. OWNER
DECISION recorded: stills-at-~1 s IS the v1 bar; full-motion return (STREAM consumer + relay
transcode) is RECORDED IN THIS ITEM as an explicit later phase, not a v1 requirement.
**A SECOND CONSUMER, filed 2026-08-10:** [[C-023]] wants the same grab path pointed at a live
SOURCE rather than at the programme channel, for a per-source confidence thumbnail. It rides this
item deliberately instead of building a second mechanism — **and if this design turns out not to
generalise beyond the programme channel, that is a finding for THIS item**, not a licence for C-023
to fork its own grab path.
**Why:** The operator currently confirms what the viewer sees by looking at a separate monitor
(or guessing from row badges). A confidence view inside the console closes that loop — and a
Live-Source-heavy composite ([[C-015]]) makes PGM confidence MORE valuable, because the browser
preview can never show the live video the template composites over.
**Acceptance:**

- WHEN the PGM panel is on THEN it shows the program channel refreshing at ~1 s with a visible
  "last updated" age
- WHEN a capture fails THEN the panel shows a legible stale/error state — never a frozen frame
  masquerading as live
- WHEN the capture mechanism is chosen THEN its cost on the playout machine has been measured
  on real 2.3.2 BEFORE the mechanism is fixed (RECON-FIRST — verify the exact grab command this
  build supports and whether grabbing hitches channel output)
- WHEN the panel is hidden or off THEN its polling stops; the panel is OFF by default and
  toggleable

**Notes:** RECON-FIRST, needs its own design.md (command choice, frame transport, cadence).
Later-phase full-motion options recorded here so they are not re-derived: STREAM consumer →
local relay transcode → browser — latency and encode load on the playout box are the recorded
trade-offs. Cross-ref [[C-015]] (a Live-Source-heavy composite raises the value of a PGM view).

## [ ] C-017 — auto-clear a layer when a finite template run completes: the served template pings its own origin, the bridge CLEARs ⟨priority: medium⟩

**What:** A finite graphic (e.g. a ticker with a set repeat count) should leave air by itself:
after content completes AND the outro has played, the layer should CLEAR without operator
action (Cinegy parity). The template already knows this moment — the playout lifecycle defines
full settle for auto-out / content-driven holds — but nothing tells the bridge: OSC reports
only that an `html` producer exists, which is exactly [[B-030]]'s (`bugs-designer.md`)
observability gap. DIRECTION: the SERVED template signals completion to its OWN origin — the
bridge's template HTTP server (`tools/caspar-bridge/src/template-http-server.ts`), same-origin
— via a lightweight ping; the bridge then CLEARs the layer. Hard clear is correct here: the
outro already played, the layer is visually empty.
**Why:** Finished graphics that stay resident keep their rows claiming ON AIR and leave dead
producers on layers an operator must clean up by hand; the one party that knows the run is
over (the template) has no channel to say so.
**Acceptance:**

- WHEN a template whose lifecycle is finite/auto-out reaches full settle THEN the bridge clears
  the layer and the item reconciles to idle through the normal path
- WHEN a template's lifecycle is `manual` THEN it NEVER auto-clears — this applies ONLY to
  finite/auto-out lifecycles
- WHEN a completion arrives STALE (after an operator stop / re-take / update, or after the item
  left the layer) THEN it is IGNORED — mirroring the lifecycle spec's stale-completion rule
- WHEN a ping is lost THEN the graphic stays, exactly today's behaviour — auto-clear fails SAFE
  and is best-effort, never a new way to blank a live layer
- WHEN a single-file exported template is dropped manually into CasparCG THEN it is OUT OF
  SCOPE — there is no origin to ping

**Notes:** RECON items: `fetch` availability/behaviour in CEF ~71 for the served-template
origin ([[B-066]] class: verify, never assume), and the ping's URL/shape. LOUD cross-track
warning: the emission half lives in `packages/template-runtime`, which is in
`UI_RENDER_PATTERNS` — implementing it owes `gate:e2e` (Linux) and MUST NOT run concurrently
with a Designer session touching that package. RELATIONSHIP TO [[C-013]] (judged at filing,
not in the original direction): the completion-signal transport out of CEF is exactly what
C-013 names as its substance, and this item's same-origin ping is a concrete proposal for that
channel — but the terminal verbs differ (C-013: graceful STOP on content completion, producer
stays RESIDENT and resumable; THIS item: hard CLEAR at full settle of a finite lifecycle,
outro already played). One ping transport should serve both; which terminal verb applies to
which lifecycle is the shared design.md's call — never two competing transports. Cross-refs
[[B-030]] (this signal is also the missing observable for its diagnosis), [[C-012]] (verb
semantics unchanged — this adds a TRIGGER, not a verb).

## [ ] C-018 — CasparCG 2.5.0 upgrade + hardware validation ⟨priority: high⟩

**What:** Move the project's target server from **2.3.3 LTS to 2.5.0 Stable** (released
2025-12-10) and validate it on the real Windows playout machine — screen consumer first, then a
pass over the plant's REAL air path before anything on-air depends on it. That path is **NewTek
iVGA into a TriCaster, not Decklink** (this plant has no Decklink card at all), and 2.5.0 has
removed the iVGA consumer — see [[C-020]], which now owns that pass and BLOCKS this item's
cutover. OWNER DECISION, 2026-07-28. The owner
installs 2.5.0 **side-by-side** with 2.3.3 so rollback is preserved, and rebuilds the config
from the 2.5 defaults (1080i5000 channel, AMCP 5250, OSC predefined-client) rather than
copying the 2.3 config forward — a copied config is how a defaults change becomes an
unexplained behaviour difference.
**Why:** 2.5.0 routes HTML-producer audio into the channel mixer and consumers ("HTML: Support
audio", CasparCG/server PR #1590). On every 2.3.x/2.4.x build, template audio bypasses the
channel and plays out of the server's **system sound device** (CasparCG/server issue #669) —
unusable on air. This is the only supported path to audio inside HTML templates, so it gates
[[C-019]]. The upgrade also brings current CEF fixes.
**Acceptance:**

- WHEN 2.5.0 is started against the rebuilt config THEN it boots clean and AMCP `VERSION`
  reports 2.5.0
- WHEN the `@cg/caspar-client` AMCP subset is exercised THEN it behaves as validated on 2.3.2 —
  PLAY \[HTML], CG ADD / UPDATE / INVOKE / STOP / REMOVE, CLEAR, INFO
- WHEN an OSC trace is captured THEN it diffs clean against the 2.3.2 baseline
  (`fixtures/osc-traces/m1-baseline-sample.ndjson`), or every difference is documented in this
  item before the upgrade is accepted
- WHEN the Persian reference template is re-verified under **CEF 142** THEN fonts, shaping, RTL
  and animation timing all hold — this is a large CEF jump from the ~71 the rendering
  assumptions were built on ([[B-066]] class: verify, never assume)
- WHEN a template carrying an inlined base64 audio asset is triggered via CG PLAY with **no
  user gesture** THEN audio is present on the channel output, `/channel/1/mixer/audio/volume`
  goes non-zero, and MIXER VOLUME affects it
- WHEN autoplay behaviour is observed THEN the finding is recorded here — either it starts
  without a gesture, or the exact CEF flag that makes it do so
- WHEN the Windows first-packet behaviour and a clean `QUIT` shutdown are observed THEN both
  are recorded here, confirming or refuting the reported leak below

**Notes:** RECON-FIRST — no code changes ride this item; a dedicated change follows once the
validation passes.

**Validation findings — 2026-07-28 recon** (full evidence with commands and raw output:
`docs/recon/2026-07-28-casparcg-250-validation.md`; captures in
`tools/caspar-amcp-probe/evidence/2026-07-28-c018-validation/`). Machine-measurable
bullets PASS; the item stays open on the recon doc's OWNER CHECKLIST (audible audio,
Persian eyeball, live animation, leak listen, Decklink pass, channel-format decision).

- Boot clean; `VERSION` → `2.5.0 69e8ad5 Stable` — the Stable release IS the `69e8ad5`
  build the June escape sweep ran against. Platform gates pass: AVX2 present
  (i5-10400), MSVC runtime 14.42.34433.
- **The "plant is 2.3.3" premise was wrong:** the rollback install reports
  `2.3.2 4de6d18f Dev` — the exact build of the committed OSC baseline and probe
  evidence. There is no 2.3.2-vs-2.3.3 baseline gap; all old-vs-new comparisons below
  are same-build.
- AMCP subset: verb matrix, return codes, `CG UPDATE`-delivers-byte-exact-Persian, and
  STOP-resident/CLEAR-destroys lifecycle are all **identical to the 2.3.2 evidence**
  (three-way programmatic diff). Two behaviours measured identical on BOTH builds (not
  2.5.0 regressions): `CG ADD` rejects `file://` URLs with `404` (http works; `PLAY
[HTML]` accepts `file://`), and `CG PLAY` acks `202 CG OK` on an empty layer while
  the other CG verbs fail `403`.
- OSC diff vs `fixtures/osc-traces/m1-baseline-sample.ndjson` — differences exist and
  are hereby documented (acceptance's "or" branch): NEW in 2.5.0 are
  `/channel/N/format`, `/channel/N/output/port/N/consumer` +
  `/output/port/N/screen/{always_on_top,index,key_only,name}`, and
  `transition/{direction,producer}` detail; `mixer/audio/volume` grew **8 → 16**
  elements. The `foreground/producer = "transition"` wrapper on PLAY-loaded layers is
  NOT new — today's 2.3.2 recapture shows it too (the 500-line baseline sample just
  never sampled it); `CG ADD` layers report `"html"` directly on both builds. Nothing
  disappeared; framerate args unchanged `[50,1]`. Pre-upgrade code audit: the
  16-element volume array and any `producer === 'html'` matching on the foreground
  address.
- Persian template under CEF 142: renders with correct shaping/joining and **intact
  alpha** (PRINT frames carry real transparency). Rendering is pixel-equivalent to the
  plant build — including a shared `@cg/template-runtime` RTL quirk (text anchored at
  the LEFT edge; separate task filed, not an upgrade blocker). CEF 142 **improves**
  `file://`: the ES-module template renders from `file://` on 2.5.0 but renders
  NOTHING on the plant's CEF ~71 (inline-script pages work on both). The recorded 1 s
  in-animation was never observed mid-flight on 2.5.0 (settled ≤ 0.73 s after PLAY,
  all later frames byte-identical) — live-output animation is an owner-checklist item.
- Template audio (the WHY of this item), measured end-to-end with a 19,976-byte
  inline-MP3 fixture (`tools/template-fixtures/audio-autoplay.html`): on 2.5.0,
  `/channel/1/mixer/audio/volume` goes nonzero **297 ms** after PLAY with **no user
  gesture**, `MIXER VOLUME 0.5` halves the level exactly (1.804e8 → 9.02e7), `VOLUME 0`
  zeroes it, `CG STOP` → `window.stop()` → silent. Identical fixture on the plant
  build: plays (`onload: PLAYING`) but mixer volume stays **0 across 10,339 samples** —
  CasparCG/server#669 confirmed on the plant; PR #1590's channel routing confirmed on
  2.5.0. C-019 note: audio of a loaded-but-not-played (`CG ADD`, hidden) template is
  already live on the channel — gate audio on the play lifecycle, not load.
- Autoplay finding (recorded here per acceptance): **starts with no gesture and no CEF
  flag** — the active config has no `<html>` block at all. Same on both builds;
  routing, not autoplay, was ever the 2.3.x blocker.
- Windows first-packet + shutdown (recorded here per acceptance): **`QUIT` does not
  exist — `400 ERROR` on both builds; the AMCP shutdown verb is `KILL`**, which
  produced a clean, fully-logged shutdown (`202 KILL OK` → uninit sequence →
  `Successfully shutdown CasparCG Server.`, port released) on both builds. The
  first-packet leak is **still unmeasured and structurally unobservable on this
  config**: `<system-audio/>` legitimately routes the channel mix to the same default
  device the leak would use; deciding it needs ears plus a temporary config without
  `<system-audio/>` (out of recon scope). No anomaly in logs or OSC at first-audio or
  shutdown — weak negative evidence only.
- Escape sweep re-run on 2.5.0 Stable AND on the plant build: matrices identical to
  the June `69e8ad5` run — `js-escape+amcp-escape` remains the only byte-exact winner.
  **The probe's "2.3.2 conclusions PROVISIONAL (no 2.3.2 build available)" qualifier
  is resolved as CONFIRMED** — now hardware-validated on 2.3.2 `4de6d18f` and 2.5.0
  Stable. (Locking the rule into `escape.ts` stays B-041's follow-up change.)
- PR #1590 provisional-limitation verdicts: integer-framerates — still unmeasured and
  moot here (both configs are 50 Hz integer modes; no 59.94 mode exists on this box);
  first-packet leak — still unmeasured (above); Linux path — still unmeasured (Windows
  box). Config observation for the upgrade change: the rebuilt 2.5.0 config is stock
  **720p5000** with no OSC predefined-client, while the plant runs **1080i5000** with
  one — 1920×1080 templates overflow a 720p channel.

**OWNER CHECKLIST RESULTS — measured by the owner at the box, 2026-07-28.** These are the
six eyes-and-ears items the recon above could not settle. They are recorded here beside the
recon's machine-measurable findings; the block above is left exactly as PR #425 wrote it,
including the two conclusions this pass corrects.

- **Audible audio on the channel output: PASS on `720p5000` AND on `1080i5000`.** Heard, not
  inferred from the mixer array — the recon's 297 ms nonzero-volume measurement is now
  confirmed at the ear on both channel formats, so the format decision does not affect it.
- **`MIXER 1-20 VOLUME 0.5` / `0` / `1`: halved, muted, restored** — audibly, in that order.
  **Operator control over template audio is real**, not just an OSC number moving. This is the
  capability [[C-019]] is built on, and it is now hardware-confirmed rather than assumed.
- **Fonts, shaping and joining: correct.** The [[B-111]] fix was seen on hardware — the Persian
  text now sits against the **right edge of its authored box**, which is what the fixture was
  always supposed to show. The recon's "shared `@cg/template-runtime` RTL quirk (text anchored
  at the LEFT edge)" above was that stale-fixture bug, not a runtime defect; B-111 carries the
  full diagnosis.
- **Animation on 2.5.0 is FINE — this CORRECTS the recon's conclusion above.** The recon
  inferred a "1 s in-animation" from the scene's `frameRange` 0–50 @ 50 fps and reported it as
  never observed mid-flight. `frameRange` is the **timeline length, not evidence that any
  animation exists**: this fixture simply has no keyframes, so appearing instantly is correct
  behaviour and there was never a missing animation to observe. The owner verified OTHER
  templates animate correctly on 2.5.0. Nothing here is owed. (The general lesson is the
  repo's usual one — a derived number was read as an observation.)
- **Windows first-packet leak: CONFIRMED. This SETTLES the second of the three PROVISIONAL
  limitations listed below**, in the direction of the forum report — the leak is real on this
  build — but **refutes the mechanism the forum attached to it**. Two measurements:
  - With `<system-audio />` REMOVED from the config and `INFO 1` showing only the `screen`
    consumer, **a short beep was still heard at PLAY**. No consumer was routing the channel
    mix to the default device, so that beep cannot be the channel mix — it bypasses the
    channel. Nothing was heard at `KILL`, so **the clean-shutdown half is clean and the
    forum's link between the leak and shutdown does not hold** (the recon had already found
    `QUIT` does not exist and `KILL` shuts down cleanly on both builds).
  - With `<system-audio />` RESTORED, the same fixture gives a short **LOUDER** burst followed
    by the continuous **quieter** tone. The A/B across the two configs is what identifies the
    parts: the loud burst is the leak (bypassing the channel, present with no audio consumer
    at all), the quiet continuous part is the legitimate channel mix arriving via
    `<system-audio />`.
  - **Operational consequence, and it is a config rule not a code fix:** on the playout box the
    **default sound device must not be routed anywhere that reaches air**. The leak is a
    property of the server build; containing it is a matter of where the box's default device
    goes. Carry this into the cutover runbook.
- **The "Decklink pass" this item originally asked for does not apply to this plant** and has
  been rewritten in **What** above. There is no Decklink card here; the air path is NewTek
  iVGA into a TriCaster, and 2.5.0 has removed the iVGA consumer. That pass — and the cutover
  blocker it turned into — is now [[C-020]]. The OWNER CHECKLIST wording in the #425 block
  above still says "Decklink pass"; it is left as written, and this bullet is its correction.

PROVISIONAL limitations of the new audio path, taken from the PR #1590 discussion and forum
posts and **NOT from our own measurements** — this item's hardware pass is what settles them
(**the first-packet leak is now SETTLED — see the owner-checklist results above**; the other
two remain unmeasured):
integer framerates only (our 50 Hz plant is fine; 59.94 unsupported), a reported Windows
first-packet audio leak to the system speakers (a clean shutdown via `QUIT` was implicated),
and a Linux path that is only lightly tested.

Platform prerequisites to confirm on the target box BEFORE installing: 2.5.0 wants an
**AVX2-capable CPU** (mandatory from 2.6, so this is a forward-looking hardware gate, not just
a 2.5 one) and a current MSVC runtime.

**Stale 2.3-target references — LISTED, deliberately NOT edited here.** A dedicated change
updates them after validation passes; editing them now would assert a target we have not yet
verified. 47 non-`dist/` files under `tools/`, `packages/`, `apps/` and `docs/` mention
2.3.2/2.3.3/2.3.x. They are two different kinds and must not be swept together:

- TARGET declarations — these must change: `tools/amcp-mock/src/handlers.ts`
  (`VERSION_STRING = '2.3.2 Stable'`, plus its "subset of CasparCG 2.3.x AMCP" contract
  comment) and its assertion in `tools/amcp-mock/tests/amcp-response.test.ts`;
  `tools/spikes/SETUP.md` (the "Target version: **2.3.3 LTS**" runbook); [[C-001]]'s "hardware-validated
  … on CasparCG 2.3.2 (`4de6d18f`)" wording.
- HISTORICAL records — these must NOT be rewritten: the ADRs (`0003`–`0008`), phase docs,
  release notes, and spike READMEs record what was measured on which build. They stay accurate
  by staying as they are; the follow-up change ADDS 2.5.0 findings beside them.

One nuance worth carrying so it is not re-derived: `tools/caspar-amcp-probe` already ran its
escape sweep against a **2.5.0 dev build** (`69e8ad5`) and records its 2.3.2 conclusions as
PROVISIONAL because no 2.3.2 build was available that session. That probe is therefore already
half-validated for the new target — re-run it as part of this item and the provisional
qualifier can be resolved in one direction or the other.

Sources: <https://github.com/CasparCG/server/blob/master/CHANGELOG.md> ·
<https://casparcgforum.org/t/release-casparcg-2-5-released/7460> ·
<https://github.com/CasparCG/server/pull/1590> ·
<https://github.com/CasparCG/server/issues/669>

## [ ] C-019 — Audio in templates ⟨priority: medium⟩ — BLOCKED BY [[C-018]]

**What:** Audio as a first-class template capability: authored in the Designer, carried inside
the single-file export, and played by CasparCG from within the template itself — no separate
audio layer to arm, cue and keep in sync.
**Why:** Owner-requested feature. 2.5.0 makes it the supported path (see [[C-018]]); before
that release there was no correct way to do it at all, since template audio left the channel
entirely.
**Acceptance:** to be detailed when scheduled — this item is filed to hold the decision and its
constraints, not to be picked up as-is.

**Notes:** BLOCKED BY [[C-018]] — there is no point authoring audio the playout server cannot
route. Needs its own `design.md` / openspec change before any code, because the `.vcg` package
gains audio assets: that is a **schema change**, so `@cg/shared-schema` moves first per the
repo's schema-first rule.

Export side: inline audio as base64 data URIs through the existing inlining seam — the
`produceTemplateDelivery` fonts pattern
(`apps/runtime/src/renderer/features/library/templateDelivery.ts`, archived change
`openspec/changes/archive/2026-07-07-serve-template-and-render`). Prefer compressed formats
(MP3/AAC); WAV bloats the single file, and base64 adds ~33% on top of whatever is chosen.

Designer-side authoring (asset upload / manage / preview) is a **designer-track** item and is
filed separately on that track — cross-reference by title for now, "Audio in templates —
Designer authoring"; numbers get linked once both exist (the [[C-015]]/D-137 pattern).

MIXER VOLUME per html layer becomes meaningful once audio actually flows, which makes it a
genuine operator control rather than a no-op. On-air behaviour ⇒ real-hardware verification is
part of done, not a follow-up.

## [ ] C-020 — 2.5.0 REMOVED the iVGA consumer, and iVGA is this plant's entire air path ⟨priority: high⟩ — BLOCKS the [[C-018]] cutover

**What:** Choose, install and hardware-validate the replacement for `<newtek-ivga />` before
2.5.0 is cut over in the plant. The consumer does not exist in 2.5.0, and it is the only
video-carrying consumer the production config declares — so starting 2.5.0 against today's
config stops output to the TriCaster **entirely: the whole picture, not just audio**.
**Why:** [[C-018]] moves the plant to 2.5.0 for one reason — HTML-template audio finally
reaching the channel mixer. That upgrade cannot land while it also takes the plant off air.
The removal is not a deprecation with a fallback; the consumer is gone and the library it
depended on is not shipped, so the failure at cutover is total output loss, discovered live.
**Acceptance:**

- WHEN the plant's 2.5.0 config is prepared THEN it declares no `<newtek-ivga />`, and the
  consumer replacing it is named explicitly in this item with the settings it was validated at
- WHEN the replacement consumer runs on the playout box THEN the TriCaster sees the channel as
  a source and the picture is on air
- WHEN a template with a transparent background is played over the replacement path THEN fill
  AND key both arrive at the TriCaster — alpha confirmed by looking at the switcher, never
  inferred from the format's specification ([[B-066]] class: verify, never assume)
- WHEN the replacement's runtime dependency is checked on the playout box THEN it is either
  already present or recorded here as an install prerequisite of the cutover
- WHEN this item's hardware pass is recorded THEN [[C-018]]'s cutover is unblocked

**Evidence — all verified on disk during the 2026-07-28 owner checklist:**

- `CHANGELOG.md` shipped beside the 2.5.0 binary, **line 186**, inside the "CasparCG 2.4.0
  Stable" section (lines 116–193) under `### Consumers` / `##### Improvements`:
  `* iVGA: Remove consumer`. Directly below it: `* NDI: Upgrade to NDI5`. So the removal
  landed in 2.4.0 and 2.5.0 inherits it — the plant skipped the release that would have
  warned it.
- The production install's config `D:\programs\CasparCG\casparcg.config:15-19` declares
  consumers `<system-audio />` + `<newtek-ivga />` + `<screen />`. **There is no Decklink in
  this plant.** Fill+key reaches air over NewTek iVGA, into a TriCaster.
- `Processing.AirSend.x64.dll` — the library iVGA requires (`CHANGELOG.md:1007` and
  `:1062-1066`) — is **absent** from the 2.5.0 install directory.
- The 2.5.0 config's shipped-defaults comment documents consumers `decklink` / `screen` /
  `system-audio` / `ndi` and omits `newtek-ivga`; the same comment block in the 2.3.2 config
  does list it.

**Migration direction — INVESTIGATED, NOT VERIFIED.** Recorded so the work does not start from
zero, explicitly not as a decision: `<newtek-ivga />` becomes `<ndi />`; 2.5.0 ships a native
NDI consumer (NDI5, the same changelog line); the TriCaster is NewTek's own product, so NDI is
native to it; an NDI runtime is needed on the playout box. iVGA carried fill+key — NDI supports
alpha, but **that must be seen on hardware, never assumed**, which is why it is an acceptance
bullet rather than a premise.

**Notes:** **DEFERRED by owner decision, 2026-07-28** — this work waits for the integration
with the company's playout software, when the real destination and its settings are reachable.
Validating a replacement against a guessed destination would produce evidence about the guess.
Until then [[C-018]] stays open and **nothing on air depends on 2.5.0**: the plant keeps
running 2.3.2, the 2.5.0 install is side-by-side, and no config is cut over. The cost of the
delay is only that [[C-019]] stays blocked.

## [!] C-021 — DECKLINK, NDI and fill+key for Live Sources: the arms this installation cannot validate ⟨priority: high⟩ — BLOCKED: no capture card, and fill+key rides [[C-020]]

**What:** the three Live Source producer arms that [[C-015]] cannot discharge on this plant, split
out so C-015 can close on what it CAN prove. Verify, on hardware: (a) the **DECKLINK** producer form
and a real Decklink input as a Live Source; (b) the **NDI** producer — first that it exists on the
target build at all, then as a Live Source; (c) **fill+key** — a MAPPING whose DECKLINK arm names a
fill/key DEVICE PAIR, composited as a pair, alpha confirmed by looking at the switcher.

⚠ **AMENDED 2026-08-10 (owner) — arm (c)'s SUBJECT CHANGED and the old wording would send someone
looking for a field that no longer exists.** Fill+key is no longer "a Live Source declaring a KEY
source id": a template declares ONE symbolic id, and whether it resolves to one device or to a
fill/key pair is a property of the **MAPPING** in CG Control (`live-source-multibox` design.md §1a —
the author cannot know how a source arrives at a plant, which is the same argument §3 makes for
`expectedAspect`). What this item must now verify is the **mapping-level device pair**
(`SourceMappingsSchema`'s `decklink` arm gains `keyDevice`). The shipped `keySourceId` element field
is DEPRECATED, not removed, and is not what gets tested.
**Why:** [[C-015]]'s acceptance was NARROWED on 2026-08-08 (owner, `live-source-multibox` design.md
§12.1) to per-source assignment in CG Control plus the two-box `route://` demo, because the Designer
never names a concrete device: a template declares symbolic ids and binding one to a producer is an
installation act. That narrowing is only honest if the arms it drops are **filed**, not deleted —
otherwise "C-015 is done" would quietly come to mean "DECKLINK works", which nobody will have
checked. This item is where that debt lives, and it is blocked on hardware that is not in the
building rather than on anything anyone can code.
**Acceptance:**

- WHEN a Decklink card is present THEN a Live Source mapped to a `DECKLINK DEVICE <n>` producer
  plays behind the hole, its `MIXER FILL` + `CLIP` geometry correct, verified on real CasparCG 2.3.2
- WHEN NDI is attempted THEN the FIRST step is verifying the NDI producer exists on the client's
  build at all — record the finding either way, including a negative
- WHEN a MAPPING names a fill/key DEVICE PAIR THEN fill and key are composited as a pair and alpha
  is confirmed **by looking at the switcher**, never inferred from the format's specification
  ([[B-066]] class: verify, never assume) — and the template that names the id is UNCHANGED between
  a plant where that source is a pair and one where it is a single device
- WHEN `MIXER CHROMA` is evaluated (see the note below) THEN the finding is recorded either way —
  an alternative that was reasoned about is not an alternative that was tried
- WHEN any arm is verified THEN the exact AMCP producer form it was verified with is recorded here
  verbatim — a form that was reasoned about is not a form that was verified

**Notes — why this is `[!]` and not `[ ]`.** The block is physical. `D:\programs\CasparCG\casparcg.config:15-19`
declares consumers `<system-audio />` + `<newtek-ivga />` + `<screen />`: **there is no Decklink in
this plant**, and fill+key reaches air over NewTek iVGA into a TriCaster, which is exactly the path
[[C-020]] is deferred on. So the DECKLINK arm can only be parse-verified here, and fill+key cannot
be validated here at all — running it against a guessed destination would produce evidence about the
guess. **Ordering:** this item is downstream of [[C-015]]'s phases 1–6 (`live-source-multibox`
`tasks.md` §10, phase 7) and does not block any of them; its own unblocking rides [[C-020]]'s
integration with the company's playout software. **Parse-verification is still worth doing before
the hardware arrives** and is not this item's acceptance: it proves the command is well-formed, not
that a picture appeared.

**An ALTERNATIVE route to transparency worth evaluating, added 2026-08-10 — an option, not a plan.**
CasparCG has its own **`MIXER CHROMA`**, and it needs neither a fill+key path nor a capture card.
The plant's client exposes it as `ChromaKey` (`docs/recon/ciab-client-tools.json`, `Mixers` folder,
entry `ChromaKey`) with `Key` ∈ `None | Green | Blue | Black`, plus `Threshold` (default 34),
`Softness` (default 44) and `Spill` (default 100), all 0–100. A green- or blue-screen source keyed
server-side would give a transparent live plate over the graphic bed without a second SDI feed.
It is **not equivalent** — a chroma key is a different picture-quality proposition from a real alpha
channel, and it constrains what can be in front of the camera — so it is filed as something to
EVALUATE against arm (c), not as a substitute for it.
⚠ `ChromaKey` sits in the artifact's `Mixers` folder, which is the ONE folder that tracks AMCP's
`MIXER` surface; the same file's `Route`, `ATEM/*` and `ChannelInput` entries are the CLIENT's own
tools and say nothing about the server. Do not read one as the other.

## [ ] C-022 — the installation's live source list, served READ-ONLY over the bridge's HTTP server ⟨priority: medium⟩ — depends on [[C-015]] phase 4

**What:** the bridge exposes the installation's live source list as a **read-only HTTP endpoint** on
the server it already runs (`tools/caspar-bridge/src/template-http-server.ts`), so the **CIAB
client** — the plant's playout application, a modified CasparCG Client — can list the defined lives
and add them to its own rundown.

**Why:** this is not a new idea, it is a role the previous automation already had. Recorded by the
owner 2026-08-10: in the system this project replaces, each live was **created in CG Control** (type,
master, slave, format), saved as a **preset in a DATABASE**, and the **playout application read that
list** into its rundown. [[C-015]] phase 4's `SourceMappingStore`
(`~/.cg-runtime/bridge-source-mappings.json`) IS the successor to that database table — so it gains
a **SECOND CONSUMER**, and that consumer needs a way in.

Playout is a **separate application and may be on a separate machine**. Having it open the JSON by
path couples it to this machine's filesystem layout and gives it no stable shape to read: the file's
on-disk form is a store's private business and changes when the store changes. **The file stays the
source of truth; the endpoint is a VIEW.**

**Acceptance:**

- WHEN the endpoint is defined THEN its response shape is **DERIVED from `SourceMappingsSchema`**,
  never hand-written — two spellings of one contract is how they drift, and this drift would be
  invisible until a playout client showed the wrong source list
- WHEN any client calls it THEN it is **READ-ONLY**: there is no write path, and the operator's CG
  Control settings surface remains the only writer
- WHEN the store is ABSENT THEN the endpoint answers **"no mappings"**, not an error — matching
  phase 4's absent-file rule exactly (absent ⇒ NO MAPPINGS, fail-closed at take time, not a boot or
  request failure)
- WHEN a playout client calls an OLDER bridge THEN it can tell: the endpoint is **versioned or
  shape-marked**, so a client can distinguish "this bridge does not have the feature" from "this
  installation has no sources". This is [[R-036]]'s concern (a version/shape marker on the persisted
  bridge configs) on a **second surface** — cross-referenced deliberately, because the same silent
  ambiguity is what it exists to prevent
- WHEN the endpoint serves an entry THEN it carries the fields a rundown needs — the id, the
  operator-facing label, and the format — and never invents any the store does not hold

**Provenance, so this is not over-read.** The master/slave/format shape comes from
`docs/recon/ciab-client-tools.json`, the CIAB client's tool definitions (`ChannelInput`: `Type`,
`StreamPath`, `MasterNumber`, `SlaveNumber`, `Format`, …). That file describes a **MODIFIED CLIENT**,
not the CasparCG **server**, and its capture date is unknown. It is evidence about **what playout
expects to consume**, which is exactly what this item needs it for — it is NOT evidence about server
capability.

## [ ] C-023 — a confidence THUMBNAIL per live source in CG Control ⟨priority: medium⟩ — rides [[C-016]]

**What:** beside each entry in CG Control's source list, a small **periodically-refreshed still**
showing what that source is delivering **right now**, so the operator can confirm a feed before it is
needed and identify a failed one during a programme.

**Why:** the operator's real question is _"has guest 2's feed arrived, and is it the right camera?"_
A reachable/unreachable indicator **cannot answer it** — a black feed and a colour-bar feed are both
"present" and both wrong. Only a picture settles it.

It is also the **diagnosis half of [[R-048]]**: the thumbnails say WHICH plate died and which source
is healthy; R-048 performs the repair. Filed as a pair deliberately — an operator who can swap a
dead plate but cannot see which source to swap it to is being asked to guess on air.

**This REPLACES the parked "LIVE row" idea entirely.** The ad-hoc picture-in-picture use that
justified a LIVE row is explicitly not needed; do not re-file it.

**Two constraints that SHAPE the solution — part of the item, not footnotes:**

1. **The Runtime's PVW cannot be its home.** Rehearse renders the retained exported HTML in a
   browser iframe (`RehearsalFrame.tsx`, `srcDoc={html}`), and **a browser cannot display SDI or
   NDI** — the same wall `live-source-multibox` design.md §12.2 settled when it decided PVW shows an
   EMPTY, transparent region for a Live Source. Anyone reaching for "just show it in PVW" must be
   stopped by this item.
2. **Producing a picture means PLAYING the source somewhere**, and doing that on the air channel
   risks putting it on air. It needs a channel with **no air-carrying consumer**. ⚠ Whether this
   installation's CasparCG config has, or can gain, such a channel is a **RECON QUESTION — recorded
   OPEN, not assumed**. ⚠ **A CANDIDATE answer, not the answer:**
   `openspec/changes/live-source-multibox/design.md` **§9b** proposes a dedicated multi-box channel
   with no consumer of its own, and **§9b.1 sharpens what it would and would not give this item** —
   the isolation is the air route being DOWN, not the channel being consumer-less, so a probing grab
   is free off air and is a live picture change on air. That proposal is **not adopted** and this
   question stays OPEN; record the real answer here, including a negative.
   (`D:\programs\CasparCG\casparcg.config` declares `<system-audio />` +
   `<newtek-ivga />` + `<screen />`; whether an additional consumer-less channel is available or
   addable has not been established.)

**Mechanism:** rides [[C-016]]'s frame-grab-over-HTTP work rather than building a second mechanism;
cross-referenced both ways. If C-016's design does not generalise beyond the programme channel, that
is a **finding for C-016**, not a reason to fork a second grab path.

**Acceptance:**

- WHEN the source list is shown THEN each entry carries a periodically-refreshed still of that
  source, and a stale or unavailable still is shown AS stale rather than as a black picture
- WHEN a thumbnail is produced THEN it is produced on a channel with no air-carrying consumer, and
  the mechanism is C-016's grab path
- WHEN the recon question above is answered THEN the answer is recorded here, including a negative

**Explicitly OUT of scope:** any path that puts the checked source on the **programme channel**, and
any **continuous video stream** to the browser. A periodic still is the deliverable.
