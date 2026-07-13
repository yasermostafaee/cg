# Design — reconnect reconciliation (B-038 follow-up + B-048)

Diagnosis first (Part A, approved 2026-07-10), then the design decisions it
forces. Method: full read of the reconnect/registry/playout seams; a 12-reader
parallel deep-read (reconciler, OSC pipeline, session/adapter, bridge WS,
builder/layers, MockRuntime, amcp-mock, test harnesses, template-runtime CG
API, **CasparCG server source on GitHub — v2.3.x-lts AND master**, size
measurements, openspec survey); three bridge→mock repro experiments
(EXP-A/B/C, run then deleted — their regression versions land with this
change).

## 1. Face 1 — the template gap, end to end

- `TemplateRegistry` is a plain in-memory Map; its only mutator is `import()`
  (per-id replace); no reset path — contents die with the process
  (`tools/caspar-bridge/src/template-registry.ts:17-27`).
- The browser retains nothing after import: `importTemplateFromBytes` ships
  `{template, html}` once and returns only `{templateId, warnings}`
  (`apps/runtime/src/renderer/features/library/templateDelivery.ts:154-162`);
  `LibraryPanel` holds bytes/html only in function locals; no
  localStorage/IndexedDB retention exists in apps/runtime beyond MockRuntime's
  settings key.
- `WebSocketRuntime.#resync()` re-pulls exactly stack + health + lock
  (`apps/runtime/src/platform/WebSocketRuntime.ts:209-222`); the existing
  resync test asserts only those three emissions.
- A post-restart Load never consults the registry: `#sendAdd` unconditionally
  builds the served URL (`caspar-runtime.ts:566-568`); the serve port is
  ephemeral (`template-http-server.ts:48,56-59`) so the URL is fresh each
  process; `GET /template/<id>` on the empty registry → 404
  (`template-http-server.ts:104-114`).
- **Real CasparCG behavior at that point (server source, both branches):**
  `cg_add_command` replies `202 CG OK` synchronously; an `http(s)://` template
  arg is accepted by string prefix with **no fetch or validation**
  (v2.3.x-lts `src/modules/html/producer/html_producer.cpp:549-562`);
  `404 CG ADD FAILED` exists only for non-URL template-path misses
  (`AMCPCommandQueue.cpp:96-98`). CEF loads the 404 body asynchronously; on
  2.3 `OnLoadEnd` fires even for an HTTP-404 page and flushes queued JS
  (`html_producer.cpp:353-357`). **Live operator experience: Load → READY,
  Take → ON AIR badge (ack-driven), output silently blank.** The pre-change
  mock was _stricter_ than real (synchronous GET, rejects the ADD) — bridge→mock
  the load failed loud; live it failed silent. That divergence is itself fixed
  here.
- **EXP-A (bridge→mock):** session 1 import+load+take, kill the runtime;
  session 2, no re-import, load the same id → `accepted:false`,
  `errorCode:'amcp-404'` — **but the item displayed `status:'on-air'`** (see
  §3, orphan OSC pollution).

## 2. Retention: what and where (decision)

Measured (realistic fixture `fixtures/templates/persian-lower-third.vcg`):
produced HTML ≈ **631 KB** = cgJsIife 356 KB (~56%) + inlined fonts 269 KB
(~43%, all 11 faces, no subsetting) + <8 KB unique; ~625 KB is byte-identical
across templates. Raw `.vcg` ≈ 2.6–72 KB (HTML is ~9×–245× the bytes).

**Decision: retain the exact delivery payload (`{template, html}`) in
`WebSocketRuntime` and replay it at the top of `#resync()`.** Rationale: the
reconnect owner replays byte-identical, exactly-what-was-delivered content;
zero renderer coupling (fontsCss lives in the renderer); no
re-render/re-fetch failure surface at reconnect; survives React unmounts by
construction. Cost accepted at operator-library scale (single-digit MB for a
handful of templates). The alternative — retain `.vcg` bytes renderer-side and
re-run `importTemplateFromBytes` on reconnect — is ~9–245× smaller and the
natural persistence unit, but adds renderer wiring and re-executes
verify/unpack/export/fetch at reconnect. It is the **documented upgrade path**:
persist `.vcg` bytes via `@cg/storage` to also cover page-reload and
both-restart.

Scope matrix (explicit):

- Bridge bounces, page stays → **fixed by this change** (auto re-delivery).
- Page reloads, bridge stays → already works (bridge retains; list re-pulls).
- Both restart → manual re-import remains (until the `@cg/storage` follow-up).

Ordering: `#resync()` issues all retained re-imports (frames written before
yielding), then the three snapshot pulls. Single-socket FIFO + the bridge's
synchronous `templateImport` (a Map.set inside the message event,
`bridge.ts:142-144` + `caspar-runtime.ts:432-437`) guarantee any operator load
sent after reconnect sees a populated registry. In-flight loads at drop time
are already rejected by `#onDown` — nothing dangles.

**Bridge-side guard (defense in depth):** `load()` rejects with
`errorCode:'unknown-template'` when `!#templates.has(templateId)` — nothing is
sent. This converts real CasparCG's silent blank into a visible failed load and
makes the (already tiny) load-vs-redelivery race fail loud instead of silent.

## 3. Face 2 — B-048 hypothesis verdicts

**(a) Stale-producer hijack — DISPROVEN at server-source level.**
`get_or_create_proxy` reuses an existing producer only when its record was
registered `reusable_producer_instance`; the html module registers **`false`
on BOTH v2.3.x-lts and master** (`html.cpp:260-267` / master `:264-271`), so
`CG ADD` on an occupied layer **always creates a new CEF producer at the new
URL** and `stage.load()+play()` replaces the orphan (`cg_proxy.cpp:126-156`).
The fresh URL IS fetched; the serve-port change is irrelevant to the ADD path.
(The reuse path existed for flash.)

What the orphan **does** cause (proven, mock-reproduced):

- **Deterministic collision**: allocation is lowest-free-in-range
  (`layer-manager.ts:119-127`); unknown template ids fall back to `custom` →
  layer 1-60 (`caspar-runtime.ts:488-499`). EXP-B: the fresh session
  re-allocated the identical slot; the serve URL changed across the restart;
  **zero CLEAR was ever sent between sessions**.
- **OSC state pollution**: the change tracker emits first observations
  (`osc/change-tracker.ts:14-21`); interest is added at load and `assignSlot`
  runs **before** `#addInterest` (`caspar-runtime.ts:284-292`), so the orphan's
  `foreground/producer "html"` routes to the NEW item; fresh truth outranks
  acks (`reconciler.ts:409-414`, `:190-198`). EXP-C: item shows `on-air` right
  after Load, before any Take. EXP-A: a FAILED load displays `on-air`.
- **Zombie content**: nothing tracks what the dead session left on air
  (`#slots`/`#loaded` are process-local); the handshake discards the INFO body
  (`server-session.ts:261-267`); `unexpected-onair`, `LayerManager.observe`
  /`collision`, and `beginResync` all have no production caller (frozen
  C-010).

**(b) Import/serve race — ruled out** for the documented repro:
`templateImport` registers synchronously within the WS message event, so
import-then-load on one socket cannot race; `startServing()` is awaited inside
`createBridge` before the handle returns (`bridge.ts:153-156`); the only
unserved window (wss listening, template server not yet) is unreachable by the
human import→load flow.

**(c) CEF cold-start racing CG PLAY — unsupported as a drop.** `play()` JS is
**queued**, not dropped, until `OnLoadEnd` (v2.3.x-lts
`html_producer.cpp:172-180, 353-357`); master drops queued JS only on
`OnLoadError` — a network-level failure (`master html_producer.cpp:511-540`) —
implausible for the freshly-served URL in the repro. At most play executes
late (page-load delay).

**(d) The badge evidence eliminates the bridge.** "Update flips the item to
ready" (status `'loaded'` → READY) is only producible if **no take intent was
ever applied at the bridge**: update's settle captures `intentStatus` at
update time (`reconciler.ts:314-323`); an applied take makes it `'playing'`
(→ ON AIR after ack); a failed take shows ERROR; `take()` applies its intent
unconditionally once the slot exists (`caspar-runtime.ts:296-300`). The
2026-07-07 UI had **no AsyncButton** (introduced by R-007 `de7e086`; the
severed-click fix `8cd03ef` post-dates the session); Take was a plain button
through `runCommand`, which visibly reports rejections. **Conclusion: B-048's
documented symptom is not reproducible from the bridge/CasparCG code.**
Surviving candidates: (i) an unlogged UI/flow-level miss of the first Take (if
the badge detail is accurate), or (ii) CEF first-page load delay deferring the
queued `play()` past the operator's observation window (if it is imprecise).
**Discriminator (Part C, FIRST live step):** exact repro on current main with
the caspar log + bridge template-server access log — no `CG PLAY` received ⇒
UI/link miss, resolved by R-007 (close B-048 with the log as evidence);
`CG PLAY` + GET 200 + still blank ⇒ CEF/page timing (new PRD entry with logs,
NOT force-fit into this change); reproduces as described ⇒ diagnose further
before closing. Either way this change's own value is validated by its other
checklist items.

**Mock fidelity gaps found:** producers correctly survive control-connection
drops (state per mock instance); ADD's unconditional replace **matches real**;
but ADD's synchronous fetch-404 was stricter than real, `CG UPDATE` never
403'd, channel-form `CLEAR <ch>` is a no-op, and no CEF timing is modeled.

## 4. Relationship between the faces

Independent defects of the same amnesia event; neither fixes the other. B-048's
repro included a manual re-import (registry populated — Face 1's fix would not
have changed its outcome). Face 1 removes the manual re-import and makes the
silent blank loud; Face 2's adoption removes orphan-driven state pollution.
B-048 closes only via the Part C discriminator.

## 5. Design decisions

### Face 1 (browser platform tier + bridge guard)

- `WebSocketRuntime` gains `#retained: Map<templateId, {template, html}>`,
  populated when `templates.import` resolves OK; replace per id; cleared on
  `dispose()`.
- `#resync()` re-issues every retained import first, then the snapshot pulls.
  A failed re-import is surfaced (command-error path in the caller UI is
  untouched — the rejection propagates like any command failure) and does not
  abort the rest.
- `CasparRuntime.load()` fails fast (`accepted:false`, ack error
  `unknown-template`) when the registry lacks the id. Test suites that load
  un-imported ids gain imports.

### Face 2 (bridge): lazy layer adoption, no blind clear

- `CasparRuntime` tracks `#adopted: Set<"ch:layer">`. In `load()`, when the
  allocated layer is not adopted, send `CLEAR <ch>-<layer>` (non-intent seq)
  **before** `#slots.set`/`assignSlot`/`#addInterest`, so the orphan's OSC
  state can never route to the new item. Any bridge-issued CLEAR (adopt, out,
  remove) marks the layer adopted for the process's lifetime.
- **No blind startup CLEAR** — on-air safety: a cold bridge cannot distinguish
  junk from a graphic intentionally riding through a controller bounce (logo
  bug, scoreboard); "known stack" at cold start is empty, so
  reconcile-against-known-state degenerates to blind blanking of live output
  with zero operator intent. The orphan is destroyed exactly when the operator
  expresses intent over that layer — the same moment a real `CG ADD` would
  destroy it anyway (server-source-proven) — so the policy adds **zero new
  on-air loss**. Orphans on never-reloaded layers stay on air by design;
  surfacing them (occupancy warning + explicit Clear control via
  `unexpected-onair`) is a filed follow-up (C-010-adjacent).
- **KNOWN LIMITATION — adoption is per `(channel, layer)`, blind to WHAT it
  clears.** The bridge has no cross-restart memory of which template was on
  which layer, and the fresh session's LayerManager assigns layers purely by
  allocation order. After a restart, the adopt-CLEAR on a newly-assigned layer
  therefore wipes whatever the PREVIOUS session left there — which is the
  graphic the operator is replacing only when the layouts happen to line up.
  Live validation didn't hit the divergent case because the assignment order
  repeated across sessions — that is luck of a stable layout, not a guarantee.
  Scope of the risk, precisely: the adopt-CLEAR still never causes on-air loss
  beyond what the real `CG ADD` would do ON THAT LAYER (the server replaces the
  foreground either way); the specific hazard is clearing the WRONG on-air
  layer when the fresh session's layout diverges from the dead session's (e.g.
  different import/Load order). Safe under a stable layer layout; the correct
  fix is persisted, layer-aware reconciliation — adopt by KNOWN occupancy
  instead of by whatever layer a new Load lands on. Tracked as **C-011**
  (`docs/prd/caspar.md`): persist the Loaded stack + template registry across
  bridge restart AND page reload, which also eliminates the both-restart
  manual re-import gap of this change's page-lifetime retention.

### Mock fidelity (the B-041 lesson)

- `CG ADD` URL arg → `202` immediately; the GET runs **async** and the verdict
  (`resolved` / `failed`) is recorded per slot and exposed on `MockHandle`;
  a failed page marks the layer not-rendering (PLAY on it is observably
  ineffective), per master's `OnLoadError` semantics. Bare id → `404`
  (unchanged — the real template-path miss).
- `CG UPDATE` → `403` when the layer has no producer (real
  `get_expected_cg_proxy`; matches B-038's original live log).
- Producer survival across control-connection drops stays as-is (already
  real-accurate) and gains the orphan-scenario harness.

### Out of scope (frozen; referenced, not fixed)

B-041 escape rule · R-003 semantics · B-044 lifecycle · B-046 · B-047 · C-010
resync wiring · orphan-occupancy surfacing (follow-up) · `#loaded` staleness
across a _CasparCG_ restart (follow-up candidate) · the pre-existing ~1 s
false-ON-AIR blip inherent to the "non-empty producer ⇒ on-air" OSC mapping in
clean sessions (adoption removes the orphan-driven case only).

### Risk statement

If the Part C clean-main repro still shows a blank first Take, the UI/link
attribution is wrong; the captured logs discriminate (no `CG PLAY` ⇒ UI/link;
`CG PLAY` + GET ok + no render ⇒ CEF/page → new PRD entry). The shipped
mechanics (re-delivery, guard, adoption) remain correct and necessary under
every candidate mechanism.

## 7. B-070 — `update` was the one verb with no producer-state rule

### 7.1 The corrected diagnosis

The operator's report was: Inspector "Update" on an item reading `idle (pending)`
fails with "Not accepted." The obvious suspect — `update()`'s
`if (slot === undefined) return { accepted: false }` — is **NOT** the culprit, and
proving that is what unlocked the bug.

`pending` is derived from a non-terminal `intentStatus`, and the only writers of
one are the take/update/out intents — each of which returns BEFORE `applyIntent`
when the slot is missing. So a slot-less item can never render `(pending)` at all:
**`idle (pending)` proves the item HAS a slot.** The refusal came from the other
exit, `return { accepted: ok }`, with `ok === false` because CasparCG **`403`s a
`CG UPDATE` on a layer with no cg producer** — the very behavior this change
taught the mock (from the B-038 live log).

And on a slotted item, status `idle` IS the OSC report that the layer's producer
is empty (`lastProducer === 'empty' → 'idle'`). **The UI was displaying the exact
reason for its own refusal.**

So `CG UPDATE` needs a **PRODUCER, not AIR** — and `update` was the only playout
verb with no producer-state rule: `take` re-ADDs when the producer is gone (B-039)
and `setPosition` checks the same bookkeeping, while `update` fired blind. That
omission is visible in this change's own prescriptive-verb requirement, which
enumerated load / adoption / take / out / remove and simply had no **update**
bullet. B-070 adds it.

This also rules out the tempting "make Update on-air-only" fix: a **loaded** item
(ADD with play-on-load OFF) has a live producer and is NOT on air, and it updates
fine. Gating on air would amputate that case — which is exactly the bug in the
stack row's twin control (`disabled={!onAir}`), left for a follow-up.

### 7.2 The zombie `pending` (the cascade)

A failed ack set `ackedStatus = 'error'` but never touched `intentStatus`, leaving
it at the transient `updating` **forever**. `pending` therefore never cleared, and
because R-011's `setPosition` refuses while `item.pending`, **one refused Update
made the item permanently un-positionable**. The `idle (pending)` the operator saw
was not a resting state — it was the SCAR of an earlier refused Update.

The fix settles the intent on failure (B-044's rule is that nothing rests
non-terminal): the item lands back on its evidenced resting status, or on
`unconfirmed` when there is no evidenced target, with the failure surfaced as
`errorCode`. It was never update-specific — a failed take zombied identically.

**Deliberate deviation from the brief:** we did NOT also stop `#send` from clearing
the B-044 expiry timer before a failed ack. Once the failed ack settles the intent
itself, `expireIntent` has nothing to rescue (it only acts on a still-transient
`updating`/`exiting`), so keeping the timer armed would leave a stray timer on an
already-settled intent. A response ARRIVING is precisely when a bounded timeout
stops applying. The genuine no-ack timeout path is untouched.

### 7.3 Why the green suite never caught it

`MockRuntime.update` accepted an update on ANY item — it had no producer model at
all — so update-on-idle always succeeded offline, and every bridge integration test
staged `load → take → update`, i.e. always ON a live producer. The producerless
path existed in neither. The R-003 Inspector UX was thus built and tested against
semantics the real bridge does not have. The mock now carries the producer model.

### 7.4 ADR-0006 caveat — the decisive LIVE question

ADR-0006 hardware-validated `CG UPDATE` on CasparCG 2.3.2, but against a producer
`CG ADD`ed with **play-on-load = 1** (i.e. PLAYING). B-039 later flipped load to
**play-on-load = OFF**. There is therefore **no in-repo hardware proof** that
`CG UPDATE` succeeds on an ADDed-but-never-PLAYED producer — only the mock's
producer-based guard and B-048's field anecdote.

The live checklist (task 7.6) must answer: load an item, do NOT take it, edit
fields, press Update. If real CasparCG `403`s even that loaded-not-playing
producer, then producer-existence must be read as **"loaded AND playing"**, and
the loaded-not-playing case ALSO takes the no-send commit path (fields ride the
next take's re-ADD). The code change for that is a one-line predicate; the spec
bullet would narrow to match.
