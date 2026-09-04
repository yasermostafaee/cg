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

## [~] C-015 — Live Source routing: define the installation's live sources, assign one to each template plate, and composite them behind the template ⟨priority: high⟩ — in progress: `openspec/changes/live-source-multibox/` (design + phases 1–4 landed — authoring, the declaration carrier, the mock, and the TWO SOURCE STORES with their CG Control surfaces, which is what makes a plate resolve to a real producer; DECKLINK / NDI / fill+key split out to [[C-021]])

**What:** The Designer track is adding a "Live Source" element — a template region exported as a
FULLY TRANSPARENT hole plus metadata (geometry in scene px, a PLATE id, expectedAspect, and whether
the id is DYNAMIC/field-bound). When an item whose template declares Live Sources is taken, the
BRIDGE places each plate's ASSIGNED source on its own CasparCG layer BELOW the template's layer,
geometrically behind the hole.

> **Pointer — "could the sources go ABOVE the template instead?" is [[B-194]], in
> `bugs-runtime.md`.** Asked on 2026-09-01 after the owner rejected all three outcomes of the
> page/mixer skew, studied to a verdict, and **REJECTED**: the architecture renders correctly (a
> clipped producer above a CEF page was measured leaving every other pixel to the page), but the
> template must still be able to paint OVER a live picture, which costs a second CEF layer per row —
> and three extra CEF pages cost this channel 36 % of its frames in one recording out of ten. The one
> thing that would reopen it is retiring that requirement; the item says so in full.

> **Pointer — the aspect-mismatch consent is [[R-053]], in `runtime.md`.** The refusal
> (`live-source-aspect-mismatch`), the `ASPECT_MATCH_TOLERANCE` and the whole fit chain live here,
> in `tools/caspar-bridge/src/live-plate-fit.ts` — but the WORK is Runtime: the consent affordance
> on the row, the persistent "cropped by consent" indicator, and the retention behaviour on
> `RetainedStackItem`. Filed under `R-` for the same reason [[R-048]] is, whose mechanism is
> likewise `swapLiveSource` in this bridge. Do not file a second item here.

⭐ **RESHAPED 2026-08-10 (owner, `live-source-multibox` design.md §2z / §2d).** The installation
builds its list of lives **INDEPENDENTLY**, with no reference to any template: each entry carries a
human NAME ("Studio A", "Baku", "Skype 1") beside its producer — a DECKLINK input, another
channel/layer via the ROUTE producer, a media file, or an NDI source. Separately, each imported
TEMPLATE gets, **per live plate, a property naming one of those defined sources**, set once per
template in the **Inspector** when that template is selected.

**Why the join is EXPLICIT rather than a name match.** Binding by name silently requires the AUTHOR
to guess the installation's naming convention, which contradicts this design's own principle that
the Designer knows nothing about the installation. The author names plates for the LAYOUT, the
installation names sources for what they ARE, and one deliberate operator action joins them.
**Why at all:** An HTML template cannot render live video; CasparCG composites layers. The template
stays exactly as portable as before — it names its own plates and never a device — and resolving a
plate to a concrete source is an INSTALLATION concern configured in the Runtime.
**Acceptance:**

- WHEN the Runtime settings expose the installation's live source list THEN each entry carries a
  human NAME and a producer that can be any of: a DECKLINK input device, another channel/layer via
  the ROUTE producer, a media file from the CasparCG media folder, or an NDI source (subject to the
  NDI note below). The list is built with NO reference to any template
- WHEN a template with live plates is selected THEN the Inspector offers, per plate, a picker over
  those named sources; the assignment is TEMPLATE-LEVEL (shared by every row carrying that template)
  and the surface SAYS SO where it is made
- WHEN a source that plates are assigned to is REMOVED THEN the removal is allowed, the assignments
  it orphans are dropped in the same operation, and the surface names at that moment which templates
  referenced it — an assignment that dangles until air is the failure this feature exists to prevent
- WHEN one source is assigned to two plates at once THEN it is permitted, and nothing in the UI
  presents it as guaranteed until phase 6's measurement session establishes whether a DECKLINK input
  accepts a second open
- WHEN an item whose template declares Live Sources is taken THEN for each Live Source the bridge
  allocates a dedicated layer below the template's layer, plays the mapped producer there, and
  applies MIXER FILL derived from the Live Source's scene-px geometry (normalized), so the source
  sits exactly behind the hole — sources are up BEFORE the template's intro reveals them (exact
  ordering is a design.md decision: pre-roll Live Source producers, then CG PLAY)
- WHEN an installation's source is a fill+key DEVICE PAIR THEN it is stated on that SOURCE and no
  template ever names it, and the two are composited as a pair — likely the key on the layer beneath
  the fill with `MIXER KEYER` — the exact CasparCG mechanism is VERIFIED at recon on real 2.3.2 via
  `tools/caspar-amcp-probe`, never assumed
- WHEN a Live Source's plate id is DYNAMIC and the operator updates its field value THEN the
  bridge retargets that layer to the newly resolved source (swap the producer on the SAME layer)
  without disturbing the template's layer or other Live Sources
- WHEN the item is stopped or cleared THEN the Live Source layers are cleared alongside it, and
  the template's own STOP/CLEAR verb semantics ([[C-012]]) are unchanged
- WHEN a declared plate has no ASSIGNMENT THEN the take refuses legibly with a distinct errorCode
  NAMING THE PLATE (never a silent empty hole on air). That covers both ways to reach the state: a
  freshly imported template, whose plates are all unassigned and which is the ordinary case; and a
  plate whose assignment was dropped because its source was retired
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
- WHEN a template declaring N Live Sources is configured THEN CG Control can assign **each plate
  individually** to one of the installation's named sources, persisted bridge-side (a SECOND store
  beside the template registry, because the bridge is what resolves a plate at take)
- WHEN the two-box `route://` demo is run THEN it works on the plant's real CasparCG — the
  production **2.5.0** (corrected 2026-08-22; this said 2.3.2, which is retired and must never be
  probed) — which needs no capture card

**NARROWED 2026-08-08 (owner, `live-source-multibox` design.md §12.1).** The two bullets above
REPLACE the original _"WHEN DECKLINK / ROUTE / media sources are used THEN behavior is verified on
real CasparCG 2.3.2 hardware before archive; WHEN NDI is used THEN the FIRST step is verifying the
NDI producer exists on the client's 2.3.2 build at all"_. The reasoning is the owner's and it is
structural, not a concession: **the Designer never names a concrete device.** A template declares
SYMBOLIC ids only, and binding an id to a producer is an INSTALLATION act performed in CG Control —
so this item's done-condition is about ASSIGNMENT, which is fully testable here, not about capture
hardware, which is not. All three arms moved to **[[C-021]]**. With that split,
`live-source-multibox` phases 1–6 carry **no undischargeable hardware debt** — the two mixer facts
the geometry rests on (`FILL`'s per-axis normalization and `CLIP`'s masking semantics) are already
confirmed.

⭐ **CORRECTED 2026-08-24 — this paragraph used to say "no Decklink card" and file all three arms
as blocked on hardware.** The plant HAS a **DeckLink SDI 4K** (index `1`, persistent ID
`23487013`), and `PLAY 1-10 DECKLINK DEVICE 1` initialises with real signal on the production
2.5.0, so the DECKLINK arm is **no longer parse-verified only** — see [[C-021]]'s corrected block
for exactly which half of it is now measured and which is not. The NARROWING above is unaffected
and stands on its own reasoning: the Designer never names a concrete device, whether or not a card
is in the building. NDI is still parse-verified only, and fill+key still cannot be validated here
until a second SDI input is confirmed.

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

🔴 **THE BACKDROP PUNCH FAILED ON HARDWARE, 2026-08-15 — and this changes HOW the multi-box gets
built, not whether.** Run by the owner at the plant with `tools/live-source-punch-probe/`; the
filled form is that kit's README, the reading is `live-source-multibox` task 1.5b, and the design
consequence is its `design.md` §9a.

**What was measured.** A multi-box layout normally carries a designed OPAQUE BACKDROP behind its
boxes, and the whole HTML page is ONE CasparCG layer — so a plate must ERASE what the template
painted beneath it, not merely paint nothing. Two CSS mechanisms were carried to the plant and
**both failed**: `mix-blend-mode: destination-out` erased inside the page but produced **opaque
black rather than alpha 0**, which CasparCG composited over the live layer; masking the backdrop had
**no visible effect at all** (recorded as an AMBIGUOUS failure — that signature cannot distinguish
"the mask does not reach page alpha" from "the mask never applied"). Both alternative explanations
for the first were eliminated rather than assumed.

**The consequence, stated at the level this item cares about: `design.md` §9b — the multi-box on a
CHANNEL OF ITS OWN — moves from fallback to the LIVE OPTION.** It is **not adopted**; adoption stays
gated on §12.5's four measurements plus one owner question, which have now moved onto the critical
path. Deferring them now defers the feature rather than a contingency.

⚠ **ONE GAP THIS OPENS AND DOES NOT CLOSE, recorded here because it is a client-facing limit rather
than a design detail: a SINGLE-CHANNEL installation has no dedicated channel to fall back to.** The
punch was the answer for that case and there is now no answer for it at all. §9b serves a plant that
can spare a channel; if this plant cannot, the multi-box story needs a different one.

**Two findings from the same run that are worth keeping:**

- ⭐ **The scoping WORKS.** An erase confined to an inner fill node did NOT eat the outer frame or
  shadow (criterion 2 passed). Whatever replaces the punch, paint beside an erase can survive it.
- 🔴 **PRODUCTION IS CasparCG 2.5.0 (`69e8ad5`, Chromium 142). 2.3.2 IS RETIRED — owner's decision,
  2026-08-15.** So the punch answer above is a PRODUCTION answer, not one taken elsewhere that
  happens to generalise. **Every "measure on 2.3.2 / CEF 71" instruction in `live-source-multibox`
  (~two dozen of them) is now stale text to correct** — a warning that has outlived its truth. A
  stale 2.3.2 install still sits at `D:\programs\CasparCG`; no probe may be pointed at it, or CEF-71
  answers get recorded as production. Not new to the repo: `docs/prd/bugs-runtime.md` records the
  same build from 2026-07-07 onward. **Record the build string beside every hardware answer** — the
  next upgrade makes today's answers historical.
- ⭐ **A consequence that reaches beyond this item: the project's CEF 71 / Chromium 71 BASELINE may
  now be false**, and `B-066` (a `tsconfig` setting that passed every local check and threw
  `SyntaxError` on CEF 71, on air) is its standing citation. Enumerating where that baseline is
  encoded — build targets, polyfills, design-doc refusals — is recon owed; raising it is a
  behaviour change that ships silently and belongs on its own session with its own `gate:e2e`.

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
  on the production 2.5.0 BEFORE the mechanism is fixed (RECON-FIRST — verify the exact grab command this
  build supports and whether grabbing hitches channel output)
- WHEN the panel is hidden or off THEN its polling stops; the panel is OFF by default and
  toggleable

**Notes:** RECON-FIRST, needs its own design.md (command choice, frame transport, cadence).
Later-phase full-motion options recorded here so they are not re-derived: STREAM consumer →
local relay transcode → browser — latency and encode load on the playout box are the recorded
trade-offs. Cross-ref [[C-015]] (a Live-Source-heavy composite raises the value of a PGM view).

**⭐ THE RECON KIT EXISTS (session BN, 2026-08-22). The item stays `[ ]` — nothing is implemented,
no mechanism is chosen, and no `design.md` was written.** What exists is the instrument this item's
third acceptance bullet demands, and the form to fill in at the box:

- **The kit** — `tools/caspar-amcp-probe/bin/confidence-probe.mjs` (source `src/confidence-probe.ts`,
  README section at the end of that package's README, written for an installer at ANOTHER station).
  It drives a real CasparCG over AMCP, prints a human summary and writes machine-readable JSON.
- **The runbook** — `docs/recon/2026-08-22-confidence-grab-measurement.md`, a FORM with empty tables:
  §A this item, §B the 2× discriminator, §C the AMCP probes the repo already owes.

**What it will answer:** which grab verb this build actually has (discovered from the server's own
enumeration — it refuses to guess one); the latency of one grab at rest and under load; whether the
channel's own counters move during a grab; whether that cost is flat over a ≥5-minute 1 Hz run (the
measurement that decides whether the "~1 s" bar is affordable at all); whether the path generalises
beyond the programme channel ([[C-023]]'s whole ride, both candidate paths distinguished); and what
the produced artifact is.

🔴 **TWO FINDINGS ALREADY, both read from the code rather than measured, and both are design work
for this item's session rather than defects:**

1. **The bridge's HTTP server has NO filesystem root.** `tools/caspar-bridge/src/template-http-server.ts`
   serves exactly one route — `/template/<id>` — out of an in-memory map, and 404s everything else.
   So "served over the bridge's HTTP server" needs a route that **does not exist yet**, wherever the
   grab lands on disk.
2. **`Add / ChannelSnapshot` in `docs/recon/ciab-client-tools.json` is NOT evidence of a server
   verb.** That file is the CIAB **client's** tool list; its own README says the `Add` folder holds
   that product's own tools and that a client tool must never be read as a server capability. It is
   a hint about where to look, and the kit will not accept it in place of the server's own answer.

⚠ **The owner constraint that frames the whole design, recorded 2026-08-21:** _"This product is not
only for one particular network. It may be sold to different networks, each of which has different
facilities."_ So this item may not be scoped, justified or dropped by reference to THIS plant's
facilities — a station with a monitor wall and a station with none are both targets, and
**"the operator can already see it on the multiviewer" is not an argument available to this
design.** That is why the acceptance bullet about being OFF by default and toggleable stops being a
nicety: it is the mechanism by which one product serves both. Do not quietly design it away.

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
iVGA into a TriCaster, not Decklink** (corrected 2026-08-24: this said "this plant has no Decklink
card at all", which is false — a **DeckLink SDI 4K** is fitted and drives output on 2.5.0. What is
true is that the AIR PATH is iVGA; whether a Decklink consumer should replace it is [[C-020]]'s
open question, and the card's presence makes that a live option rather than a hypothetical), and
2.5.0 has removed the iVGA consumer — see [[C-020]], which now owns that pass and BLOCKS this
item's cutover. OWNER DECISION, 2026-07-28. The owner
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
  been rewritten in **What** above — because the AIR PATH is NewTek iVGA into a TriCaster and
  2.5.0 has removed that consumer. ⭐ **CORRECTED 2026-08-24: this bullet also said "There is no
  Decklink card here", and that is false** — a **DeckLink SDI 4K** is fitted, and on 2026-08-24 a
  `<decklink>` consumer with `<device>23487013</device>` reached `Initialized.` on it. The pass is
  still not what this item needs (it needs the path that actually reaches the TriCaster), but the
  reason is the DESTINATION, not the absence of a card. That pass — and the cutover
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
  consumers `<system-audio />` + `<newtek-ivga />` + `<screen />` — so no Decklink CONSUMER is
  declared, and today's air path is NewTek iVGA into a TriCaster. That much still stands and
  is what BLOCKS the cutover.

  🔴 **CORRECTED 2026-08-24 — this bullet used to conclude "There is no Decklink in this
  plant", and that conclusion was FALSE.** It read a config's consumer list as an inventory of
  the box's hardware, which it is not: a card can be fitted and simply not declared as a
  consumer. The plant's own 2.5.0 startup log enumerates
  `DeckLink SDI 4K [1] (23487013)`, and on 2026-08-24 the owner drove it in BOTH directions —
  `PLAY 1-10 DECKLINK DEVICE 1` initialised with real signal on the INPUT, and a `<decklink>`
  consumer with `<device>23487013</device>` reached `Initialized.` on the OUTPUT
  (`DeckLink SDI 4K [1-23487013|1080p5000]`), both at once on the same card. The false
  inference propagated into [[C-021]]'s block, `command-builder.ts` and the
  `live-source-multibox` design; all are corrected. **What this does NOT settle** is whether a
  Decklink consumer is the right REPLACEMENT for `<newtek-ivga />` — that is still this item's
  work, and it is now a question about the destination rather than about whether a card exists.
  Full sheet: [../recon/2026-08-25-decklink-model-walk.md](../recon/2026-08-25-decklink-model-walk.md).

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

## [!] C-021 — DECKLINK, NDI and fill+key for Live Sources: the arms this installation cannot validate ⟨priority: high⟩ — walk-run 2026-08-25: arm (a) DECKLINK **UNBLOCKED, both producer spellings proven**; arm (b) NDI **still BLOCKED**; arm (c) fill+key **PARKED — no second SDI input exists on this card**

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
  plays behind the hole, its `MIXER FILL` + `CLIP` geometry correct, verified on the production
  **2.5.0** (corrected 2026-08-24; this said 2.3.2, which is retired and must never be probed).
  ⭐ The card is present as of 2026-08-24 and `PLAY 1-10 DECKLINK DEVICE 1` initialises with real
  signal — so this bullet's PRECONDITION is met and only its subject (a plate behind the hole,
  geometry correct, seen on air) is still owed
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

🔴 **CORRECTED 2026-08-24 — the premise this item was filed on is GONE. This plant HAS a Decklink
card.** CasparCG's own startup log on the production 2.5.0 (`69e8ad5`) enumerates
`DeckLink SDI 4K [1] (23487013)`, and the owner drove it in BOTH directions in one sitting:

- **INPUT — arm (a) is no longer "cannot validate".** `PLAY 1-10 DECKLINK DEVICE 1` returned
  `Initialized` repeatedly with real signal. That is the INDEX form, and it is now MEASURED.
- **OUTPUT.** A `<decklink>` consumer with `<device>23487013</device>` logged
  `Enabled embedded-audio.` then `Initialized.`, and named the card
  `DeckLink SDI 4K [1-23487013|1080p5000]` — so the **persistent ID is accepted in the CONSUMER's
  `<device>` element**. Both directions ran at once on the same card.
- ⚠ **NOT proven: the persistent ID as a PRODUCER argument** (`DECKLINK DEVICE 23487013`). The
  consumer and the producer are different parsers, and this has not been tried.
  ✅ **ANSWERED 2026-08-25 — YES, it works. This bullet is superseded; see the walk block below.**
- ⚠ Incidentals from the same run, recorded so they are not re-discovered as defects: the input
  auto-detected `1080i5000` against a `1080p5000` channel and produced an `in-sync`/`out-sync`
  drift flood (fix: match the channel to the incoming signal); `Failed to enable external keyer.`
  fires on every start, is **non-fatal**, and `<keyer>default</keyer>` does not silence it on
  2.5.0; `Reference signal: not detected` — no genlock on this card today.

**Where the old claim came from, so it is not re-derived.** [[C-020]]'s evidence block read the
production config's CONSUMER list (`<system-audio />` + `<newtek-ivga />` + `<screen />`) as an
inventory of the box's hardware. It is not one — a card can be fitted and not declared. That single
inference is what put "no capture card" into this heading, `command-builder.ts` and
`live-source-multibox` design.md; all three are corrected.

## ⭐ THE WALK WAS RUN — 2026-08-25. Q1 and Q2 land on this item.

[../recon/2026-08-25-decklink-model-walk.md](../recon/2026-08-25-decklink-model-walk.md), owner-run
on the plant. Host `192.168.21.114`, install `D:\casparcg-server-v2.5.0-stable-windows`,
`VERSION SERVER` → `2.5.0 69e8ad5 Stable`. Q3 went to [[C-028]] and Q4 to [[C-027]]; **Q1 and Q2
are this item's, and this is the "recorded here verbatim" the last acceptance bullet asks for.**

### ✅ Q1 — arm (a): the PERSISTENT ID works as a PRODUCER argument

```
PLAY 1-10 DECKLINK DEVICE 23487013
DeckLink SDI 4K [23487013|1080p5000] Initialized
#202 PLAY OK
DeckLink SDI 4K [23487013|1080p5000] Input format changed from 1080p5000 to 1080i5000
```

The known-good `DECKLINK DEVICE 1` was run first and gave the same shape. 🔴 **The
`Input format changed` line is what makes this a PASS and not a `202` over a dead producer** —
only an open card reports the incoming raster changing under it. The log names the device by its
**ID**, so the server resolved the argument AS an ID rather than coincidentally matching an index.

⇒ **`DECKLINK DEVICE <n>` accepts EITHER handle**, and `SourceProducerSchema`'s
`z.number().int().positive()` already admitted both — **no schema change was needed**. Prefer the
persistent ID where the operator has one: an index moves when the PCIe order changes or a second
card is fitted. Corrected in `command-builder.ts`, its test, the amcp-mock classifier and
`live-source-multibox` `tasks.md` 6.1.

### ❌ Q2 — nothing enumerates the devices. No picker is possible.

All four commands were **actually typed** — that is the value of the record:

| command tried    | reply                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `INFO SYSTEM`    | `#200 INFO OK` + `1 1080p5000 PLAYING` — 2.5.0 **IGNORES the `SYSTEM` token** and answers plain `INFO` |
| `INFO`           | the same channel line; no device information of any kind                                               |
| `INFO CONFIG`    | `#201 INFO CONFIG OK` + the configuration XML                                                          |
| `VERSION SERVER` | `#201 VERSION OK` + `2.5.0 69e8ad5 Stable`                                                             |

🔴 **`INFO SYSTEM` degrading silently to `INFO` is the trap.** It answers `#200 INFO OK`, so a
caller checking only the response CODE would record it as a supported query that found no devices.

⭐ **One partial, and it is NOT an enumeration.** `INFO CONFIG` does return
`<decklink><device>23487013</device>` — but that is **what the operator wrote into
`casparcg.config`**, not what the card reports. It cannot list a device nobody configured, carries
no name or index, and goes stale exactly when config and hardware disagree, which is the case a
picker exists to catch. A _hint_, never a picker.

⇒ **No picker item is filed, and that is a decision rather than an omission.** The device list
exists only in the startup log, and the bridge does not read the server's disk and must not start.
The modal keeps its bare numeric input; Q1's YES softens the cost, because the number typed there
can be an ID that does not move.

**Notes — why this is STILL `[!]` and not `[ ]`, and why it is not `[~]` either.** Arms (b) and (c)
remain blocked, so `[ ]` (queued, nothing in the way) would be false; nothing has been implemented
against this item, so `[~]` (in progress) would be false too. The PRD legend has no shape for
_"one arm unblocked but unstarted"_, and rather than round the checkbox up, the split is stated
here and in the heading:

- **(a) DECKLINK — UNBLOCKED, NOT DELIVERED.** The card is present and BOTH producer spellings are
  proven at the AMCP level (2026-08-24 index, 2026-08-25 persistent ID). What this item still owes
  for (a) is the acceptance bullet's own subject: a Live Source mapped to that producer, playing
  **behind the hole** with its `MIXER FILL` + `CLIP` geometry correct, seen on air. An
  `Initialized` on layer 10 is not that.
  ⚠ **And a new obstacle sits in front of it: [[B-177]].** One physical input admits ONE producer,
  and `CLEAR` answers `202` before the old one is destroyed — so the seating path's own
  `CLEAR`-then-`PLAY` can lose that race on this hardware. Arm (a)'s on-air pass will meet it.
- **(b) NDI — STILL BLOCKED.** No NDI source exists on this plant and the module is gated. Neither
  the 2026-08-24 nor the 2026-08-25 run touched this.
- **(c) fill+key — PARKED, NOT MERELY BLOCKED. Q4 answered NO.** The 2026-08-25 startup
  enumeration lists **exactly one device** (`DeckLink SDI 4K [1] (23487013)`) and a DeckLink SDI 4K
  is a **single-channel card**: there is no second SDI input for a pair. So this arm is not waiting
  on a measurement any more — **it is unverifiable on this plant**, and it stays that way until the
  hardware changes. It is NOT cancelled: the concept is real, the schema carries it, and a plant
  with two inputs would make it live again. The SEATING code it would verify is [[C-027]], parked
  for the same reason.
  ⚠ **Do not read this as "fill+key was rejected".** Nothing about it was judged; a measurement
  came back and the hardware cannot host the test. **[[C-021]]'s `MIXER CHROMA` alternative below
  becomes materially more interesting because of this**, and is still unevaluated.

**What the walk did NOT settle for this item:** arm (b) entirely, and arm (a)'s on-air pass.

**Ordering:** this item is downstream of [[C-015]]'s phases 1–6 (`live-source-multibox`
`tasks.md` §10, phase 7) and does not block any of them; arm (c)'s unblocking rides [[C-020]]'s
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

## [ ] C-022 — the installation's NAMED live source list, served READ-ONLY over the bridge's HTTP server ⟨priority: medium⟩ — depends on [[C-015]] phase 4

**What:** the bridge exposes the installation's live source list as a **read-only HTTP endpoint** on
the server it already runs (`tools/caspar-bridge/src/template-http-server.ts`), so the **CIAB
client** — the plant's playout application, a modified CasparCG Client — can list the defined lives
and add them to its own rundown.

**Why:** this is not a new idea, it is a role the previous automation already had. Recorded by the
owner 2026-08-10: in the system this project replaces, each live was **created in CG Control** (type,
master, slave, format), saved as a **preset in a DATABASE**, and the **playout application read that
list** into its rundown. [[C-015]] phase 4's source CATALOG
(`~/.cg-runtime/bridge-source-catalog.json`) IS the successor to that database table — so it gains a
**SECOND CONSUMER**, and that consumer needs a way in.

⭐ **UPDATED 2026-08-10 by C-015's reshape, and it is strictly better for playout.** The catalog is
now a list of NAMED lives the installation defines for itself, rather than a set of ids invented by
whichever template happened to be authored first. A rundown wants names; that is exactly what this
now serves. The per-template, per-plate ASSIGNMENTS are a SEPARATE store and are **NOT** part of this
endpoint: playout does not run this product's templates, and serving them would hand a consumer a
shape it has no use for.

Playout is a **separate application and may be on a separate machine**. Having it open the JSON by
path couples it to this machine's filesystem layout and gives it no stable shape to read: the file's
on-disk form is a store's private business and changes when the store changes. **The file stays the
source of truth; the endpoint is a VIEW.**

**Acceptance:**

- WHEN the endpoint is defined THEN its response shape is **DERIVED from `SourceCatalogSchema`**,
  never hand-written — two spellings of one contract is how they drift, and this drift would be
  invisible until a playout client showed the wrong source list
- WHEN any client calls it THEN it is **READ-ONLY**: there is no write path, and the operator's CG
  Control settings surface remains the only writer
- WHEN the catalog is ABSENT THEN the endpoint answers **"no sources"**, not an error — matching
  phase 4's absent-file rule exactly (absent ⇒ NO SOURCES, fail-closed at take time, not a boot or
  request failure)
- WHEN a playout client calls an OLDER bridge THEN it can tell: the endpoint is **versioned or
  shape-marked**, so a client can distinguish "this bridge does not have the feature" from "this
  installation has no sources". This is [[R-036]]'s concern (a version/shape marker on the persisted
  bridge configs) on a **second surface** — cross-referenced deliberately, because the same silent
  ambiguity is what it exists to prevent
- WHEN the endpoint serves an entry THEN it carries the fields a rundown needs — the id, the
  operator-facing NAME, and the format — and never invents any the catalog does not hold
- WHEN the endpoint is defined THEN it serves the CATALOG ALONE: the per-template plate assignments
  are a separate store and no part of this view

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

⚠ **NOT a duplicate of [[R-049]], and neither makes the other unnecessary.** R-049 draws a labelled
placeholder over each rehearse plate, naming the plate and its assigned source. **This item answers
"IS THE PICTURE GOOD"; R-049 answers "WHICH SOURCE IS WHERE."** They are related and they cost
completely different things: R-049 needs no frame grabs, no consumer-less channel and no [[C-016]] —
it reads the assignment the Runtime already holds — while this item needs all three. A thumbnail that
does not say which plate it belongs to, and a plate label that does not say whether the feed arrived,
are each half an answer.

## [~] C-024 — the bridge advertises a HARDCODED LAN address, and only an uncommitted hack makes testing possible ⟨priority: high⟩ — the CURE that [[P-035]] merely NETS — **CLI half LANDED 2026-08-23 by [[B-162]]; PERSISTED + PANEL half LANDED 2026-08-24 (`serve-host-from-app`); HACK DELETED + never-stage entry DROPPED + warning sentence completed 2026-09-04 (`LAN-DEV-ACCESS-01`) — every Acceptance bullet now met; awaiting archive of `serve-host-from-app`**

⭐ **STATUS UPDATE 2026-09-04 — THE HACK IS GONE, AND THE NET WITH IT (`LAN-DEV-ACCESS-01`).**
The prompt that authorised acting on the uncommitted edit first IDENTIFIED it: `git diff` showed
ONE added line in `guessLanHost()`, `// return '192.168.21.93';` — the pin already commented out
by the owner, not a live return. The committed tree had carried no live pin since `56c0799f`.
So it was one artifact, not two, and the three named pieces went in ONE commit as the standing
instruction required: the comment line deleted (the file now matches `d6b6a952`'s version byte
for byte except for the sentence below), the `tools/caspar-bridge/src/template-http-server.ts`
entry dropped from `.claude/never-stage` (the list is now EMPTY and says why; the guard stays
wired, and `never-stage-decision.test.ts` now asserts the entry is ABSENT rather than present),
and `templateServeUnreachableWarning` now ends by naming BOTH fixes — the flag and the Runtime's
Server settings panel. `serve-host-config.ts`'s header no longer claims the file is off-limits.
⚠ `tools/caspar-amcp-probe/bin/beacon-probe-lib.mjs:49` still carries `DEFAULT_LAN_HOST =
'192.168.21.93'` as a throwaway harness default — recorded under [[P-041]], not edited (outside
that prompt's boundary).

⭐ **STATUS UPDATE 2026-08-23 — `--template-serve-host` EXISTS.** [[B-162]] needed the same seam
(its §1c) and wired it: `bin/caspar-bridge.mjs` now passes `templateServe` to `createBridge`, so
`--template-serve-host` and `--template-serve-port` set `TemplateServeOverride` from the command
line, a flag given without a value is a hard boot error (the `--reserved-layers` doctrine), and the
boot line names the advertised host **and where it came from**. Four of the five Acceptance bullets
below are therefore met. **What is NOT met, and why this stays `[~]`:**

- ~~**No persisted-file layer.**~~ ✅ **CLOSED 2026-08-24** — see the status update below.
- ~~**The hack is still in the owner's working tree** and `.claude/never-stage` still lists
  `template-http-server.ts`.~~ ✅ **CLOSED 2026-09-04** — see the status update above. It could be
  dropped in favour of `--template-serve-host 192.168.21.93`, but that was the owner's action on
  their own machine, not something a commit could perform — so the entry stayed until a prompt
  authorised it, because removing the net while the hack is still present is strictly worse than
  leaving it.

⭐ **STATUS UPDATE 2026-08-24 — THE MIDDLE LAYER AND THE PANEL EXIST (`serve-host-from-app`).** The
precedence is now the full three every other bridge store has — **explicit flag > persisted
connection config > built-in derivation** — resolved in ONE place
(`tools/caspar-bridge/src/serve-host-config.ts`, called from construction and from `#applyConfig`)
rather than at each derivation point.

- **The store is the CONNECTION config, not a file of its own.** `ConnectionConfig` gained
  `templateServeHost` / `templateServePort`, so the address is persisted by the same
  `~/.cg-runtime/bridge-connection.json` that already names the servers it is a fact ABOUT. A
  separate `bridge-template-serve.json` was considered and rejected: it would have been a second
  file to keep in step with the one it depends on.
- **The panel is the surface**, beside the server hosts rather than in a section of its own, and
  Apply puts the value in force on the RUNNING bridge through `connections.set-config` (which
  already tore down and rebuilt template serving). 🔴 **Nothing starts, stops or restarts the
  bridge, by explicit instruction** — its lifetime stays outside the console.
- **A flag still WINS, and the panel SAYS SO on the field it masks** — naming the flag, showing the
  value in effect, striking the stored one through and labelling it _not in force_, while keeping
  the control editable and never grey (grey reads as disabled, and the stored value is exactly what
  takes over at the next boot without the flag).
- **The detected interfaces are offered as CANDIDATES**, stated as candidates and not a verdict.
  That wording is load-bearing: picking the wrong interface is precisely `guessLanHost()`'s
  failure, and a list presented as an answer would reproduce it with more confidence.

~~⚠ **THE `never-stage` ENTRY CANNOT BE DROPPED YET, and the reason is not the panel.**~~ ✅
**DROPPED 2026-09-04, in the same commit that deleted the hack — exactly as the paragraph below
required.** Kept as written for the record. The entry
exists because the HACK exists in the owner's working tree, where `git add <directory>` can sweep it
up (that is how `dev` briefly carried the hardcoded IP on 2026-08-17). This change removes the
REASON for the hack — the address is now configurable and persisted, so the early
`return '192.168.21.93';` buys nothing the panel does not — but it cannot remove the hack itself,
which is uncommitted and the owner's to delete by hand. **Drop the `never-stage` line in the same
commit that removes the hack, never before**: removing the net while the hack is still present is
strictly worse than leaving it, and that is the whole distinction [[P-035]] records.

~~⚠ **One sentence is still flag-only, and it is in the file this change may not touch.**~~ ✅
**COMPLETED 2026-09-04.** `templateServeUnreachableWarning` (`template-http-server.ts:147`) used to
end _"Set --template-serve-host …"_, with no mention of the panel — correct but incomplete advice,
left for the commit that removed the hack because the file was the `never-stage` one. That commit
landed, and the sentence now names the flag AND the Runtime's Server settings panel; the boot
line and the panel's own message already did.

Read the original item below unchanged; it is still the specification of the remaining half.

**What:** the template HTTP server's advertised host must be resolvable from CONFIGURATION, with a
documented default — so that no machine-specific address appears in the source and the owner no
longer needs an uncommitted local edit to test against the plant.

**Why:** `guessLanHost()` (`tools/caspar-bridge/src/template-http-server.ts`) picks the first
non-internal IPv4 it finds, and on the owner's machine that is not the interface the plant can reach.
The working fix has therefore been an uncommitted early `return '192.168.21.93';` at the top of the
function. **It must not survive to a release: every install would advertise ONE machine's address,
so the `CG ADD` URL would be wrong everywhere except that box** — and the failure is a template that
never loads, on air, with CasparCG reporting nothing wrong.

🔴 **It has already cost two incidents IN ONE DAY (2026-08-17), and they are different failures:**

1. **It blocked a push** — `pnpm gate`'s `format:check` failed on a file the session had not
   touched, so a green gate could not be reported at all (recorded in
   `docs/handoff/2026-08-17-session-aq.md`, "The gate").
2. **It reached `dev`** — a `git add tools/caspar-bridge`, staging a DIRECTORY to pick up bridge
   work, swept the hack along with it. `dev` briefly carried the hardcoded IP; caught in
   post-push verification and corrected in `56c0799f`, at the cost of a second push on a day the
   owner was near their CI minute limit.

⚠ **[[P-035]] is a NET, not the cure — and the distinction is the whole reason this item exists.**
The never-stage guard stops the hack REACHING `dev`; it does nothing about the hack having to exist.
Every day the seam is missing is another day of an uncommitted edit in a permanently-dirty checkout,
which is a hazard P-035 can only ever catch, never remove. **P-035's own notes say this in as many
words and flag that the refactor has no ID** — this item is that ID, and the cross-reference runs
both ways.

**The seam ALREADY EXISTS in the library, and that is why this is small:**
`deriveServeOptions(casparHosts, override)` (a LIST since [[B-162]]) already honours `override.serveHost`
(`template-http-server.ts`), and `BridgeOptions.templateServe` already carries a
`TemplateServeOverride`. **What is missing is a CLI flag that sets it** — `bin/caspar-bridge.mjs`
passes no `templateServe` at all, so the ONLY way to change the advertised host today is to edit the
source. The hack is not a workaround for a hard problem; it is a workaround for an unwired flag.

**Acceptance:**

- WHEN the bridge starts THEN the advertised host is resolved from CONFIGURATION — a CLI flag, with
  the same explicit-flag > persisted-file > derived-default precedence every other bridge store uses
- WHEN no configuration is supplied THEN the DOCUMENTED default applies (today's derivation:
  loopback for a local CasparCG, an auto-detected LAN IPv4 for a remote one) and the boot line SAYS
  which host it is advertising and WHERE that came from — the same provenance rule the fixed bank
  and the source catalog already follow, because a value alone cannot answer "why this one?"
- WHEN the source is searched for a machine-specific address THEN there is none
- WHEN the owner tests against the plant THEN no uncommitted edit is required, and
  `.claude/never-stage` can drop its `template-http-server.ts` entry
- WHEN the advertised host is wrong for the plant THEN the failure is DIAGNOSABLE from the bridge's
  own output rather than from a template that silently never loads

**Notes:**

- ⚠ **Do NOT resolve this by "improving" `guessLanHost()`'s heuristic.** A better guess is still a
  guess, and the failure it produces — a served URL the plant cannot fetch — is silent on the
  CasparCG side. The point of the item is that the operator can SAY the answer; the derivation stays
  as the default for the ordinary case.
- **Where the flag's shape comes from:** `--audit-log-path`, `--source-assignments-path` and
  `--reserved-layers` are the precedent. This item follows it rather than inventing a convention.
- 🔴 **The prompt that filed this pointed at `cg_session_handoff.md` for existing design work; NO
  file of that name exists in the repo** (searched at the repo root, the parent directory and across
  the tracked tree). The design context that DOES exist is
  `docs/handoff/2026-08-17-session-aq.md` (the hack's effect on the gate) and [[P-035]]'s notes
  (its two incidents, and the "net, not cure" framing). Recorded rather than quietly substituted, in
  case the owner is holding a file the repo has never seen.
- **FILED ONLY — no implementation.** The number was verified free by a heading sweep immediately
  before this heading was written (highest `C-` heading was `C-023`; `git grep -n "C-024"` returned
  no occurrence anywhere in the tree).
- **Cross-refs:** [[P-035]] (the net this is the cure for), [[B-038]] (the template HTTP server this
  advertises for), [[C-001]] (the bridge whose probe `guessLanHost()` mirrors).

## [x] C-025 — a `stream` producer arm: the catalog can SAY a live is a URL ⟨priority: high⟩ — ⭐ CLIENT REQUIREMENT; the owner proved the command on the plant by hand — DONE + archived: `openspec/changes/archive/2026-08-22-stream-producer-arm/`; e2e discharged by https://github.com/yasermostafaee/cg/actions/runs/32575013749 (the `E2E (Playwright)` job RAN and passed on `fef781cb`)

**What:** a FIFTH arm in `SourceProducerSchema` — `{ kind: 'stream', url }` — so an internet stream
is a first-class live source: labelled as a stream in the Runtime's Sources modal, refused at the
config boundary when its URL's scheme is outside the client's allowlist, and emitted by the bridge
as `PLAY <ch>-<layer> "<url>"` — the command the owner proved by hand on the plant.

**Why — the finding, and its exact shape: THE GAP IS EXPRESSION, NOT CAPABILITY.** The mechanism
already works end to end, unlabelled. The `media` arm is `file: z.string().min(1)`;
`producerArgument` (`tools/caspar-bridge/src/command-builder.ts`) emits `quote(producer.file)`; and
`quote()` (`packages/caspar-client/src/amcp/escape.ts`) is the IDENTITY for every character except
`\`, `"`, LF and CR — none of which appear in a URL. So typing a URL into today's "Media file"
field already produces exactly the command the owner proved. There is NO PLANT RISK in the
mechanism — which is why the real work of this item is labelling, validation and refusal, not wire
plumbing:

1. **The label lies.** `SourcesModal.tsx`'s `PRODUCER_KINDS` and `KIND_LABEL` are hand-written
   four-entry consts (`route` / `decklink` / `ndi` / `media`); the field reads "Media file"; the
   placeholder is `AMB`. Nobody discovers the workaround, and a second operator reading the config
   cannot tell a clip from a feed — a distinction that matters exactly when the feed drops.
2. **Nothing validates the URL.** `SOURCES_SET_CONFIG_REASONS` carries `duplicate-id`,
   `duplicate-name`, `overlaps-fixed-bank`, `overlaps-reserved` — nothing about a URL. A mistyped
   URL is therefore refused BY CASPARCG, AT TAKE, ON AIR — the exact failure
   `SourceProducerSchema`'s own docstring says the union exists to prevent: _"an unreachable
   producer form is a parse error at the boundary rather than an AMCP `400` at take time."_

**Already sound — recorded so nobody proposes the work:**

- `producerArgument` is an EXHAUSTIVE no-default switch with a declared `: string` return, so a new
  `kind` fails COMPILATION until every site handles it (session BS §3 audited exactly this and
  called it sound by construction — `docs/handoff/2026-08-22-session-bs.md`). Adding the arm is
  compiler-guided, not a grep.
- `sourceArgument()` exists so the ledger records _"the concrete producer argument actually SENT"_
  by asking the same function `playSource` asks; and the ledger's `producer: z.string()`
  (`tools/caspar-bridge/src/live-layers.ts`) is a ledger record, not a catalog schema — both carry
  a URL with no change. Verified against source at filing.

**The three decisions — TAKEN BY THE OWNER; do not re-open them:**

1. **A NEW `stream` arm, NOT an extension of `media`.** `media`'s own docstring is _"the one
   producer that needs no signal"_, and a stream is its opposite — it needs a signal and can drop.
   One arm covering both would leave the schema unable to say which failure modes a source even
   has.
2. **A SCHEME ALLOWLIST, and it is the CLIENT'S OWN REQUIREMENT.** Exactly these nine: `http`
   `https` `rtmp` `rtmps` `rtsp` `srt` `udp` `rtp` `mms`. A URL whose scheme is outside the set is
   REFUSED at the config boundary, with its own new refusal code added to
   `SOURCES_SET_CONFIG_REASONS`. 🔴 **How the arm's docstring must frame the list — load-bearing:**
   it states WHAT THE CLIENT REQUIRES THE PRODUCT TO ACCEPT. It must NOT be written as a claim
   about what CasparCG or its linked ffmpeg supports — no source of truth for that is available,
   and a hand-written list posing as one is precisely the guard failure session BS spent a session
   auditing and repairing. Write the honest sentence.
3. **v1 SCOPE = "type a URL and it plays."** Reconnect, stall detection and stream health are OUT
   OF SCOPE — named here so their absence reads as a decision, not an oversight. The known limit
   that goes with them: a stream can be ALIVE-BUT-STALLED, and nothing in the bridge models that
   today — every existing arm either works or the link to CasparCG is down (the [[B-086]] model).

**A consequence, not a task:** a stream usually states no `format`, so `sourceAspect()` falls
through to the explicit `aspect` and then to `null` — the same branch `AUTO` lands on. v1 adds NO
required aspect field.

**Acceptance:**

- WHEN the operator defines a source of kind `stream` with a URL whose scheme is one of the nine
  THEN the catalog accepts it, and the Sources modal labels the kind as a stream with a URL field —
  never "Media file" / `AMB`
- WHEN a catalog is set containing a `stream` URL whose scheme is outside the nine THEN
  `sources.set-config` refuses it at the boundary with the new refusal code, naming the offending
  scheme, and nothing is persisted or reaches the wire
- WHEN a plate assigned to a `stream` source is taken THEN the bridge emits
  `PLAY <ch>-<layer> "<url>"` — built by `producerArgument`'s new arm through `quote()` exactly
  once, per the command-builder's contract
- WHEN a `stream` producer is seated THEN the ledger's `producer` field records the concrete URL
  argument as sent, via `sourceArgument` — asserted for the new arm, not assumed from the old ones
- WHEN the shared validator refuses a scheme THEN the mock refuses IDENTICALLY — the allowlist
  lives beside `SOURCES_SET_CONFIG_REASONS` in `@cg/shared-ipc`'s shared validator
  (`validateSourceCatalog`), one implementation for bridge and mock, per that function's own rule
- WHEN a `stream` source states no `format` THEN fit falls through to the explicit `aspect` and
  then to `null`, and no new required field exists

**Explicitly OUT of scope (decision 3):** reconnect, stall detection, stream health or any
modelling of alive-but-stalled; any required aspect field; DECKLINK/NDI/fill+key hardware
validation ([[C-021]]'s, unchanged).

**Notes:**

- Filed in `caspar.md` by the nearest-sibling rule: [[C-021]] is an item entirely about producer
  ARMS of this same union, and [[C-015]] built the union, the catalog and the Sources modal's
  producer editor under a `C-` number. The Runtime modal work here is the thin surface half of the
  same one change, so no twin item is filed in `runtime.md`.
- Unlike [[C-021]]'s arms, this one is VALIDATABLE ON THIS PLANT — the owner already validated the
  command by hand; the item is not hardware-blocked.
- [[C-022]]'s read-only catalog endpoint serves id / name / format and needs no change for a new
  producer kind.
- **FILED ONLY — no implementation.** The number was verified free by the heading sweep
  immediately before this heading was written (highest `C-` heading was `C-024`;
  `git grep -n "C-025"` returned only "next free" pointers, none a heading) — recorded in
  [b-number-registry.md](b-number-registry.md).
- **Cross-refs:** [[C-015]] (the union and catalog), [[C-021]] (the sibling arms), [[B-086]] (the
  works-or-link-down model the stalled limit is stated against).

## [~] C-026 — multi-box audio: per-box control now, monitor / master / VU metering after the plant is measured ⟨priority: high⟩ — in progress: `openspec/changes/add-multibox-audio/`

**What:** Make a multi-box graphic's audio CONTROLLABLE and VISIBLE per box. Four operator verbs
— fader, ON/OFF, SOLO and PANIC ("silence all boxes") — all expressed as writes to ONE map of
plate volumes, shown on a strip beside every seated plate rather than behind a dialog. And, gated
on a plant measurement, three things this installation has never been able to answer: a MONITOR /
PFL channel, per-box audio for a `<video>` inside the template, and a VU meter per input.

**Why:** Audio is the one property of a graphic an operator cannot see. `plateVolumes` has been
published on the wire since C-015 phase 6 and the ONLY surface that read it was a modal opened
from one row's action menu — so the console's answer to _"is this guest audible?"_ was **open a
dialog and look**, one row at a time. The two gestures a director asks for by name under
pressure — "just this one" and "silence everything" — did not exist at all.

**Acceptance:**

- WHEN the operator applies a MAP of plate volumes for a row THEN it reaches the bridge as ONE
  call, holding that row's live-seat lock, and reports a PER-PLATE outcome so a partial failure
  names the guest who did not move
- WHEN any audio verb is used on a row that does not own live seats THEN the intent is recorded
  and NOTHING is sent — no `PLAY`, no `MIXER VOLUME`, no fill, no un-hold (golden rule 10)
- WHEN any audio verb touches a HELD plate THEN its intent is recorded and no wire command is
  sent, and the surface reads "armed, not audible — hidden by this look" without greying it
- WHEN SOLO is pressed THEN exactly one `MIXER … VOLUME 1` and N−1 `… VOLUME 0` reach the wire,
  the same values land in `plateVolumes`, and nothing offers to restore the previous levels
- WHEN OFF then ON is pressed THEN the plate returns to 100 %, NOT to its previous fader value,
  and the surface says so in words
- WHEN PANIC is pressed THEN every plate of every ON-AIR row is set to 0 and the console reports
  how many plates it silenced; an empty scope reports that nothing was on air rather than success
- WHEN the LIVE SOURCES tab is open THEN every seated plate shows a state pill, a fader, ON/OFF,
  SOLO and a % readout without any dialog being opened, and the layer row carries a compact
  READ-ONLY summary outside its six-column verb block
- WHEN any of this is rendered THEN no indicator is a bar, a needle or a meter — an INTENT pill
  and a LEVEL meter are different claims and only the first is knowable today

**Notes:**

- **SHIPPED half rests on `MIXER … VOLUME`, already proven on this plant.** No new AMCP verb, no
  new CasparCG channel, no new resolution level, no meter.
- **GATED half is spec-only until `docs/recon/2026-08-23-audio-paths-walk.md` is run** on the
  production 2.5.0 (`69e8ad5`) — W1/W2/W5/W6 for the monitor channel, W3 for template-internal
  box audio, W4 for `MASTERVOLUME`, W7/W8 for metering. **W8 is load-bearing:** if a monitor
  channel's peak does not track its one routed input, per-input VU for Live Source plates does
  not exist at any price and only the in-template `AnalyserNode` path survives.
- 🔴 **The metering ceiling is MEASURED, not assumed.** `audio_mixer.cpp` publishes
  `state_["volume"]` as peaks **per AUDIO channel (L/R), maximum across ALL mixed layers** —
  there is no per-layer variant, and 2.3 removed the older `…/audio/{n}/dBFS` addresses. A
  per-input meter therefore cannot come from the programme channel's OSC.
- **The MON channel array IS the metering array** — specified as one feature so an installation
  is never asked to provision one set of channels for monitoring and another for metering.
- **Per-plate, not per-look** (recorded so it is not re-litigated): plate resolution is already
  four levels deep and audio does not need a fifth. A held plate is already silenced by the hold.
- Filed in `caspar.md` by the nearest-sibling rule: it is about what AMCP verbs and CasparCG
  channels this plant has, which is [[C-015]] / [[C-021]]'s territory. The Runtime surface is the
  thin half of the same one change, so no twin item is filed in `runtime.md`.
- The number was verified free by the heading sweep immediately before this heading was written
  (highest `C-` heading was `C-025`; `git grep -n "C-026"` returned only the registry's own "next
  free" pointer, not a heading) — recorded in [b-number-registry.md](b-number-registry.md).
- **Cross-refs:** [[C-015]] (the plate model, the mute-on-create rule and `plateVolumes`),
  [[C-019]] (audio authored INSIDE a template — the asset/packaging half, a different item from
  this one's per-box GAIN), [[C-018]] / [[C-020]] (the 2.5.0 cutover the monitor channel assumes),
  [[B-161]] (golden rule 10, the gate every verb here satisfies first).

## [!] C-027 — fill/key SEATING for a `decklink` source: the modal stores a key device that nothing sends ⟨priority: medium⟩ — **PARKED 2026-08-25: this card has NO second SDI input, so the work is UNVERIFIABLE on this plant** ([../recon/2026-08-25-decklink-model-walk.md](../recon/2026-08-25-decklink-model-walk.md) Q4)

**What:** actually SEAT a fill/key pair when a `decklink` source's mapping names one. Today
`SourceProducerSchema`'s `decklink` arm carries an optional `keyDevice`, CG Control's Sources modal
offers a **Key device (optional)** field and persists it, and `producerArgument`
(`command-builder.ts`) emits `DECKLINK DEVICE <device>` and nothing else — so the value is stored,
round-trips the bridge, and **never reaches the wire**. This item is the code that makes it mean
something: the second `PLAY`, the layer it lands on, the `MIXER` geometry it shares with its fill,
and what the ledger's existing `role: 'fill' | 'key'` records for the pair.

**Why:** a fill/key pair is a real concept carried over from the plant's previous automation
(MASTER + SLAVE on one entry), and the schema was deliberately shaped for it. What was missing is
the seating, and the gap was **invisible to the operator**: the modal's summary line used to read
`DECKLINK DEVICE 1 + KEY 2`, describing a wire the system does not send. That surface half is FIXED
(2026-08-25, `DECKLINK-MODEL-01`): the summary now describes the fill alone and a stored `keyDevice`
is reported in the modal as _"stored but not yet sent to CasparCG"_. **The honesty is shipped; the
capability is this item.** The surface half's Linux `e2e` debt is DISCHARGED by
https://github.com/yasermostafaee/cg/actions/runs/32840461445 — the `E2E (Playwright)` job **RAN**
(not skipped) and passed on `a1b5f5d5`, the commit that carries the change. It is filed rather than folded into [[C-021]] because it is CODE to be
written, while C-021 arm (c) is the hardware pass that would VERIFY it — and neither can be the
other's acceptance.

**Acceptance:**

- WHEN a `decklink` mapping names both `device` and `keyDevice` THEN **two** producers are seated —
  the fill and the key — at layers derived from the declared Live Source band, and the ledger
  records the pair with `role: 'fill'` and `role: 'key'` respectively
- WHEN the pair is seated THEN both layers receive the **same** `MIXER FILL` + `CLIP` geometry from
  **one** computation (golden rule 7's shape: one geometry, emitted once, never two call sites that
  must agree)
- WHEN **half** the pair fails to seat THEN the outcome is DECIDED and stated — not left to
  whichever `PLAY` returned first. A key on air without its fill, or a fill without its key, is a
  wrong picture rather than a missing one, so the decision must be recorded here before it is coded
- WHEN the pair is released THEN **both** layers are cleared and both ledger records removed — a
  half-released pair leaves a live producer nothing owns
- WHEN a `decklink` mapping names NO `keyDevice` THEN the behaviour is **byte-identical to today's**
  — one `PLAY`, one ledger record, `role: 'fill'`. This is the regression bullet and it is not
  optional
- WHEN the pair is verified on hardware THEN alpha is confirmed **by looking at the switcher**,
  never inferred from the format's specification ([[B-066]] class: verify, never assume) — that pass
  is [[C-021]] arm (c)'s, and this item hands it something to look at

🔴 **PARKED 2026-08-25 — Q4 came back NO, and this item's own Notes said what to do in that case.**

The startup enumeration on the production 2.5.0, same day, lists **exactly one device**:

```
Decklink devices found:
 - DeckLink SDI 4K [1] (23487013)
```

A **DeckLink SDI 4K is a single-channel card**. There is no second SDI input, so a fill/key pair
cannot exist on this plant — and two-layer seating whose second layer can never carry a real signal
is **a mechanism nobody can check**. Building it would produce code that passes its own tests and
has never met a signal.

⚠ **DISCLOSED: the `PLAY 1-11 DECKLINK DEVICE 2` probe never executed.** The plant console
concatenated the pasted lines into `CLEAR 1-10PLAY 1-11 DECKLINK DEVICE 2` and ran only the
`CLEAR`. **Do not cite a `DEVICE 2` failure — there isn't one.** The enumeration is the evidence
this park rests on, and it is same-day and same-boot: a device the server did not enumerate is not
a device a `PLAY` could have opened.

**What PARKED means here, precisely:**

- **NOT cancelled and NOT wrong.** The concept is real (the plant's previous automation ran
  MASTER + SLAVE on one entry), the schema carries it, the acceptance bullets above stand as
  written. A plant with two inputs makes this item live again with no rework of its scope.
- **NOT started, and must not be.** Nothing here may be built "ready for later" — see the harm
  above.
- **Unparks on hardware, not on a decision.** The trigger is a second SDI input existing: a
  different card, a second card, or a different plant. `INFO CONFIG`-style enumeration will not
  produce one (Q2 — nothing enumerates devices at all), so the signal is physical.
- ⚠ **The `keyDevice` field, the schema arm and the modal's honesty notice are UNCHANGED.** An
  operator may already have configured a pair; the field keeps it, and the modal already says in
  plain words that it is stored and not sent. Parking the seating does not park the honesty.

⭐ **This raises the stakes on [[C-021]]'s `MIXER CHROMA` alternative**, which needs neither a
fill/key path nor a second input. It remains unevaluated, and it is now the only route to a
transparent live plate that this hardware could actually carry.

**Notes — the original block, why `[!]`, and what blocked it.** A fill/key pair is **two physical
SDI inputs**. The plant's card is a **DeckLink SDI 4K** (index `1`, persistent ID `23487013`,
measured 2026-08-24), and whether it exposes a **second** input for the pair at all was **not
known** — question **Q4** of
[../recon/2026-08-25-decklink-model-walk.md](../recon/2026-08-25-decklink-model-walk.md), one look
at the back of the box. _"If the answer is no, this item does not become wrong, it becomes
**unverifiable on this plant** and should be re-scoped or parked rather than built blind."_ **The
answer was no, and that instruction is what the block above carries out.**

**Deliberately NOT in scope:** removing the `keyDevice` field or refusing it at the config boundary.
The operator may already have written a pair, and dropping the field would lose that configuration.
The field stays, the schema stays, and the modal says plainly what does and does not reach the wire.

- The number was verified free by the heading sweep immediately before this heading was written:
  the highest `C-` heading was `C-026` (`git grep -hoE "^## \[.\] C-[0-9]{3}" -- 'docs/prd/*.md'
':!docs/prd/README.md'` sorted on the NUMBER), the `C-` duplicate audit printed nothing, and
  `git grep -n "C-027"` returned exactly ONE hit — [b-number-registry.md](b-number-registry.md)'s
  own "next free" line, a forward-reference POINTER rather than a heading. `C-028` returned nothing
  at all. Recorded in [b-number-registry.md](b-number-registry.md).
- **Cross-refs:** [[C-021]] (arm (c) — the hardware pass this item feeds), [[C-015]] (the Live
  Source model, the mapping store and the ledger this seats into), [[C-020]] (the air path fill+key
  ultimately reaches).

## [x] C-028 — live-plate FIT MODE: `contain` by default, so the picture is never cut and the margin shows the TEMPLATE, never black ⟨priority: high⟩ — the client's 2026-08-23 decision; premise MEASURED 2026-08-25; **CONFIRMED ON AIR by the owner 2026-08-25**; archived `openspec/changes/archive/2026-08-26-live-plate-fit-mode/`

### ⭐ CLOSED — the owner's on-air confirmation, 2026-08-25, in THREE parts

All three are recorded because **the third is the client's actual acceptance criterion and the first
two do not imply it.** A picture can be correctly fitted and still put black in the margin — that is
precisely the failure `B-149`'s coupling produces — so "the crop is right" and "the margin is right"
are two observations, not one.

1. a **`cover`** plate rendered **the middle of the picture, cropped left and right, at full height** —
   roughly the middle half of the frame for a `938.4 × 1049.04` box on a 16:9 source;
2. a **`contain`** plate rendered **the whole picture**, uncropped;
3. 🔴 with a template that paints a visible background, the `contain` **margin showed the TEMPLATE'S
   BACKGROUND, not black** — the client's requirement of 2026-08-23 verbatim (_"the leftover margin
   shows the template's own background, never black"_), and the whole reason the mask hole had to
   shrink to the FITTED rect rather than stay at the box.

**Linux `gate:e2e` discharged** — <https://github.com/yasermostafaee/cg/actions/runs/32870092879>
(commit `6b343333`, `E2E (Playwright)` RAN 8m52s, `success`) for the `C-028` work, and
<https://github.com/yasermostafaee/cg/actions/runs/32889767678> (commit `45291fc8`, RAN 8m36s,
`success`) for [[B-178]]'s correction to it.

⚠ **This closes `C-028` ONLY.** [[B-178]] (the fit control was inert under a look group) is `[~]`
FIXED; [[B-179]] (`expectedAspect` dropped the same way, disarming the mismatch refusal) is **`[ ]`
OPEN** and is not closed by this archive.

**What:** a live plate's picture is fitted into its box by a **selectable mode**:

- **`contain`** — the NEW DEFAULT. The whole picture, its own aspect intact, centred on both axes.
  Nothing is cropped; the leftover margin on the short axis shows **the template's own background**.
- **`cover`** — today's behaviour, kept: scale to cover the box and centre-crop the overflow.

🔴 **ONE function computes the fitted rect, and BOTH consumers read it** — the bridge's
`MIXER FILL` + `MIXER CLIP` **and** the template's mask-hole rect. Not two implementations that
must agree; golden rule 7's shape, for the same reason `mixerFit` already emits `FILL` and `CLIP`
as one pair from one computation.

**Why:** the **client's decision, 2026-08-23, relayed by the owner** — the picture must not be cut,
and the leftover margin must show **the template's own background, never black**. The owner
accepted the consequence in advance: a stroke or frame authored tight around a box **will no longer
hug the picture** when the source aspect differs from the box, because the picture is then smaller
than the box on one axis. That is a trade the client made, not a defect to be engineered away.

### 🔴 The measured premise — CasparCG STRETCHES; there is no double-count

Measured on the plant 2026-08-25, production 2.5.0 `69e8ad5`
([../recon/2026-08-25-decklink-model-walk.md](../recon/2026-08-25-decklink-model-walk.md) **Q3**).
A `1080i5000` (16:9) input into a channel set to `SET 1 MODE PAL` (720×576, 4:3), with
`MIXER 1-10 FILL 0.25 0.25 0.5 0.5`:

```
picture rect as a fraction of the channel frame
   x  0.2500 .. 0.7500      width  0.5000
   y  0.2497 .. 0.7503      height 0.5006
MIXER FILL 0.25 0.25 0.5 0.5 expects exactly 0.2500..0.7500 on both axes
```

The picture filled the `FILL` box **edge to edge on both axes**. Had the producer letterboxed
first, it would have occupied 405/576 = **70.31 %** of the box height — **291 px** against a
measured **415 px**. The two hypotheses are 124 px apart; this is not a close call. A red probe
layer beneath showed in the margin OUTSIDE the box, confirming the plate does not paint outside its
own rect.

⇒ **CasparCG applies NO aspect correction of its own.** The source-aspect correction in
`MIXER FILL` is therefore **REQUIRED**, and computing the fitted rect from the source aspect does
**NOT** double-count. This was the blocking unknown; it is now a measurement.

### 🔴 The MASK-HOLE consequence — the half that reaches air

The hole is a **CSS luminance mask** on the backdrop: `MaskHole[]` + `liveSourceMask`
(`packages/shared-schema/src/scene.ts`), built by `sceneMaskHoles`
(`packages/shared-schema/src/scene-flatten.ts`) and applied by
`packages/template-runtime/src/live-source-punch.ts`.

**If the hole stays at the BOX rect while the picture covers only part of it under `contain`, the
margin is a TRANSPARENT HOLE with no picture behind it — and what shows through is the channel
behind the CG layer: BLACK. Exactly what the client rejected.** The feature would deliver the
opposite of its own requirement.

**Punching the hole at the FITTED rect instead makes the template's own background fill the margin
for free** — no new compositing, no second layer, no extra command. That is why the fitted rect
must come from one function both consumers read.

⚠ **Hole ≠ picture has reached air here before: [[B-149]]** — the arrangement mask punched every
hole at the cell's POSITION and the AUTHORED SIZE, opening the live layer where no box existed
(`[x]` FIXED 2026-08-19, on-air crosstalk). This item re-opens the exact coupling B-149 closed, so
it must be built with that failure in view.

⚠ **Do not go looking for `designer-box-geometry` "defect 1"** — that name has now been handed to
sessions twice and **no such change exists** anywhere in the tree;
[b-number-registry.md](b-number-registry.md) already records it as a false lead. The real precedent
is [[B-149]].

### 🔴 The REFUSAL consequence — `LIVE_PLATE_ASPECT_MISMATCH` must become mode-conditional

`tools/caspar-bridge/src/live-plate-fit.ts` refuses a take with `LIVE_PLATE_ASPECT_MISMATCH` when
the author's `expectedAspect` and the source's real aspect differ by more than
`ASPECT_MATCH_TOLERANCE` (1 %). Its own message states the justification:

> _"Cropping it would cut a part of the picture the author never saw — re-assign the plate, or
> correct the source's format."_

**Under `contain` NOTHING IS CROPPED, so the harm that refusal guards cannot occur.** A refusal
whose stated reason is impossible is a take blocked on air for nothing.

- Under **`cover`** — the refusal STANDS, unchanged. The harm is real there.
- Under **`contain`** — at most a **non-blocking warning** (the picture will be smaller than the box
  and the author may want to know); never a refused take.

🔴 **It must NOT be deleted.** The `cover` path still needs it, and deleting a refusal is how the
harm it guarded returns without anyone noticing.

### Deliberately NOT in scope, and why

- **`resolvePlateAspect`'s chain is UNCHANGED** — source `format` → source `aspect` → element
  `expectedAspect` → nothing (`assumed: true`). The [[D-147]] decision that **the SOURCE outranks
  the AUTHOR** stands on its own reasoning (the author cannot see the feed, so their guess is about
  what they designed for, not about what arrives) and is untouched by this item.
- **The "nobody stated an aspect" case is UNCHANGED** — no aspect means no fit and no refusal, and
  the picture fills the box exactly as it does today. `contain` changes what happens when an aspect
  IS known; it does not invent one. This is also why the default flip is safe for every existing
  scene whose sources are undescribed.
- **Fill/key, NDI and device enumeration** — [[C-021]] / [[C-027]] / the walk's Q2. Nothing here
  depends on them.

**Acceptance** — each bullet is written to become one OpenSpec `#### Scenario`:

- WHEN a plate's fit mode is `contain` and the source aspect is WIDER than the box THEN the picture
  is scaled to the box's WIDTH, centred vertically, and the whole picture is visible — no crop on
  either axis
- WHEN a plate's fit mode is `contain` and the source aspect is TALLER than the box THEN the picture
  is scaled to the box's HEIGHT, centred horizontally, and the whole picture is visible
- WHEN a plate is fitted under `contain` THEN the template's mask hole is punched at the **FITTED**
  rect, not the box rect, so the margin shows the template's own background and **never the channel
  behind the CG layer**
- WHEN the fitted rect is computed THEN the bridge's `MIXER FILL` / `MIXER CLIP` and the template's
  mask hole are derived from **the same single computation** — a test asserts the two agree for the
  same plate, in the same units
- WHEN a plate's fit mode is `cover` THEN the behaviour is **byte-identical to today's**: scale to
  cover, centre-crop, hole at the box rect, refusal on aspect mismatch. **This is the regression
  bullet and it is not optional**
- WHEN a plate's fit mode is `contain` and `expectedAspect` disagrees with the source beyond
  `ASPECT_MATCH_TOLERANCE` THEN the take is **NOT refused** — at most a non-blocking warning is
  reported, because nothing is cropped
- WHEN a plate's fit mode is `cover` and the same disagreement exists THEN the take is **still
  refused** with `LIVE_PLATE_ASPECT_MISMATCH` and the same message
- WHEN **no** aspect is known for a plate (`resolvePlateAspect` returns `assumed: true`) THEN there
  is no fit in either mode, no refusal, and the picture fills the box exactly as today
- WHEN a plate's aspect MATCHES its box within tolerance THEN `contain` and `cover` produce the
  **same** rect, and it is byte-identical to today's

**Notes.**

- ⭐ **Where the mode LIVES — DECIDED 2026-08-25 (session `FIT-MODE-01`), and implemented.** This
  was recorded as OPEN rather than guessed at. It is settled from the client's own recorded words —
  the mode is _"choosable in the Designer and overridable by the operator"_:
  - **Authored per ELEMENT** (`VideoPlaceholderElementSchema.fitMode`). **NOT per catalog SOURCE:**
    one source seated in a 16:9 box and a 3:4 box needs different fits, so a per-source field would
    have to be wrong in one of them. The mode is a property of the PAIRING of a picture with a box,
    and the element is where that pairing is authored.
  - 🔴 **CORRECTED BY [[B-178]] (2026-08-25).** This bullet originally continued _"on the group's
    declared source for a LOOKS template, where the carrier is source-keyed and `expectedAspect`
    already lives for the same reason"_ — and that half was **a defect, not a decision.**
    `LookSource.fitMode` had no writer anywhere in the product, so for **every look-group template
    ever exported** the author's choice was dropped and every plate reached air on the `contain`
    default. It is now carried **PER LOOK**, beside the rects (`TemplateLookCarrier.fits`), read off
    the plate element serving that `routeKey` in that look; `LookSource.fitMode` is deleted. The
    per-element decision above is unchanged — `B-178` applies its own argument one level in, since a
    `routeKey` appears in every look in a differently-shaped box. ⚠ `expectedAspect` does NOT follow
    it and is dead in the same way — [[B-179]].
  - **Overridable per ASSIGNMENT** at run time (`TemplateSourceAssignment.fitMode`) — the operator
    half, on the record that already answers "how does this plate get its input".
  - **Resolution order: assignment override → element → `contain`** (`resolvePlateFitMode`).
  - 🔴 **It runs the OPPOSITE way round from [[D-147]]'s aspect chain, and that is the decision
    rather than an inconsistency.** The ASPECT is a measurable property of the feed, so the
    installation outranks the author (the author cannot see the feed). The MODE is a presentation
    choice about that feed: the author states what the design wants, and the operator — who is
    looking at the picture on the day — is the only party who can say it is wrong for this shot.
    Two chains, opposite orders, resolved by two functions so nobody later "aligns" them.
- **The default FLIPS to `contain`**, which changes what existing scenes put on air — but only for
  plates whose source aspect is both KNOWN and DIFFERENT from the box. Where nothing is known, or
  where the two already agree, nothing changes (the last two acceptance bullets). That is the blast
  radius and it belongs in the change's proposal.
- ⚠ **`liveSourceFit`'s docstring currently argues AGAINST this**
  (`packages/shared-schema/src/live-geometry.ts`): it records that pillarbox was _"weighed and
  REJECTED"_ because _"black bars inside a frame the designer drew do not read as 'the source is
  4:3', they read as a fault on air"_, and its `Math.max` carries the comment _"`max`, never `min`:
  `min` is pillarbox"_. **That reasoning is not wrong — it is ANSWERED**: the margin under this
  item is not black, it is the template's own background, which removes the objection's premise.
  The docstring must be rewritten in the same change rather than left contradicting the code
  around it.
- The number was verified free by the heading sweep immediately before this heading was written:
  the highest `C-` heading was `C-027`; the `C-` duplicate audit printed nothing; a whole-tree
  `git grep` for `C-028` returned only forward-reference POINTERS (the registry's "next free" line
  and [[C-027]]'s provenance note), never a heading; and the same grep for `C-029` returned nothing
  at all. Recorded in [b-number-registry.md](b-number-registry.md).
- **Cross-refs:** [[C-015]] (the Live Source model and the fit chain), [[D-147]] (the aspect chain
  and the `expectedAspect` decision), [[B-149]] (the on-air precedent for hole ≠ picture),
  [[B-143]] (`resolvePlateAspect`'s `assumed` flag has no readers — the honesty half that a
  `contain` default makes more visible).

---

## [~] C-029 — program output is GONE and nothing says so: the declared-versus-running output check, its banner, and a bounded off-by-default re-creation ⟨priority: high — the station had no SDI output for days and every pill read HEALTHY⟩ — IMPLEMENTED 2026-09-04, `openspec/changes/pgm-output-alarm/`; Linux `gate:e2e` OWED

**What the plant did, 2026-09-01.** The DeckLink card was replaced. `casparcg.config` kept the old
card's persistent ID (`<decklink><device>23487013</device>`), the consumer failed at boot and never
appeared in `INFO`. AMCP answered, OSC ticked, `BRIDGE LIVE` and `PRIMARY A HEALTHY` sat in the bar,
and the station had **no program output**. The absence was discoverable only by reading `INFO 1`'s
XML and noticing that `<output>` listed `port_500` (system-audio) and `port_600` (screen) and nothing
else. Verified at the wire from this dev host on 2026-09-04 (`192.168.21.114:5250`,
`2.5.0 69e8ad5 Stable`), and the config is deliberately still broken — it is the fixture.

**What:** the bridge reads, over AMCP, what each channel DECLARES (`INFO CONFIG`, once per
connection) and what it RUNS (the `<output>` block of the `INFO <channel>` reply the [[R-030]] mode
read already sends; re-read every 60 s and after a reconnect), publishes per channel the declared
set, the running set and every declared kind with fewer running instances than declared, and keeps
that verdict across a disconnect. The Runtime renders a full-width `role="alert"` strip — the
`ConnectionBanner` / `RasterMismatchBanner` language, not `FailoverBanner`'s slab ([[B-172]]) — that
names the channel, `decklink (device 23487013)`, what is running, and the next action; when the bridge
loses CasparCG after a `missing` verdict the strip stays and reads UNVERIFIED instead of vanishing.
`outputVerdictOf` in `@cg/shared-ipc` is the one authority for every arm.

**"Auto-detect" — the honest limit, stated for the operator.** Nothing enumerates DeckLink devices
over AMCP (Q2 of the 2026-08-25 walk, re-confirmed: `INFO SYSTEM` degrades to `INFO`; `INFO CONFIG`
echoes what the operator wrote; the device list lives only in the startup log the bridge does not
read). So it cannot mean discovery or a picker. It means: **the operator names the device in
`casparcg.config`; the bridge verifies the declared consumer is running and complains when it is
not, naming the device the config named.** Probing with `ADD` is not a substitute (below).

**Measured 2026-09-04 — `ADD` with an unknown device, on the plant (card gone, drivers present) and
the dev host's 2.5.0 (no drivers), the plant in a state where a glitch cost nothing (no program
output; an orphan html producer on 1-96; screen + system audio the only outputs):**

| command                                           | reply                                   | log                                                                           |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `ADD 1 DECKLINK 99` (plant)                       | `403 ADD FAILED`, 6 ms                  | " Check syntax." — a `user_error` from `get_device`                           |
| `ADD 1 DECKLINK 99` (dev host)                    | `403 ADD FAILED`, 2 ms                  | " Check syntax."                                                              |
| `ADD 1 DECKLINK DEVICE 99` (the brief's spelling) | `404 ADD FAILED`, 50 ms                 | `invalid stoll argument` — `DEVICE` is not in the grammar; " File not found." |
| `ADD 1 FOOBAR`                                    | `404 ADD FAILED`                        | " File not found."                                                            |
| `INFO 1` before/after every failed `ADD`          | byte-identical (1620 / 1095 chars)      | no consumer re-initialised                                                    |
| `ADD 1 SCREEN 1` → `REMOVE 1-601`                 | `202` / `202`; gone from `INFO` at once | "Uninitialized." **13–16 ms AFTER** the `202`                                 |
| `ADD 1 SCREEN` (600 already running)              | `202 ADD OK`                            | new "Initialized." +1 ms, OLD "Uninitialized." **+28 ms** — REPLACED          |

⇒ (a) the reply for a missing device is `403` with no text and a lying log line; (b) a failed
`ADD` at a free index does not disturb the channel, an `ADD` at a running index replaces the
consumer; (c) `REMOVE` is reversible and `INFO` reflects it immediately, but the receipt precedes
the destroy exactly like `CLEAR`'s ([[B-177]]); (d) **probing is NOT a substitute for enumeration**
— a failure cannot tell a missing device from missing drivers or an unsupported format, and a
success puts a card ON AIR. Both lying errors filed as [[B-208]].

**The flag — `--create-missing-consumers`, OFF by default.** On, the bridge sends ONE `ADD` per
connection per channel for a declared DeckLink the check found missing, built from the declaration's
OWN tokens (`ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO` for this plant's config), records CasparCG's
answer in the health snapshot and the banner, and verifies a `202` by re-reading `INFO`. It never
names a device the config did not (the owner's boundary: the config stays the boot-time baseline;
no silent substitution on a multi-card box). `output-policy.test.ts` reddens if the default flips —
in the resolver and on the shipped CLI's boot line.

**Acceptance:**

- WHEN `casparcg.config` declares a consumer for a channel and `INFO <channel>` does not list a
  running consumer of that kind THEN the Runtime shows a full-width alarm naming the channel, the
  kind and its device, what is running, and the next action — with every reachability pill still
  green
- WHEN a later read (60 s, a reconnect after a config fix, or the bridge's own `ADD`) finds the
  consumer running THEN the alarm clears on its own
- WHEN the bridge cannot reach CasparCG after a `missing` verdict THEN the alarm stays, re-labelled
  UNVERIFIED, saying when the output was last seen missing
- WHEN the declaration cannot be read, or nothing has been checked yet, or the browser→bridge link
  is down THEN nothing lights from this alarm
- WHEN the bridge runs without `--create-missing-consumers` THEN no `ADD` is ever sent for a missing
  consumer; WHEN it runs with it THEN at most one `ADD` per connection per channel, with the
  declaration's own device, its outcome recorded

**What this does NOT see, stated in the operator guide:** a consumer that is present but unhappy
(lost reference, dropped frames) — `INFO` reports existence and configuration, never health; that
lives in the server log. A channel that ticked and STOPPED remains [[R-058]]'s chip.

- **Cross-refs:** [[R-058]] (the OSC-axis sibling; its "cannot read casparcg.config" sentence is
  superseded — addendum there), [[R-030]] (the `INFO <channel>` read this rides), [[B-177]] (the
  producer-side disguise), [[B-208]] (the consumer-side one), [[B-172]] (why a strip, not the slab),
  [[C-021]] (Q2: nothing enumerates), [[B-141]]/[[B-143]]/[[B-144]] (the family).
- **Number:** the highest `C-` heading was `C-028`; `git grep -n "C-029"` returned only the
  registry's forward pointer and [[C-028]]'s provenance note, never a heading. Recorded in
  [b-number-registry.md](b-number-registry.md).
