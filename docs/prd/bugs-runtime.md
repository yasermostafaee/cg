# Bugs — Runtime / CasparCG

Bug reports for the **Runtime** app (`apps/runtime`, the CasparCG playout controller)
and its client stack (`@cg/caspar-client`, AMCP/OSC). For the bug format and Claude's
per-bug loop, see [bugs.md](bugs.md).

> **B- numbers are GLOBAL** across all three bug files and are **never reused**.
> When filing a new bug, pick the next unused `B-` number regardless of which file
> it goes in. Bug files: [bugs-designer.md](bugs-designer.md) ·
> [bugs-runtime.md](bugs-runtime.md) · [bugs.md](bugs.md) (cross-cutting / tooling).

---

## [x] B-066 — CEF-incompatible `replaceAll` in the served runtime bundle aborts every template at boot on real CasparCG — "update/play is not defined" and Persian "????" are downstream effects ⟨priority: high⟩ — fixed via `persian-onair-cef-compat`, archived; **LIVE-CONFIRMED on CasparCG 2.3.2 / `4de6d18f`** (2026-07-13)

<!-- change: openspec/changes/archive/2026-07-12-persian-onair-cef-compat/ -->

> Found live via the D-119 starter-template work (hard blocker for D-119 —
> no Persian template airs). ONE root cause behind three observed symptoms,
> confirmed by a parallel trace on the Designer track AND by this change's
> CEF-emulation tests. Filed as ONE bug per the owner's direction (next
> free number on merged main; the brief's provisional B-065 was already
> taken by the serve-stop fix, #286).

**Root cause:** `packages/template-runtime/src/bindings.ts` called
`String.prototype.replaceAll` — Chromium 85+, absent in CasparCG's CEF
(baseline **Chromium 71** = CasparCG 2.3 LTS, the repo's declared floor).
`createRuntime()` applies field DEFAULTS through that binding walk during
construction, so the served template ABORTED at boot ("replaceAll is not a
function"). The bundler was not wrong: the IIFE already targeted
`chrome71` — but esbuild `target` lowers SYNTAX only; built-in METHODS pass
straight through. **Downstream effect 1** — "update is not defined" /
"play is not defined" on `CG ADD`: the boot runs `createRuntime()` BEFORE
`installCasparGlobals()`, so the throw meant the bare CasparCG entrypoints
were never installed. **Downstream effect 2** — Persian as "????": nothing
rendered at all; the payload path is clean — every UTF-8 hop was verified
(`.vcg` unpack `TextDecoder`; browser WS text frames; bridge
`data.toString()`; Node socket write default UTF-8 — `setEncoding` is
read-side only) and the B-041 matrix already proves Persian byte-exact
through the wire. `quote()`/the escape rule untouched.

**Fix + durable guard** (implemented + test-validated 2026-07-12,
`openspec/changes/persian-onair-cef-compat/`): CEF-safe
`split(placeholder).join(value)` (literal replace-all; regex metacharacters
inert; a value's `$&` stays literal); full bundle audit — `replaceAll` was
the ONLY banned built-in (zod included); the boot gains the fixtures'
try/catch + visible "cg boot error" `<pre>`; guard = a bundle-ARTIFACT scan
(`@cg/single-file-export tests/cef-compat.test.ts`) + broadcast-tier
`no-restricted-syntax` bans (`@cg/eslint-config` `cef-compat`, one curated
list — it already caught a real `matchAll` in the exporter during rollout,
correctly opted out as non-CEF-facing code) + every CasparCG-facing esbuild
target pinned `chrome71` (the `.vcg`'s `cgJs` and `tools/template-fixtures`
were es2022). Verb sequence untouched: `CG ADD`/`PLAY`/`UPDATE` per
ADR-0006; `CG INVOKE`/`CALL` remain hardware-disproven and NOT adopted.
Regression nets: CEF-emulation boot test (no `replaceAll` in the env →
boots, bare globals defined, `update(json)` renders Persian); Persian
byte-exact `.vcg`→delivery and bridge→`CG ADD`-decode tests (zero "?").

**LIVE CONFIRMATION — PASSED on CasparCG 2.3.2 (build `4de6d18f`), 2026-07-13**
(the real gate; owner's CasparCG — the same build ADR-0006 was validated
against):

1. [x] Export any Persian template from the Designer → import into the Runtime
       app → Load on real CasparCG.
2. [x] `CG ADD`: NO "replaceAll is not a function", NO "cg boot error" pre on
       the output, NO "update/play is not defined" in the CEF log — **no boot
       abort**.
3. [x] `window.play`/`window.update` DEFINED; the template RENDERS.
4. [x] Rendered Persian is correct — no "?". (CasparCG's own console/log may
       still transliterate Persian to "?" in its display — that is the log's
       ANSI codepage, not the payload; the render is the ground truth.)
5. [x] CEF/Chromium version noted from the CasparCG logs (within the expected
       [71, 84] band for the 2.3 LTS line).
6. [x] Unblocked the **D-119** Persian starter-template re-test (D-119 is
       owner-verified on real CasparCG, 2026-07-13).

**Cross-refs:** [[B-041]] (escape rule — frozen, reconfirmed byte-exact),
ADR 0006 (verb provenance), D-119 (the blocked Designer track).

## [x] B-065 — B-064's bounded serve stop severs an ARRIVED-but-unparsed template fetch (RST) — red main CI via the reconnect fixtures + its own in-flight test ⟨priority: high⟩ — fixed on `fix/ci-test-stability`

> **CLOSED — root-caused with a deterministic repro, fixed + revalidated
> 2026-07-12.** **Symptom:** main CI red from the #283 merge onward —
> `reconnect-reconciliation.integration.test.ts:133/:243` (`onAir` false,
> producer still `html`) and `setconfig-serve-restart.integration.test.ts:187`
> (in-flight GET rejected `ECONNRESET`), CI-only (2/2 Linux runs red;
> 10×25 fixture iterations under 10-core local load never reproduced).
> **Root cause (production, found by forcing the ordering deterministically):**
> a socket joins `TemplateHttpServer.stop()`'s `#busy` set only when Node
> fires `'request'` (headers parsed). A fetch whose request bytes have
> ARRIVED but are not yet parsed is indistinguishable from an idle socket —
> and since Node 19 `server.close()` itself destroys idle keep-alive
> connections synchronously, RST-ing the unread request (closing a socket
> with unread inbound data sends RST). The severed GET settles the mock's
> (and real CEF's) page FAILED → `onAir:false` — silently deleting the
> on-air orphan the reconnect fixtures hand over. The window is event-loop-
> lag-scaled: effectively unreachable on a fast idle box, hit consistently
> on a contended 4-vCPU CI runner. **Fix (production):** `stop()` defers the
> whole teardown — `server.close()`, `closeIdleConnections()`, and the
> request-less destroy pass — by ONE full event-loop iteration (double
> `setImmediate`, spanning the next poll phase) so an arrived request joins
> `#busy` and flushes within the existing 500 ms grace; the grace deadline
> arms at `stop()` entry, so teardown stays bounded exactly as B-064
> requires, and a keep-alive socket whose response completes mid-teardown is
> reaped via `destroySoon()` (never a hard `destroy()`, which discards the
> queued response). **Fix (tests):** the fixtures now stage deterministically
> instead of racing — `orphanedSession` settles the page
> (`waitForCgAddResolution`) before killing the bridge (its stated scenario
> is "dies WITH OUTPUT ON AIR", i.e. a rendered page, not a mid-flight
> fetch); the in-flight-flush test replaces its fixed 30 ms sleep with a
> first-byte barrier; the NDJSON trace reads replace a fixed 150 ms sleep
> with a real write barrier (`mock.traceFlush()`, new amcp-mock seam); the
> held-CLEAR staging polls for BOTH mirror-sync CLEARs. **New regression
> test:** keep-alive next-fetch parse window — a second request written and
> `stop()` called in the SAME synchronous tick must still flush a complete
> response (deterministic on every OS/Node; failed pre-fix, passes post-fix).
> **Validation:** deterministic repros flipped red→green on Node 22.23.1
> (CI's exact version) and 26; 15×3-spec loop under 10-core load green;
> 3× full uncached parallel `pnpm test` green (one under 8 burners).

## [x] B-064 — R-010 regression: after an OSC-port change Apply cycle, the template server stays down and every Load ships a bare-id 404 ⟨priority: high⟩ — fixed via `fix-setconfig-serve-restart`, archived; **LIVE-CONFIRMED on CasparCG 2.3.2 / `4de6d18f`** (2026-07-13)

<!-- change: openspec/changes/archive/2026-07-11-fix-setconfig-serve-restart/ -->

> **CLOSED — fixed + mock/integration-validated 2026-07-11** (operator repro
> was live on CasparCG 2.5.0 `69e8ad5`; the fix is mock-verified with the
> operator's own live smoke optional). **Repro:** SERVERS → change the OSC
> port to a wrong value → Apply (UI times out at 8 s) → change it back →
> Apply → every Load fails; the caspar log shows the bridge sending the BARE
> template id (`CG 1-60 ADD 0 "362b1285-…" 0 "{}"` → File not found → 404
> CG ADD FAILED). **Root cause — ONE flaw, two failure modes:** `setConfig`
> was not serialized. The first Apply wedged inside
> `TemplateHttpServer.stop()` (`server.close()` waits on held CEF keep-alive/
> preconnect sockets; reaping is Node-version-dependent), which nulls the
> server immediately, so `listening === false` for the whole wedge; the
> second Apply ran CONCURRENTLY, read the transient `wasServing = false`,
> SKIPPED the serve restart, and returned ok — serve down forever while
> sends work (mode A, the operator's log). Interleaved applies could also
> leave the adapter holding already-stopped sessions — every send dead with
> zero wire traffic (mode B, demonstrated in-test). Deeper contract bug:
> `#sendAdd`'s `listening ? url : bare id` fallback silently shipped an
> unservable ADD — R-010's "fail loudly, never a silent bare-id" was never
> enforced. **Fix (four parts):** (1) `setConfig` serialized via
> `#applyInFlight` — a concurrent apply refuses loudly
> (`'apply-in-progress'`, new response-enum value, shown by the panel);
> (2) bounded forceful serve stop — the server tracks sockets and destroys
> them (+ `closeAllConnections?.()`), teardown bounded on every Node/CEF
> combination; (3) `#servingDesired` (set once by `startServing()`) replaces
> the transient `wasServing` read — the serve always restarts when intended,
> and an apply can never return ok with it down (`apply-failed` otherwise);
> (4) the loud bare-id contract — serving desired but down ⇒ the load acks
> `'template-serve-down'` and NOTHING reaches the wire (bare id survives
> only the never-served unit path). **Regression suite** (2 of 4 verified
> failing pre-fix): concurrent applies (pre-fix both returned ok), the
> injected-failing-server bare-id contract, CEF-wedge stop() boundedness
> (idle + mid-request + preconnect sockets → <1 s), and the sequential-cycle
> baseline.
>
> **LIVE SMOKE — PASSED on CasparCG 2.3.2 (build `4de6d18f`), 2026-07-13.** The
> operator's optional live smoke is now DONE and it passed: the `setConfig`
> serve-restart holds on hardware — after an OSC-port change Apply cycle the
> template server comes back up and Loads resolve against the served
> `/template/<id>` URL (no bare-id `404`). The mock/integration validation is
> confirmed by the real server; nothing further is pending on B-064.

## [x] B-038 — LIVE bridge renders nothing: CG ADD references the template by UUID and sends empty fields ⟨priority: high⟩

> **CLOSED — hardware-validated.** The Runtime is now on-air-capable. Verified live
> on **CasparCG 2.3.2**: a real `.vcg` renders on the output with correct Persian
> (right font, intact shaping) via take, the served `/template/<id>` URL loads
> (`202`, not `404`), and `CG UPDATE` carries real field data.

**Repro:**

1. Run the Runtime **LIVE**: bridge (`tools/caspar-bridge`) connected to a real
   **CasparCG 2.3.2** (`4de6d18f` Dev); the connection indicator shows LIVE.
2. Import a `.vcg` into the Library (R-001), then click **Load** to put it on the stack.
3. Click **Take** (and/or edit a field → Update).

**Expected:** the template renders on the CasparCG output with its Persian fields
visible; Update pushes new field values to the live page.
**Actual:** nothing reaches air. CasparCG logs:

```
Received: CG 1-60 ADD 0 "e22e2f2a-ad85-42d9-9db5-78d921d14e82" 1 "{}"  → 404 CG ADD FAILED
Received: CG 1-60 PLAY 0                                                 → 202 OK (but layer empty → nothing plays)
Received: CG 1-60 UPDATE 0 "{}"                                          → 403 CG UPDATE FAILED
```

**Env:** Runtime LIVE — `WebSocketRuntime` → `@cg/caspar-bridge` (`CasparRuntime`

- real `@cg/caspar-client`) → CasparCG 2.3.2 (`4de6d18f`). Reproduces on `main`.

**Notes / root cause (two distinct problems):**

1. **Template referenced by internal UUID, not a loadable HTML page.** The CG ADD
   template argument is the stack item's `templateId`, which is the `.vcg`
   **manifest id** — a UUID (`apps/runtime/.../library/LibraryPanel.tsx:124`
   `templateId: manifest.id`). The bridge passes it straight through:
   `caspar-runtime.ts:221` → `command-builder.ts load()` →
   `CG … ADD 0 "<templateId>" 1 "<data>"`. CasparCG's HTML producer needs a real
   page it can fetch (a `file://` under its `template-path`, or an `http://` URL),
   so a bare UUID **404s**. The subsequent `CG PLAY` 202s but the layer is empty;
   `CG UPDATE` then **403s** because there is no loaded producer to update.
2. **Empty field payload.** `loadOntoStack` hard-codes `fields: {}`
   (`LibraryPanel.tsx:155`), and the bridge only ever receives `TemplateInfo`
   **metadata** via `templates.import` (`LibraryPanel.tsx:134`) — never the scene
   or `.vcg` bytes. So even a resolvable template would render with no data, and
   `CG UPDATE` carries `"{}"`.

**Why it was masked:** Phase 2 was integration-tested against `tools/amcp-mock`,
which **blindly 202-acks `CG ADD`** without resolving or rendering a template and
never inspects the data payload — so the 404 (bad template ref) and the empty-payload
path were never exercised.

**Regression test:** extend `tools/amcp-mock` so it no longer blind-acks: it must
**resolve the `CG ADD` template argument** (404 when it isn't a template the mock
"knows" / a loadable page) and surface/flag the **field payload** (so an empty/`"{}"`
data arg is observable). Then add a bridge integration test asserting that a loaded
template results in a `CG ADD` whose template arg is a **resolvable URL/page** and
whose data arg is the item's **real fields** (non-empty), and that `CG UPDATE`
carries the updated fields. The fix design (likely: the bridge serves each
registered template as HTML over its own HTTP endpoint and `CG ADD`s that URL with
the item's real fields) is tracked separately — see the C-001 follow-up.

**Progress (hardware-validated — closed):**

- Phase 1 — `extract-single-file-export` (PR #235): the D-019 single-file export is
  now a shared browser package (`@cg/single-file-export`) the Runtime can import.
- Phase 2 — `deliver-template-html`: the browser produces the self-contained HTML at
  import and ships it over the extended `templates.import`; the bridge **retains** it
  keyed by id (`TemplateRegistry` / `CasparRuntime.templateHtml`). Content delivery +
  retention only — **nothing renders yet** (no HTTP serve, `CG ADD`/fields unchanged).
- Phase 3 — `serve-template-and-render`: the bridge serves each retained template at
  `GET /template/<id>` (loopback local; opt-in routable when CasparCG is remote);
  `CG ADD` references that URL with the item's **real field values** (schema defaults
  plus operator edits, never `"{}"`); the produced HTML inlines the **bundled Persian
  fonts** (Vazirmatn / Exo 2) as base64 so it stays self-contained. The `amcp-mock`
  regression is closed too — it **resolves** the `CG ADD` arg (404 on an unresolvable
  reference) and exposes the data payload, with an end-to-end integration test
  (served URL + real Persian fields). This is the first phase where a `.vcg` actually
  renders on CasparCG.
- Hardware validation — **PASSED** on CasparCG 2.3.2: a real `.vcg` rendered on the
  output with correct Persian (right font, intact shaping) via take; the served
  `/template/<id>` URL loaded (`202`, not `404`); `CG UPDATE` carried real field
  data. B-038's core goal (live content delivery + serve + real fields + render) is
  verified end-to-end, so B-038 is `[x]`.

**Open follow-up (separate, not blocking — B-038 stays closed):**

- Re-deliver each retained template's HTML to the bridge on **reconnect**, so live
  loads survive a bridge restart without a manual re-import (the bridge's in-memory
  store is empty after a bounce). Tracked as a future enhancement, not part of
  B-038's closed scope. **RESOLVED (2026-07-10):**
  `openspec/changes/reconnect-reconciliation` — `WebSocketRuntime` retains every
  delivered `{ template, html }` and re-delivers on reconnect before the snapshot
  re-pull; output-validated live on CasparCG 2.5.0 `69e8ad5` (bridge-only
  restart, page untouched, NO re-import → the fresh `CG ADD` carried the new
  serve port AND the full field payload, and the Take rendered). Scope:
  reconnect-without-reload — a restart of BOTH bridge and page still needs a
  manual re-import until C-011 (persisted `.vcg` bytes) lands.

---

## [x] B-039 — broken playout state model: Load auto-plays, and a Take after Out never re-renders (no re-ADD) ⟨priority: high⟩

> **CLOSED — hardware-validated.** Fixed by `fix-playout-state-model` (PR #241): the
> bridge now chooses `CG ADD` vs `CG PLAY` from per-slot producer state. Confirmed
> live on **CasparCG 2.3.2** (the flag-0 sequence, not just amcp-mock): Load emits
> `CG ADD` with play-on-load OFF and does NOT auto-play (loaded, not on air); Take
> renders with correct Persian; Out destroys the producer (`CLEAR`); a subsequent
> Take **re-ADDs** then `CG PLAY`s and renders again; Update still pushes field
> changes to air.

**Repro:**

1. Run the Runtime **LIVE** against real CasparCG 2.3.2; import a `.vcg` and click
   **Load** to put it on the stack.
2. Watch the CasparCG output: the template appears **immediately** (auto-plays)
   before you click Take.
3. Click **Take** (plays), then **Out**, then **Take** again.

**Expected** (the intended, confirmed model):

- **Load** = `CG ADD` only → the template is _loaded, NOT playing_.
- **Take** = `CG PLAY` → on air.
- **Out** = exit + clear → the producer is gone.
- A **subsequent Take** = a fresh load (`CG ADD` again) then play.

**Actual:**

- Load **auto-plays** — the template is on air before Take.
- Out sends `CLEAR` → the HTML producer is **Destroyed**.
- The next Take sends **only `CG PLAY`** onto the now-empty/destroyed layer → `202 OK`
  but nothing renders. The template never comes back.

**Findings (read-only):**

- **AMCP per verb** — `tools/caspar-bridge/src/command-builder.ts`:
  - load → `CG <ch>-<layer> ADD 0 "<url>" 1 "<data>"` — the `1` is the
    **play-on-load flag (= true)**, so CasparCG plays on ADD. Load emits ONLY this
    one ADD (there is no separate `CG PLAY` on load); the flag is the auto-play. The
    method comment even says "(primed to play)" (`command-builder.ts:42-45`).
  - take → `CG <ch>-<layer> PLAY 0` · update → `CG <ch>-<layer> UPDATE 0 "<data>"` ·
    out → `CLEAR <ch>-<layer>` (destroys the producer).
- **Where load triggers play:** the hardcoded `1` play-on-load argument in
  `CommandBuilder.load` (`command-builder.ts:44`). Origin: the ADR-0006 hardware
  harness validated a load+play-in-one sequence with `1`; the operator UI's
  load/take split needs `0` (load only), with Take's `CG PLAY` doing the play.
- **Producer/slot tracking:** `CasparRuntime` keeps `#slots: Map<itemId, CommandSlot>`
  plus the `LayerManager` allocation, but there is **no tracking of whether a live
  producer exists on the slot** — nothing checks "is a producer loaded here?" before
  `CG PLAY`.
- **Why a retake skips `CG ADD`:** `CasparRuntime.take()` (`caspar-runtime.ts:272`)
  only ever emits `CG PLAY` from `#slots.get(itemId)`. `CasparRuntime.out()`
  (`caspar-runtime.ts:296`) emits `CLEAR` but does **not** clear `#slots`, deallocate
  the layer, or drop OSC interest (only `remove()` does). So after Out the slot
  mapping persists while the producer is destroyed → the next `take()` `CG PLAY`s a
  dead layer and never re-ADDs.
- **The status state machine is descriptive, not prescriptive.** `StackItemStatus`
  (`loaded`/`playing`/`updating`/`exiting`/`idle`/`on-air`/`error`) lives in
  `@cg/shared-schema` (`runtime/item-state.ts`) and is reduced by the `Reconciler`
  (`packages/caspar-client/src/reconciler/reconciler.ts`): `applyIntent` sets
  load→`loaded`, take→`playing`, out→`exiting` (→ OSC `idle`), and only `remove`
  deletes the item. The status drives the **UI**, but it does **not** gate or choose
  which AMCP verb `CasparRuntime` emits — each method emits a fixed verb regardless of
  the item's status, so nothing makes a post-Out Take re-load. After Out the item
  stays in the stack (`idle`, not removed), so the UI still offers Take — which only
  `CG PLAY`s the destroyed slot.

**Regression test:** the gap is exactly what `amcp-mock` hid — it auto-loads an HTML
producer on `CG ADD` and 202-acks a `CG PLAY` after `CLEAR` without modeling that
`CLEAR` destroyed the producer. The fix's regression tests should: (a) assert Load
emits `CG ADD … 0 …` (play-on-load OFF) and the item is _loaded, not playing_, until
Take; (b) teach the mock that `CLEAR`/out destroys the producer, so a bare `CG PLAY`
afterwards renders nothing, and assert a Take-after-Out re-issues `CG ADD` (fresh
served URL) before `CG PLAY`; (c) drive load→take→out→take through `CasparRuntime`
end-to-end and assert the second take re-ADDs then plays. On-hardware re-validation of
the load/take/out/retake cycle closes it.

---

## [x] B-040 — ticker list field (`_tickerTexts`) displays + serializes as "[object Object]" — the Runtime Inspector has no list-field control ⟨priority: high⟩

> **CLOSED — on-air validated.** Fixed by `fix-runtime-list-field-editor`: the
> structured items editor (PR #243) + the multi-line extension
> (`fix/B-040-multiline-list-items` — the per-item editor is an auto-growing
> textarea, so a `\n` in an item's text survives read AND write). The Inspector
> renders a `list` field as an items editor, commits structured `ListItem[]`
> (never `"[object Object]"`), and never flattens multi-line items.
> Operator-validated live on **CasparCG 2.5.0** (`69e8ad5`, 2026-07-07): a ticker
> item edited to two lines incl. Persian renders both lines on air via Update;
> reorder / add / remove reflected on air; plain text fields unaffected. (The
> sticky "updating" badge seen during validation is the separately-filed B-044.)
> Originally surfaced on **real CasparCG**; `amcp-mock` hid it by never
> inspecting the data payload's structure.

**Repro:**

1. Import a `.vcg` whose ticker has a **Data key** (a `list` field, e.g.
   `_tickerTexts`); Load it; select the stack row.
2. In the Inspector, look at the `_tickerTexts` field.
3. Edit/blur that field and watch the bridge `CG ADD` / `CG UPDATE` JSON.

**Expected:** the list field shows a **structured items editor** (as the Designer's
preview form does) and travels as a JSON **array of `{ id, text, … }` objects** in the
`CG ADD`/`CG UPDATE` data, so the ticker renders its items.

**Actual:** the Inspector shows `_tickerTexts` as the literal text
`"[object Object],[object Object]"`; committing it sends that string via
`stack.update`, so `CG UPDATE` ships `"_tickerTexts":"[object Object],…"` (a
stringified array) and the ticker can't render its items.

**Findings (read-only):**

- **Schema:** a ticker Data key is a `list` dynamic field — `ListFieldSchema`
  (`type: 'list'`, `default: ListItem[]`) where `ListItemSchema` is `{ id }` + open
  passthrough fields (`@cg/shared-schema/src/fields.ts`). It is a top-level
  `scene.fields` entry (the R-001 export preflight's `gdd-list-field-limited-clients`
  warning fires only for `field.type === 'list'`).
- **Seed (correct):** `LibraryPanel.loadOntoStack` seeds each field via
  `defaultFieldValue(field)`; for a list that returns `field.default` — the
  **structured array** (`@cg/shared-schema/src/composition-fields.ts:285`). So the
  stack item's list value starts as a real array.
- **Wire (correct when structured):** `CommandBuilder.serialize` is
  `JSON.stringify(fields)` (`command-builder.ts:69`), which preserves the array — so
  the GOOD case (initial Load with the seeded array) ships correct nested JSON, as the
  bridge log showed earlier.
- **The coercion site (where the bad path diverges):** the Runtime Inspector's
  `FieldControl` (`apps/runtime/src/renderer/features/inspector/Inspector.tsx`) has
  branches for boolean/number/color/select/image/multiline and a **default text
  `<input>`** — but **no `list` branch**. A list value therefore hits the default
  text input:
  - _Display:_ `const v = … : String(value)` (`Inspector.tsx:292`) →
    `String([{…},{…}])` = `"[object Object],[object Object]"`.
  - _Wire:_ that input's `onBlur` commits `e.target.value` (a string) via `commit()` →
    `stack.update({ fields: { _tickerTexts: "[object Object],…" } })`; the bridge's
    `update()` merges it into the Reconciler and `CG UPDATE` ships the string, and the
    item's stored value stays a string thereafter.
  - So the divergence from the good path is precisely the Inspector: the missing
    `list` control turns the structured array into stringified text on display AND on
    commit. (The Designer renders the same list field correctly via `ListItemsEditor`
    / `PreviewFieldForm`; the Runtime Inspector simply never got the equivalent.)
- **CG ADD vs CG UPDATE:** the very first `CG ADD` from a fresh Load is correct (the
  seeded array); the `"[object Object]"` reaches the wire once the list field's text
  input is committed (→ `CG UPDATE`) and then persists in the item.

**Regression test:** `amcp-mock` hid this by never asserting the data payload's
structure. The fix's tests should: (a) a Runtime Inspector test asserting a `list`
field renders a structured items editor (not a text input) and never displays or
commits `"[object Object]"`; (b) a field-flow test asserting a seeded list value
round-trips as a JSON **array of objects** through `stack.update` → `CG UPDATE` (and
`CG ADD`), Persian intact — never a stringified `"[object Object]"`.

**Finding (2026-07-07, live session — CasparCG 2.5.0 `69e8ad5`):** the structured
items editor merged in PR #243 **flattens multi-line list items** — the per-item
editor is a single-line `<input type="text">`, whose value sanitization strips line
breaks. An item whose `text` contains a newline (e.g. the original two-line ticker
items) displays with its lines joined, and editing that item commits the flattened
single-line string — the newline is destroyed in the Inspector even though the wire
escaping (B-041) now carries it correctly end-to-end. Fix home: the open
`fix-runtime-list-field-editor` change (multi-line item editing — an auto-growing
textarea preserving `\n` on read and write).

---

## [x] B-041 — special characters (`"`, `\`, newline) in a field value break the live CG UPDATE / CG ADD (broken AMCP escaping) ⟨priority: high⟩ — **live-confirmed 2.3.2 / `4de6d18f`** (2026-07-13), archived: `openspec/changes/archive/2026-07-13-fix-amcp-escaping-v2/`

> **CLOSED — hardware-confirmed on the build that surfaced it.** The escape rule is
> the two-layer inverse (`js-escape+amcp-escape`): backslash, quote and newline now
> survive `CG ADD` **and** `CG UPDATE` **byte-exact** with no parse break and Persian
> intact — validated on real **CasparCG 2.3.2 (build `4de6d18f`)**, the same build
> ADR-0006 was validated against, on 2026-07-13. The rule had already passed on 2.5.0
> (`69e8ad5`); it is now confirmed on BOTH server generations, so the shipped
> canonical quoter needed no adjustment. PR #245's "quotes-only" rule is retained
> below as superseded history — it was disproven on hardware.
>
> Originally surfaced on **real CasparCG 2.3.2** with special-character field values;
> `amcp-mock` hid it (its tokenizer was the exact inverse of our own escaper) and the
> ADR-0006 harness missed it (its probe payloads had no `"` or `\`).

**Repro:**

1. Run the Runtime **LIVE** against real CasparCG 2.3.2; load + take a template.
2. In the Inspector, edit a text field to a value containing a `"`, a `\`, or a
   newline, and click **Update**.
3. Watch the CasparCG output + bridge log.

**Expected:** the field value (any text) reaches `window.update` intact and the
on-air template updates.

**Actual:** the update silently does not apply (template unchanged on air) for
certain characters, even though CasparCG returns `202 CG OK` — bytes accepted, JSON
payload mangled. Character matrix (confirmed live):

| Input in the field value                        | Result                             |
| ----------------------------------------------- | ---------------------------------- |
| `' _ - ^ & * ~ ! @ # $ % = / . ,` (and Persian) | ✅ applies                         |
| `"` (double-quote)                              | ❌ update does not apply           |
| `\` (backslash)                                 | ❌ ODD count fails, EVEN works     |
| newline (`\n`)                                  | ❌ fails (not even line 1 applies) |

**Findings (read-only):**

- **The data arg is double-escaped (JSON, then AMCP).** Both the load and update
  commands build the data argument as `quote(serialize(fields))`
  (`tools/caspar-bridge/src/command-builder.ts:50` for `CG ADD`,
  `command-builder.ts:60` for `CG UPDATE`), where `serialize` is `JSON.stringify`
  (`command-builder.ts:75-77`). So a field value is escaped **twice**: first by
  `JSON.stringify` in the browser (which already turns `"` → `\"`, `\` → `\\`, a
  newline → the two-char `\n`), then again by the bridge's AMCP `escape()`.
- **What `escape()` does** (`packages/caspar-client/src/amcp/escape.ts:21-40`,
  wrapped by `quote()` at `:43-45`): `\` → `\\`, `"` → `\"`, and `\r`/`\n` → a
  space. It does NOT special-case any other control char. Both CG ADD and CG UPDATE
  route through it (the seam comment claims it's the single canonical quoter).
- **The newline branch is dead for this payload.** Because `JSON.stringify` has
  already converted a real newline to the two characters `\` + `n`, `escape()` never
  sees a literal `\n`/`\r` (its `:31-34` space branch never fires for the JSON path).
  Instead the `\` is doubled (`\` → `\\`), so a newline travels as `\\n` on the wire
  — whatever CasparCG then does with `\\n` is the failure (the update doesn't apply).
- **The odd/even-backslash signature ⇒ an escape-layer mismatch.** A correct round
  trip needs CasparCG 2.3.x's AMCP quoted-string un-escaping to be the EXACT inverse
  of `escape()` for `\` and `"`. The empirical "odd backslash count fails, even
  works" / "`"` fails" result is the classic signature that the two do not compose:
  the JSON+AMCP double-escaping leaves a dangling or duplicated backslash after
  CasparCG's un-quote, corrupting the JSON the template then `JSON.parse`s — so the
  update is silently dropped (202, but mangled). The exact divergence between
  `escape()` and CasparCG's real rules is the thing the fix must pin down (single
  source of truth, full coverage of `"`, `\`, control chars).
- **Affects both verbs.** `CG ADD`'s data arg (`command-builder.ts:50`) and
  `CG UPDATE`'s (`:60`) carry the identical `quote(serialize(fields))` payload, so
  both the initial load data and every update are affected.
- **Why amcp-mock hid it.** The mock's tokenizer `readQuoted`
  (`tools/amcp-mock/src/amcp-parser.ts:51-80`) decodes `\"` → `"` (`:58-59`),
  `\\` → `\` (`:63-64`), and `\X` → `X` (`:68`) — i.e. it is the **exact inverse of
  our own `escape()`**. So anything `escape()` produces, `readQuoted` perfectly
  reverses, and the B-038/B-039 integration tests round-trip the payload cleanly;
  the mock encodes the SAME escaping assumption as the bridge, so it can never reveal
  a divergence from real CasparCG. The mock also only RECORDS the decoded string
  (`handlers.ts` `recordCgAdd`/`recordCgUpdate`) — the integration test does the
  `JSON.parse`, which succeeds precisely because `escape()` ↔ `readQuoted` agree. The
  ADR-0006 harness used its own identical `quote()` (`candidates.ts:45`) with
  quote-free/backslash-free payloads (`run.ts:25-26`), so it never exercised this.

**Regression test:** the fix must make `amcp-mock` decode the quoted data arg per
**real CasparCG 2.3.x** rules (not our `escape()`), then `JSON.parse` it and assert
it equals the original object — so a `"`, `\` (odd + even counts), and a newline in a
field value all survive `CG ADD` and `CG UPDATE` end-to-end. Add a unit test for the
canonical escaper covering `"`, `\\`, odd/even backslash runs, newline, and control
chars; and an integration test driving a payload with all of them through the bridge
→ hardened mock → `JSON.parse` round-trip. On-hardware re-validation with a
quote/backslash/newline payload before B-041 closes.

**Progress / corrections (stays `[~]`):**

- Attempt 1 — `fix-amcp-escaping` (PR #245): "quotes-only" (escape `"`→`\"`, leave `\`
  literal). **Confirmed WRONG on real CasparCG 2.3.2.** Hardware: updating `ttt` to
  `New text␊second text` → the template's `JSON.parse` hit
  `Uncaught SyntaxError: Invalid or unexpected token` (a raw newline inside the JSON
  string); `"` and `\` (odd) also still failed.
- Attempt 2 — `fix-amcp-escaping-v2` (investigation/design): a byte-level trace proves
  the **bridge emits the newline as backslash-n (two chars), NOT a raw newline** — so
  the raw newline the template sees is produced by **CasparCG itself un-escaping `\n`
  → `0x0A`**. This **disproves #245's assumption** that CasparCG keeps backslashes
  literal; CasparCG actively processes backslash escapes. Because attempt 1
  (quotes-only) AND the original double-escape both failed, no single hand-derived
  un-escape model fits both data points — so the exact rule is pinned **empirically**
  via an escape-matrix harness on real hardware, then implemented as the single
  canonical quoter, with the mock decoding by the real rule AND rejecting raw control
  chars / un-parseable payloads. See `openspec/changes/fix-amcp-escaping-v2/`.
- Sweep pass 1 **(superseded 2026-07-13)** (2026-07-07, local CasparCG `2.5.0 69e8ad5 Stable`, probe `--sweep`):
  all 7 pre-existing candidates FAIL — the controls reproduce the DP1/DP2 signatures
  on this build — and both two-layer-model candidates PASS every class; winner
  **`js-escape+amcp-escape`** (byte-exact: net JSON backslash → 4 wire backslashes,
  quote → backslash-quote). Status: empirically confirmed on 2.5.0 (`69e8ad5`);
  provisional for 2.3.2, supported by the source-level finding that `v2.3.x-lts`
  and `master` share byte-identical escape semantics in both layers; a 2.3.x
  hardware pass (sweep, or live special-char validation) remains the gate before
  B-041 closes. Details:
  `openspec/changes/fix-amcp-escaping-v2/design.md` → "Hardware sweep results".
  **SUPERSEDED — that gate was DISCHARGED on 2026-07-13**: live-confirmed on real
  CasparCG 2.3.2 (build `4de6d18f`), see the heading and the CLOSED block at the top
  of this entry. The "remains the gate" sentence above is this bullet's status **as
  of 2026-07-07** and is retained as history, not as a live claim. It has now twice
  been read as outstanding by a keyword scan — hence this marker, and the
  current-state-only rule recorded in [[B-076]].
- **Fix implemented + live-validated on 2.5.0 (2026-07-07)** — `fix-amcp-escaping-v2`
  §2–4: canonical `@cg/caspar-client` `escape()` = the two-layer inverse (JSON `\` →
  4 wire backslashes, `"` → `\"`, raw LF/CR carried as `\\n`/`\\r`, never a raw
  control byte); `amcp-mock` decodes CG data args through both emulated layers
  (tokenizer + html_cg_proxy→V8 in `tools/amcp-mock/src/cg-data.ts`) and flags
  raw-control-char / JS-syntax-error / invalid-JSON payloads — the old quotes-only
  emission now FAILS against the mock; full matrix unit + wire + bridge→mock
  end-to-end tests, plus a parity test pinning `escape()` to the winning sweep
  candidate encoder. Live manual matrix on the local CasparCG 2.5.0 (`69e8ad5`):
  `"a quote"`, `\` ×1 and ×3, multi-line via Enter (incl. the original two-line
  ticker items), mixed Persian/Latin — in a plain text field AND ticker list items,
  via BOTH `CG ADD` (fresh Load+Take) and `CG UPDATE` (on-air Update) — all render
  exactly as typed, updates apply, no `Uncaught SyntaxError`. The only remaining gate
  was the 2.3.2 confirmation.
- **CLOSED — 2.3.2 confirmation PASSED (2026-07-13).** Live-validated on real
  CasparCG **2.3.2 (build `4de6d18f`)** — the same build ADR-0006 was validated
  against, and the build the bug was originally reported on. Backslash, quote and
  newline all survive **byte-exact** through both `CG ADD` and `CG UPDATE`, with no
  parse break (`SyntaxError`) and Persian intact. The winning candidate is unchanged
  from the 2.5.0 sweep, confirming the source-level finding that `v2.3.x-lts` and
  `master` share byte-identical escape semantics in both layers — so no code change
  was needed to close. B-041 → `[x]`; `fix-amcp-escaping-v2` archived
  (`openspec/changes/archive/2026-07-13-fix-amcp-escaping-v2/`), its delta folded
  into the `runtime-caspar-bridge` living spec.

---

## [x] B-044 — stack item badge stays "updating" indefinitely after a CG UPDATE (the value DOES apply on air) ⟨priority: high⟩

> **CLOSED — live-validated.** Fixed by `fix-pending-update-completion`: the
> Reconciler parked `updating` (and `exiting`) as resting statuses — the OK ack
> confirmed the intent by identity and nothing could ever transition it again;
> OSC cannot rescue an update (a `CG UPDATE` causes no producer transition, the
> change-tracker suppresses repeated identical values, 1s truth TTL — confirmed
> by a live OSC probe: ~50 datagrams/s in, transitions-only out, no event on
> update), and no timeout existed on any tier. Now transient intents settle on
> their own command's OK ack (update → the evidenced underlying status; out →
> `idle` via its single `CLEAR`), and a lost ack expires within 5 s to the
> explicit `unconfirmed` badge — never a stuck spinner, never fake success.
> Operator-validated live on **CasparCG 2.5.0** (`69e8ad5`, 2026-07-07): update
> on a text field AND a ticker item settles to ON AIR at ack speed with the
> value on air; Out rests IDLE; negative test (CasparCG stopped mid-update)
> landed the explicit unconfirmed/error state within ~5 s and recovered after
> restart. Root cause is NOT build-dependent — no extra 2.3.2 gate beyond the
> standing B-041 one.
> Originally observed in the **2026-07-07 live session** (Runtime LIVE via
> `tools/caspar-bridge` against local CasparCG **2.5.0** `69e8ad5`, post-B-041
> two-layer escaping).

**Repro:**

1. Run the Runtime LIVE against real CasparCG; import a `.vcg`, Load, Take — the
   item is on air.
2. Edit a field in the Inspector and commit → the bridge sends `CG UPDATE`,
   CasparCG replies `202 CG OK`, and the new value renders on the output.
3. Watch the stack row's status badge.

**Expected:** the badge returns to the item's on-air state once the update has
applied.

**Actual:** the badge shows **"updating" indefinitely** — it never settles back —
while the updated value is ALREADY live on the CasparCG output. The stack row
permanently reads as if the update were still in flight.

**Suspected area (unverified):** the pending-update completion signal in the
intent/truth state machine — `Reconciler.applyIntent` sets
`intentStatus = 'updating'` on an update intent
(`packages/caspar-client/src/reconciler/reconciler.ts:245`) and
`truthConfirmsIntent` expects a truth report (`on-air`) to confirm it
(`reconciler.ts:379`); an UPDATE on an already-on-air layer may never produce a
fresh truth/OSC transition to clear the intent. Diagnosis belongs to the fix
change — this entry records the symptom.

**Note:** interacts with R-003 (staged Inspector edits — explicit Update-button
apply); design the pending-update status handling with that item in mind, but they
are separate changes. See also the blur-commit remount hazard recorded in R-003's
Notes (swallowed first click / lost keystrokes) — adjacent Inspector behavior,
not part of this bug.

---

## [x] B-046 — phantom default backup B: spurious split-brain replays, UNBOUNDED journal growth, health churn ⟨priority: medium⟩ — merged via `harden-redundancy-single-and-two-server`, archived

<!-- change: openspec/changes/archive/2026-07-10-harden-redundancy-single-and-two-server/ -->

> **CLOSED — fixed + mock/soak-validated 2026-07-11** (no hardware gate; this
> is redundancy-machinery behavior, fully exercisable against `amcp-mock`).
> Every consequence below was first confirmed with file:line (see the change's
> `design.md`), then fixed via three owner-approved decisions:
> **(1) declared single-server** — `servers.B` and `ConnectionHealth.backup`
> are optional; the bridge default and CLI build only declared servers (new
> `--backup-*` flags); with no B the adapter sends primary-only, refuses
> failover, and has no divergence/split-brain surface; StatusBar shows
> NO BACKUP and disables manual failover.
> **(2) self-bounding `InMemoryJournal`** — 500 entries / 5 min (tunable),
> enforced on append; retention is 10× the divergence window so a corrective
> resend for a briefly-lagged LIVE backup never needs an evicted entry;
> full-history cold-backup rebuild formally belongs to a persistent journal.
> **(3) liveness-gated divergence/replay** — backup-unreachable failures count
> only while the backup believes itself live (healthy/degraded); code-vs-code
> divergences always count; resend/failover-replay skip a dead target.
> Plus: `whenServerHealthy()` = all DECLARED servers healthy; `emitHealth`
> dedupes by effective liveness (churn + primary double-emit gone).
> **Soak record (tools/soak-runner, new `backup` fidelity modes):** `absent`
> and `dead` (the old phantom shape) runs pass under `leakBudgetMb` with ZERO
> mirror-divergence / split-brain-persistent / corrective-resend events and a
> capped journal; `diverging` (LIVE backup, wrong acks) still escalates to
> split-brain + resend; the two-server + scheduled-failover soak stays green.
> Bridge integration: single-server boot is healthy on A alone, playout works,
> health has no backup entry, steady state publishes zero health churn.

> Found during the **B-044 investigation** (2026-07-07/08, subsystem mapping of
> `@cg/caspar-client` redundancy + the default bridge config). Symptom-level —
> consequences derived from code reading; no fix here.

**Repro:**

1. Run the bridge with the default connection (single local CasparCG): server B
   defaults to `127.0.0.1:5251/6251`
   (`tools/caspar-bridge/src/bridge.ts` `defaultConnection()`) — nothing
   listens there.
2. Drive normal playout (load/take/update/out) for a while; watch health events
   and bridge memory.

**Expected:** a single-server setup runs quietly; the redundancy machinery stays
inert (or the config explicitly declares single-server operation).
**Actual (from code, symptom-level):**

- Session B reconnect-loops forever (~4 s cycles at the backoff cap) → ~2
  `healthChanged` publishes per cycle, indefinitely (connection-health UI churn).
- EVERY send records a divergence (backup code −1); every 3rd divergence within
  30 s emits `split-brain-persistent` AND fires a corrective resend replaying
  the ENTIRE ok-journal to the dead backup's queue — each replay rejects and is
  swallowed. Unbounded event noise.
- **`InMemoryJournal` grows without pruning — an explicit MEMORY RISK for a
  long-running bridge process.**
- `whenServerHealthy()` requires BOTH sessions healthy → can never resolve on
  the default config (a test helper today, but a footgun).

**Notes:** the fix space (a declared single-server mode, journal pruning, gating
replays on a live backup) is for the fix change to design.

---

## [x] B-047 — failover triggers keep watching the OLD primary: the "re-bound in failover-complete" listener rebinding doesn't exist ⟨priority: low⟩ — merged via `harden-redundancy-single-and-two-server`, archived

<!-- change: openspec/changes/archive/2026-07-10-harden-redundancy-single-and-two-server/ -->

> **CLOSED — fixed + mock-validated 2026-07-11** (folded into the B-046
> change). Confirmed worse than filed: besides B's death being invisible after
> A→B, the demoted dead A's reconnect churn kept firing `maybeFailover` and
> flipped primary BACK onto the corpse (ping-pong). Fix: no rebinding at all —
> one `state-change` handler bound to BOTH sessions at construction that
> checks `label === currentPrimary` AT EVENT TIME (rebinding-in-
> failover-complete would have recreated the bug class with a race window).
> The PRD regression below was written FIRST and confirmed failing on the
> pre-change adapter, then green: failover A→B, kill B → auto trigger fires
> (from B, to A); A's churn triggers nothing.

**Finding (symptom-level):** the comment at
`packages/caspar-client/src/redundancy/redundancy-adapter.ts:402-406` claims the
primary state-change listener is "re-bound in failover-complete", but no
rebinding code exists. After a failover A→B the auto-failover triggers still
watch session A's state — a subsequent auto failover would key off the wrong
server.

**Regression test (for the fix):** drive a failover A→B against two mocks, then
kill B and assert the auto trigger fires (today it would not — it is still bound
to A).

---

## [x] B-048 — first Load after a bridge restart renders NOTHING when the previous session's output is still on the layer; Update-then-Take recovers ⟨priority: medium⟩

> **CLOSED — resolved-by-R-007, live-discriminated 2026-07-10 (CasparCG 2.5.0
> `69e8ad5`).** The clean-main reproduction attempt did NOT reproduce: the
> caspar log (19:01–19:07) shows every `CG ADD`/`PLAY` arriving and acking
> cleanly — the fresh session's Load at 19:06:34 adopting + ADDing on the new
> serve port, the Take at 19:07:51 sending ADD+PLAY back-to-back — the served
> page probed `200` (629,685 B), and zero `[html_producer]` errors were logged
> all day. Combined with the code proof below (the documented READY-after-Update
> badge is only reachable if no take intent ever reached the bridge, and the
> 2026-07-07 UI predated AsyncButton), the original symptom was a **UI-layer
> first-click loss fixed by R-007** (`8cd03ef`, #266). The mechanical
> bridge-restart faces the entry surfaced (templates forgotten; producers
> orphaned) were fixed by `reconnect-reconciliation` and **output-validated
> live 2026-07-10** (adopt-CLEAR → fresh ADD → first Take renders; reconnect
> re-delivery with zero manual re-import at 21:00:01). Root cause is
> build-independent (server-source parity v2.3.x-lts/master) — no extra 2.3.2
> gate beyond the standing B-041 one. Residual, separately tracked: [[B-053]]
> (pre-existing badge wart), C-011 (persisted layer-aware reconciliation).
>
> Originally operator-observed on **2026-07-07** during the B-044 live session
> (bridge built from the fix branch, pre-review-hardening — behavior ≡ `main`).
> The hypotheses below are preserved as filed; the Progress note at the bottom
> records their verdicts.

**Repro (operator-confirmed precondition):**

1. Have a template ON AIR from a bridge session, then kill that bridge with the
   output still on the layer.
2. Start a fresh bridge session; refresh the page; re-import the `.vcg`.
3. FIRST Load of the template onto the stack; then Take.

**Expected:** the template renders on the CasparCG output on Take.
**Actual:** the first Take does nothing visible on the output; pressing Update
flips the item to "ready"; the NEXT Take then plays correctly. Out (or Remove) +
re-adding the template also cures it — everything works for the rest of the
session.

**Operator evidence (2026-07-07, informal):** a previous bridge session had been
killed with its output still on the layer; in the fresh session the first Take
did nothing visible, Update flipped the item to "ready", and the next Take
played. No caspar log lines were captured during that repro — the protocol
below carries the log-capture step.

**Candidate hypotheses (UNVERIFIED):** (a) a STALE producer from the previous
bridge session still occupies the layer, pointing at the dead previous
template-serve port — the B-044 OSC probe log shows the serve port changes on
every bridge restart and a producer already live on layer 60 BEFORE any Load in
the fresh session; the first `CG ADD`/`PLAY` then interacts with the stale
producer until a `CLEAR` destroys it; (b) an import/serve race — the first
`CG ADD`'s URL fetched before template delivery/serve completed (`202` but the
page 404s → blank producer); (c) CEF cold-start on the first html-producer
spawn racing `CG PLAY`. The operator's behavioral detail suggests — unverified —
that the bridge's own state machine believes the item never reached playing
(consistent with an Update from a non-on-air state settling the item to
"ready" under the B-044 completion semantics).

**Repro protocol for whoever picks this up:** leave output on air → restart the
bridge → refresh + re-import → first Load/Take → capture the caspar log during
it: does the `CG ADD`/`PLAY` arrive? Any 404 / CEF error?

**Cross-reference:** the registered B-038 open follow-up (re-deliver retained
template HTML on reconnect). Bridge-restart amnesia has TWO faces — templates
forgotten AND on-air producers orphaned; a reconnect/startup reconciliation
should consider both (see also C-010).

**See also:** [[B-053]] — the false-ON-AIR badge observed during this bug's live
validation was root-caused as a PRE-EXISTING first-load-per-layer wart (proven
on `main` in a clean worktree), NOT part of this bug's mechanism.

**Progress (2026-07-10 — `openspec/changes/reconnect-reconciliation`; the
closure verdict at the top of this entry supersedes the "stays `[~]`"
status):** diagnosis (code + CasparCG server source
v2.3.x-lts AND master + bridge→mock repros) **eliminated all three hypotheses**:
(a) DISPROVEN — the html cg producer registers `reusable_producer_instance =
false` on both branches, so `CG ADD` always creates a fresh CEF producer at the
new URL and `stage.load()+play()` REPLACES the orphan (no hijack; the fresh URL
IS fetched); (b) ruled out — `templateImport` registers synchronously within
the WS message event and `startServing()` completes before `createBridge`
returns; (c) unsupported — `play()` JS is QUEUED until `OnLoadEnd` (2.3), only
dropped on master's `OnLoadError` (network-level, implausible here). The
reconciler math further shows the reported READY-after-Update badge is only
reachable if **no take intent ever reached the bridge** — a UI/link-layer miss
on the pre-R-007 UI (no AsyncButton existed then; no concrete defect found).
What the orphan DOES provably cause (mock-reproduced): a fresh session reuses
the identical layer, and the orphan's OSC routed to the fresh item painted a
**false ON AIR — even on a failed load**. Fixed by the change: browser
re-delivers retained templates on reconnect; the bridge rejects unregistered
loads (`unknown-template`) instead of blind-ADDing an unservable URL (real
CasparCG 202s + renders a silent blank); the first `CG ADD` per layer per
bridge process is preceded by an adopt-`CLEAR` issued before slot/OSC-interest
binding (no blind startup clear — on-air safety). Live phase re-runs the exact
repro on current main FIRST, with caspar log + bridge access log, to
discriminate: no `CG PLAY` received ⇒ resolved-by-R-007; `CG PLAY` + GET 200 +
blank ⇒ CEF/page timing (new PRD entry); reproduces ⇒ diagnose further.

---

## [x] B-053 — badge rests at a FALSE ON AIR after the FIRST Load onto a layer (per bridge process): change-tracker first-observation + "non-empty producer ⇒ on-air" + sticky last publish ⟨priority: medium⟩

> **[x] 2026-07-10** — fixed in `fix-false-onair-badge` (archived): intent-side
> play evidence (`played`, set by the take intent), raw producer observation,
> read-time truth derivation (`present → played ? 'on-air' : 'loaded'`); bridge
> `updateRequest` parity (`'on-air' || 'playing'`); StackRow gating corrected +
> asserted. **Live-validated by the operator on CasparCG 2.5.0 (`69e8ad5`)**:
> first Load per layer rests READY across and beyond the 1 s window (no flash,
> no revert-and-stick, second fresh layer clean), Take → ON AIR, Out → IDLE,
> B-044 settle + UNCONFIRMED unchanged. Full diagnosis + accepted residuals in
> the archived change's `design.md` ([[B-056]] filed for the backup-only
> orphan window).

> Operator-observed **2026-07-10** during the reconnect-reconciliation live
> session (CasparCG 2.5.0 `69e8ad5`); root-caused the same day with captured
> reconciler publish sequences and **CONFIRMED PRE-EXISTING on `main`**
> (`6d1e3b0`, clean worktree — identical sequences with none of the
> reconnect-reconciliation code). NOT a Face-2/adopt-CLEAR regression: the
> adopt-CLEAR rides the same "first ADD per layer per process" trigger —
> correlation, not causation (the CLEAR is sent before OSC interest binds and
> a cleared layer emits nothing, so it contributes zero events).
> (Originally filed as B-051; renumbered — main's PR #270 consumed B-051/B-052
> for the designer pen-path fixes. B- numbers are global.)

**Repro (deterministic, bridge→mock `disableOsc` AND live):**

1. Fresh bridge; import a `.vcg`; **Load** it (the first `CG ADD` onto its
   layer this process). → the stack badge shows **ON AIR** with no Take, and
   STAYS there.
2. Remove the item; Load again (same layer). → badge correctly rests READY.
3. Load an additional item (fresh layer). → false ON AIR again.

A page refresh changes nothing — the state is **bridge-process**-lifetime. In
the field this reads as "first Load of every newly-imported template": each new
template's first Load allocates a fresh, never-tracked layer; a
delete-and-reload reuses a tracked one.

**Mechanism (file:line):**

- At `CG ADD`, real CasparCG stage-loads AND stage-plays the new producer
  (server source, `cg_proxy.cpp` create_new branch) — the page stays hidden
  until `play()`, but the layer's foreground producer flips `empty → html`
  and OSC reports it.
- The OSC pipeline runs interest → rate-limit → change-tracker
  (`packages/caspar-client/src/osc/transport.ts`); dropped events never prime
  the tracker, and its per-`(kind,channel,layer)` memory lives for the whole
  bridge process (`osc/change-tracker.ts:14-21`; reset only on session
  resync).
- The FIRST `producer='html'` observation on a layer passes the tracker →
  `Reconciler.applyOsc` maps ANY non-empty producer to truth `'on-air'`
  (`reconciler/reconciler.ts:197`) → published. The 1 s truth TTL decays
  internally but **nothing re-publishes** — the last published state (ON AIR)
  sticks on the badge until the next command.
- `remove()` drops OSC interest BEFORE its CLEAR (`caspar-runtime.ts`), and a
  cleared layer goes silent on real CasparCG (`stage.clear` erases it) — so
  the tracker keeps `'html'` for that layer forever, and every LATER ADD's
  `'html'` report is suppressed as a repeat → no truth publish → later loads
  rest READY.

**Evidence:** captured `stackChanged` sequences (bridge→amcp-mock,
transition-only `disableOsc` mode — the periodic tick re-broadcasts erased
layers as `'empty'`, which real CasparCG never does, masking the asymmetry):
first load `["on-air"]`, re-load same layer `["loaded"]`, fresh layer
`["on-air"]` — **identical on the reconnect-reconciliation branch and on
`main@6d1e3b0`**.

**Fix space (for the fix change to design):** stop mapping a producer's mere
existence to `'on-air'` without play evidence (the deeper wart —
B-044/C-010-adjacent); and/or re-publish when fresh truth decays past
`truthTtlMs`; and/or reset the layer's tracker key when the bridge itself
empties a layer. The regression test must run the mock transition-only
(`disableOsc`) — tick mode cannot show the suppression asymmetry.

**Cross-reference:** found while live-validating
`openspec/changes/reconnect-reconciliation` ([[B-048]]); judged out of that
change's scope after the main-worktree discriminator proved it pre-existing.
Until fixed, judge Load/Take pass-fail by the OUTPUT, not the badge, right
after a first Load.

---

## [x] B-054 — `#loaded` (producer-existence bookkeeping) goes stale across a CASPARCG restart: the next Take `CG PLAY`s an empty layer (202 no-op, blank take) ⟨priority: medium⟩ — **live-confirmed on CasparCG 2.3.2 / `4de6d18f`** (2026-07-13)

> RESOLVED (2026-07-11) by `openspec/changes/archive/`
> `clear-loaded-on-session-reconnect`: `#wireAdapter` subscribes each declared
> session's `'healthy'` (fires only on a completed AMCP reconnect cycle, never
> on degraded→healthy OSC recovery) and wholesale-clears `#loaded`, so the
> next Take re-verifies via the B-039 re-ADD and renders. `#adopted` is
> deliberately kept (restarted layers are empty — the skipped adopt-CLEAR is
> a no-op).
>
> **LIVE SMOKE — PASSED on CasparCG 2.3.2 (build `4de6d18f`), 2026-07-13.** The
> gap noted at fix time ("mock-validated only; NO live smoke ran — no CasparCG on
> the dev machine") is now CLOSED on real hardware: restarting CasparCG under a
> live, on-air item and then taking again **re-renders** the template — the
> session's `'healthy'` transition clears the stale `#loaded`, the B-039 re-ADD
> fires, and the take is no longer a blind `CG PLAY` onto an empty layer. The
> symptom-level bug found by code reading is confirmed fixed against the real
> server, not just the mock.

> Found by code reading during the `reconnect-reconciliation` review
> (2026-07-10); symptom-level, NOT yet reproduced live. The inverse amnesia of
> B-048: there the BRIDGE restarted and forgot the server's state; here the
> SERVER restarts and the bridge's memory becomes a lie.

**Repro (expected, from code):**

1. Run LIVE; import, Load, Take — item on air (`#loaded` holds the itemId).
2. Restart **CasparCG** (not the bridge, not the page); the AMCP session
   reconnects on its own (`ServerSession` backoff → handshake → healthy).
3. Click Take (or Take after the reconnect settles).

**Expected:** the take re-renders the template (a fresh `CG ADD` first, since
the restarted server has NO producers).
**Actual (from code):** `CasparRuntime.#loaded` still contains the itemId —
it is only ever cleared by `out()`/`remove()`, never on an AMCP session
reconnect (`tools/caspar-bridge/src/caspar-runtime.ts`; the session reader
confirmed no reconnect hook touches it). So `take()` skips the B-039 re-ADD
branch and sends a bare `CG PLAY` onto the restarted server's EMPTY layer →
`202` blind ack → nothing renders. The `#adopted` set has the same staleness
but is harmless in this direction (the restarted server's layers are empty —
an unnecessary re-adopt is skipped, and a skipped CLEAR on an empty layer
changes nothing).

**Fix space:** clear `#loaded` (per session, or wholesale) when a session
transitions through disconnected→healthy — or fold into the C-010/C-011
reconnect reconciliation, which would re-derive producer existence from known
state instead of trusting process-lifetime memory.

**Cross-reference:** [[B-048]] (the mirrored bridge-restart amnesia), C-010
(dead resync wiring), C-011 (persisted layer-aware reconciliation — the
structural home for a real fix). The B-044 settle semantics are unaffected
(this is verb CHOICE, not badge lifecycle).

---

## [x] B-056 — `load()` proceeds when the adopt-CLEAR didn't land on the PRIMARY: an unadopted live orphan can render under an owned slot with no UI tell ⟨priority: low⟩

> Found by the adversarial design review of the B-053 fix (2026-07-10,
> `fix-false-onair-badge` design.md §8); symptom-level, NOT reproduced live.
> A multi-fault reconnect-window residual, ACCEPTED as out of the B-053 fix's
> scope because the mitigation touches redundancy fault-mode semantics.

> **Implemented 2026-07-12** — archived as
> `openspec/changes/archive/2026-07-12-owned-slot-occupancy-warning/` —
> as **Option B — an additive operator warning**; the loud-fail alternative
> was REJECTED (it would change what a backup-only load means in every
> redundancy fault mode; `load()`'s proceed-after-adopt is frozen
> reconnect-reconciliation behavior and is byte-for-byte unchanged).
> Detection is load-time and one-shot: `#adoptLayer` now RETURNS the
> primary-landing result it always computed, and when adoption missed the
> primary while the primary's passive OSC occupancy tap OBSERVED the target
> layer non-empty (fresh, R-009 staleness contract), the bridge raises an
> owned-slot warning `{channel, layer, itemId, producer, since}` over new
> channels `layers.owned-occupancy` / `layers.owned-occupancy-changed` —
> R-009's channels/sweep/`clearLayer` owned-refusal untouched. Unknown
> occupancy (primary OSC silent — a restarted machine boots empty)
> deliberately does NOT warn: observed-occupancy only (alarm-fatigue
> rationale + residuals in the change's `design.md` §3/§6). The Runtime
> banner renders the warning as a distinct strip naming the channel-layer
> AND the item, with NO Clear button — the remedy is Out/Remove of the item.
> Resolution is event-driven and provable only: a bridge CLEAR for that
> layer landing on the current primary (`ok && onPrimary` — the adoption
> sites), the item's removal (handoff to the R-009 sweep once the primary is
> observable), or a `setConfig` server swap. A Take does NOT resolve it (it
> may `CG PLAY` the surviving orphan once the primary reconnects), and
> nothing is ever auto-cleared.
>
> **Mock/integration-validated** (red-first):
> `tools/caspar-bridge/tests/owned-slot-occupancy.integration.test.ts` —
> mirror pair with server A dialing a DEAD AMCP port while a real mock emits
> A's OSC (machine alive, link down), foreign producer planted via a second
> AMCP client, `autoFailoverEnabled: false`: warning surfaces naming
> channel-layer + item AND the load is unchanged (accepted, slot bound, own
> `CG ADD` reached the backup); unknown occupancy → no warning; out
> backup-only → persists; revived primary + out → resolves; remove while
> primary down → resolves; take → does NOT resolve. Plus schema, jsdom
> banner, MockRuntime-parity, and Playwright (`owned-occupancy.spec.ts`)
> coverage.
>
> **Live smoke — PENDING hardware**: mirror pair on real CasparCG; take the
> PRIMARY's AMCP down while the backup stays up (machine keeps rendering /
> pushing OSC); leave a graphic on a layer via a 2nd AMCP client; Load an
> item onto that layer → the warning names the channel-layer + item (and no
> Clear button is offered); restore the primary and Out the item (or Remove
> it) → the warning resolves.

**Scenario (from code):** in mirror-sync with the primary's AMCP link briefly
down (no failover — e.g. `autoFailoverEnabled: false`), a load's adopt-CLEAR
and its `CG ADD` can both succeed BACKUP-ONLY (`#send` returns `ok` on a
backup win). `#adoptLayer` correctly refuses to mark the layer adopted
(`tools/caspar-bridge/src/caspar-runtime.ts` — adoption requires
`ok && onPrimary`), but `load()` **proceeds anyway**: it binds the slot + OSC
interest and ADDs onto a layer where a previous bridge session's VISIBLE
orphan producer may survive on the primary. When the primary's OSC
flows/reconnects, the orphan's `html` report routes to the fresh, never-taken
item.

**Consequence:** post-B-053 the item honestly reads READY (a producer exists,
no play evidence) — but there is NO tell that foreign content is live on the
primary output under the item's own layer; `unexpected-onair` cannot fire (the
slot IS owned). Pre-B-053 the same window showed a sticky, MISATTRIBUTED
ON AIR ("your item is on air" — it wasn't; the orphan was) — also a lie, just
an attention-drawing one. A subsequent Take would `CG PLAY` the orphan.

**Fix space:** bail/flag the load when adoption did not land on the current
primary (a loud failed load, mirroring the unknown-template guard — but this
changes what a backup-only load means in every redundancy fault mode, hence
its own change); or surface owned-slot occupancy observed BEFORE the item's
own ADD ack as an operator warning.

**Cross-reference:** [[B-053]] (the mapping fix whose review found this),
`openspec/changes/reconnect-reconciliation` (the adopt-CLEAR mechanism and its
spec mandate "the fresh item never shows `on-air` from the orphan's OSC before
take" — this entry is about the missing WARNING, not the badge), B-054 (the
adjacent server-restart staleness), C-011 (persisted layer-aware
reconciliation — the structural home).

## [x] B-067 — template import builds the operator field form from flat root fields only; nested-composition fields are invisible ⟨priority: high⟩ — fixed + archived (`openspec/changes/archive/2026-07-13-runtime-nested-composition-fields`); **LIVE-CONFIRMED on CasparCG 2.3.2 / `4de6d18f`** (2026-07-13)

**Repro:**

1. In the Designer, author a template whose bound elements live in a NESTED composition (e.g. any D-119 two-comp starter: the data-key fields migrate to the footprint comp per D-025), export the entry comp as `.vcg`.
2. Import it in the Runtime app and open the item's Inspector.

**Expected:** the operator sees and edits the template's data keys (name/label/headlines …), matching the Designer preview form, which aggregates nested-instance fields under the instance's namespace (`aggregateCompositionFields`, D-025) — as does the `.vcg` GDD manifest (`packages/vcg-format/src/gdd.ts`).
**Actual:** `produceTemplateDelivery` builds `TemplateInfo.fields` from the ROOT `scene.fields` only (apps/runtime/src/renderer/features/library/templateDelivery.ts:127). A scoped per-composition export whose fields live on a nested comp yields `fields: []` — the Inspector shows nothing to edit, even though the playing template fully supports namespaced updates (`values[instanceName]`, `applyScopedFieldValues`).
**Env:** Runtime app (mock + bridge paths share the import); found 2026-07-12 during D-119.
**Notes:** Fix direction: aggregate at import (reuse `aggregateCompositionFields`) and teach the Inspector to render namespace groups + emit NESTED payloads (`{ instanceName: { fieldId: value } }`) — the runtime side already consumes them. Scope it with the Runtime operator-positioning work that will also flip D-119 starters to footprint-comp export.

**FIXED** — `openspec/changes/runtime-nested-composition-fields`. The filed fix direction was confirmed by recon and taken verbatim: aggregate at import with the EXISTING `aggregateCompositionFields` (the same collector `packages/vcg-format/src/gdd.ts` already uses — so `TemplateInfo` and the package's own GDD manifest can no longer disagree about which fields exist), render namespace groups in the Inspector, and emit the nested payload.

No field identity was invented and **no AMCP/wire change was needed**: the instance-name namespace is already the canonical address (the GDD advertises it, `bindings.ts` resolves `values[child.name]` at render, `CommandBuilder.serialize()` is a plain `JSON.stringify` and is depth-transparent, and the Designer preview already drives it). The one real blocker was plumbing, not identity — `FieldValuesSchema` was a flat `z.record(string, FieldValue)`, so a nested payload was **rejected by Zod at the IPC boundary**; it is now recursive (a strict SUPERSET, so every existing flat payload still validates, which is why the bridge / Reconciler / journal / Designer needed no edits).

The Reconciler was deliberately NOT touched (B-044 + reconnect-reconciliation stay frozen): the Inspector applies the COMPLETE field set, so each namespace arrives whole and the existing shallow top-level merge stays correct. `buildApplyPayload` deep-merges so an edit to one nested field cannot drop that comp's un-edited siblings.

**Guards (red-first):** with the pre-fix root-only line restored, 4 of the 6 new unit tests go red (`expected 0 to be greater than 0` — i.e. the operator-visible "No fields."). The chain is asserted hop by hop with the real components: import (a REAL D-119 starter through the Designer's actual export projection) → the group key equals the composition instance name derived independently from the scene → nested seed → staged edit → applied payload nests under `{ instanceName: { fieldId } }` with siblings intact → the real `CommandBuilder`'s `CG UPDATE` data argument JSON-parses back to that exact object. Rendering of that shape is already pinned by `template-runtime/tests/nested-fields.test.ts` + `starter-templates/src/starter-render.test.ts`. E2E: `apps/runtime/tests/e2e/nested-composition-fields.spec.ts` imports a real starter `.vcg` through the operator UI.

**LIVE CONFIRMATION — PASSED on CasparCG 2.3.2 (build `4de6d18f`), 2026-07-13:**

- [x] Import a D-119 two-comp starter in the Runtime → the Inspector shows the nested fields as a labelled group (NOT "No fields.").
- [x] Edit a nested field → **Update** → the change renders on air (proves the value reached the binding under its namespaced key — the nested payload survives the wire end-to-end).
- [x] A flat, single-composition template still behaves exactly as before (regression).

## [x] B-070 — Inspector "Update" on an idle/producerless item is refused ("Not accepted"), and the refusal permanently poisons the item (zombie `pending` → R-011 `setPosition` blocked for life) ⟨priority: high⟩ — **live-confirmed on CasparCG 2.3.2 / `4de6d18f`** (2026-07-13), archived: `openspec/changes/archive/2026-07-13-reconnect-reconciliation/`

**Repro:**

1. Runtime, connected to a real bridge. Load an item onto the stack, then take it OUT (or reconnect the bridge) — the item now reads `idle`.
2. Select it in the Inspector, edit a field (e.g. Channel/Tag). The dirty chip appears.
3. Press the inner **Update**.

**Expected:** the staged edits commit (R-003: Update is the ONLY commit path) and ride the next Take to air.
**Actual:** "Not accepted." Nothing commits on the wire. Worse, the item is now permanently poisoned: it rests at `idle (pending)` forever, and because R-011's `setPosition` refuses while `item.pending`, the operator can never reposition that item again.

**Root cause (NOT the obvious one):** the refusal is NOT the `slot === undefined` guard — `pending` is derived from a non-terminal `intentStatus`, and every intent early-returns BEFORE `applyIntent` when the slot is missing, so `idle (pending)` PROVES the item has a slot. The refusal is `return { accepted: ok }` with `ok === false` because **real CasparCG `403`s a `CG UPDATE` on a layer with no cg producer**. On a slotted item, status `idle` IS the OSC report that the producer is empty — the UI was displaying the exact reason for its own refusal.

`CG UPDATE` needs a **PRODUCER, not AIR**, and `update` was the ONE playout verb with no producer-state rule: `take` re-ADDs when the producer is gone (B-039), `setPosition` checks the same bookkeeping, `update` fired blind. (This also rules out "make Update on-air-only": a _loaded_ item has a live producer, is not on air, and updates fine.)

The poisoning is a second, independent defect: a failed ack moved only `ackedStatus`, leaving `intentStatus` at the transient `updating` forever, so `pending` never cleared. Not update-specific — a failed take zombied identically.

**Env:** Runtime + caspar-bridge; long-standing since #227 (2026-06-29) — NOT a regression from R-011 / B-066 / D-119. Found 2026-07-13.

**Why no test caught it:** `MockRuntime.update` accepted an update on ANY item (no producer model at all), and every bridge integration test staged `load → take → update` — i.e. always ON a live producer. The producerless path existed in neither, so the R-003 Inspector UX was built and tested against semantics the real bridge does not have.

**Fixed by:** `openspec/changes/reconnect-reconciliation` §7 (folded in: that change introduced the mock's `403`-on-producerless-`CG UPDATE` but never gave `update` a bullet in the prescriptive-verb requirement it rewrites — B-070 is its missing half). `update` now branches on producer existence (`#loaded`): live producer → `CG UPDATE` byte-identical (ADR-0006 frozen); no producer → commit the fields, send nothing, settle the intent in-process (B-044), report `accepted` — the next take's B-039 re-ADD carries them to air. A failed ack now settles terminally, `stack.update` answers with an `errorCode` (mirroring `stack.take`), and the Runtime shows the real reason instead of "Not accepted.".

**LIVE CONFIRMATION — PASSED on CasparCG 2.3.2 (build `4de6d18f`), 2026-07-13** (the same build ADR-0006 was validated against):

- [x] Basic repro: load → out → edit fields → **Update** succeeds (no "Not accepted"); take → the edit renders on air.
- [x] A refused update (force an AMCP error) no longer poisons the item: it settles, and `setPosition` still works afterwards.
- [x] **The decisive question (ADR-0006 caveat) — ANSWERED: `CG UPDATE` LANDS on a play-on-load=off producer.** ADR-0006 validated `CG UPDATE` against a producer ADDed with **play-on-load = 1** (playing), but B-039 later flipped load to **play-on-load = OFF**, leaving no in-repo hardware proof for the ADDed-but-never-PLAYED case. Confirmed live: loading an item WITHOUT taking it, editing fields and pressing Update sends `CG UPDATE` and it applies — CasparCG does **not** `403` a loaded-not-playing producer. So **producer-existence means LOADED**, not "loaded AND playing": the shipped `#loaded` branch is correct as written, the loaded-not-playing case does NOT need the no-send commit path, and no code change followed from this confirmation. The ADR-0006 open question is closed.

---

## [x] B-072 — Runtime PositionPicker forgets an applied position override on reselect: the UI lies about what is on air, and an innocent re-Apply then REVERTS the correct position to the manifest default ⟨priority: high⟩ — **live-confirmed on CasparCG 2.3.2 / `4de6d18f`** (2026-07-13)

**Repro:**

1. Runtime. Select a loaded item, pick a position override in the Inspector's POSITION picker, press **Apply position**, then **Play**.
2. The graphic renders on air at the NEW position — correct.
3. DESELECT the item, then RESELECT it.

**Expected:** the picker shows the override that is actually applied.
**Actual:** the picker shows the template's **manifest DEFAULT** again. The override is live on air but the UI has forgotten it.

**Root cause (NOT a persistence failure — the override is never lost):** the bridge stores the override for the item's whole life and honours it on every ADD. `CasparRuntime` holds `#positions: Map<itemId, Position>`; `setPosition` writes it, `#sendAdd` reads it on EVERY `CG ADD` (load AND take's B-039 re-ADD) to append `?pos=&dx=&dy=` to the resolved served URL, and only `remove()` deletes it. What R-011 never built is the **read-back**: `stack.set-position` answers `{ok, reason?}` — write-only — and the two channels that carry item state to the SPA (`stack.snapshot`, `stack.state-changed`) carry `StackItemState`, whose shape had **no `position` field**. The item's state structurally could not carry the override home. So `PositionPicker` seeded from the only source it had — `defaultPositionOf(item.templateId)`, the manifest default recorded at `.vcg` import, keyed by templateId and blind to overrides. The picker is mounted `key={pos-${itemId}}`, so deselect→reselect remounts it and re-seeds from that default.

**Why it is high, not cosmetic:** the picker is not a read-only display — it has an Apply button, and after a reselect it displays a value that is NOT what is applied. An operator who reselects, sees the default, and re-presses **Apply position** — reasonably concluding the override never stuck — sends the manifest default and **silently destroys the correct on-air position**. A stale display plus one innocent re-Apply reverts a good placement. Blast radius = destruction of operator state.

**Env:** Runtime + caspar-bridge; long-standing since R-011 (#288) — the on-air half always worked; only the read-back was missing. Found 2026-07-13.

**Why no test caught it:** every position test asserted the WIRE (does the ADD URL carry the query?) or the picker's seed from the manifest default. Nothing asserted what the picker shows for an item that HAS an override, because item state could not carry one — so the gap was invisible to both the bridge suite and the DOM suite. `MockRuntime` stored overrides too but never published them either, so the offline path modelled the same blind spot.

**Fixed by:** `openspec/changes/archive/2026-07-13-position-override-readback` (archived). `StackItemState` gains an OPTIONAL `position`; the bridge joins `#positions` into the state at the two renderer-facing emit sites (`stackSnapshot()` and the `stackChanged` push) — ownership does not move, and delete-on-remove is inherited for free; `set-position` republishes so an IDLE item's override (which sends nothing to CasparCG) still reaches the SPA; the picker seeds from `item.position ?? defaultPositionOf(item.templateId)`. No new IPC channel and no renderer-side store (the B-070 anti-pattern). No AMCP verb, no payload change — the B-064 serve contract and ADR-0006 escaping are untouched.

**LIVE CONFIRMATION — PASSED on CasparCG 2.3.2 (build `4de6d18f`), 2026-07-13** (most of this was verifiable in-app without CasparCG, since the on-air half already worked and this is a read-back fix; the live check is recorded anyway):

- [x] Apply a position → **Play** → the graphic renders at the override (regression guard: the on-air half still works).
- [x] Deselect → reselect → the picker **SHOWS the override**, not the manifest default — the read-back lands.
- [x] Re-Apply without changing anything → the on-air position is **unchanged** (NOT reverted to the default) — the blast-radius guard holds.

## [x] B-074 — no test can catch a channel the UI calls but the bridge never routes, nor a MockRuntime that has drifted from the real bridge ⟨priority: high⟩ — merged (#297, `052863a`): both structural gaps are now guarded — channel-route coverage (a channel the UI calls but the bridge never routes fails the gate) and MockRuntime↔bridge parity (drift between the mock and the real bridge is caught, so the offline path can no longer model semantics the bridge does not have — the blind spot behind [[B-070]]). Focused fix, no change dir. Confirmed shipped by the 2026-07-13 `[~]` audit

Two **structural** gaps in the suite (not a single defect): both are the _reason_ recent
runtime bugs shipped, and both would let the same class ship again. Filed as one item
because both are closed by the same idea — a guard that compares two surfaces that must
agree, instead of testing each in isolation.

**Gap (a) — unrouted channels are invisible.**
**Repro:** delete `route(StackSetPositionChannel, ...)` from `tools/caspar-bridge/src/bridge.ts`
and run the full suite.
**Expected:** something goes red.
**Actual (pre-fix):** **nothing goes red.** Recon confirmed it. The renderer reaches the bridge
over a WebSocket, so an unrouted channel is not a type error — the bridge just answers
`unknown channel: stack.set-position` to a call no test makes. This is exactly the shape of the
[[B-072]] / R-011 `stack.set-position` failure: the channel was declared and called in the UI
while the bridge half was, from the suite's point of view, free to not exist.

**Gap (b) — MockRuntime drifts from the real bridge.**
The Runtime SPA is developed against `MockRuntime`, so UX gets built on mock semantics the real
bridge does not have. Twice now: [[B-070]] (the mock **accepted** `update` on an idle/producerless
item; the bridge **refuses** it) and [[B-072]] (the mock lacked the position **read-back** the bridge
performs). Nothing compared the two, so each divergence was found on air.

**Fix — two guards, each verified against the real bug it would have caught:**

- `tools/caspar-bridge/tests/route-coverage.test.ts` — enumerates the channels `@cg/shared-ipc`
  actually **exports** (no hand-maintained list to drift) and asserts `buildRoutes()` covers every
  one the _runtime_ owns. Designer-only namespaces (`projects.` `assets.` `sharedImages.` `export.`
  `preview.`) are an explicit, default-**deny** exemption: anything outside it must be routed, so a
  new runtime channel is covered the moment it is exported. Also guards the reverse (a route keyed
  on a name no channel exports is dead code) and keeps the exemption list honest.
  **Proof it works:** deleting the `stack.set-position` route now fails with
  `expected [ 'stack.set-position' ] to deeply equal []`.
- `apps/runtime/tests/mock-bridge-parity.test.ts` — asserts the two surfaces the renderer depends on
  agree, **without real AMCP/sockets**: (1) every backing method `buildRoutes()` calls on
  `CasparRuntime`, plus the 8 emitters `wirePublishes()` subscribes to, exists on **both**
  `CasparRuntime` and `MockRuntime` (the list is anchored to the real runtime first, so it cannot
  drift into fiction); (2) `createMockBridge()` and the real `WebSocketRuntime` expose the **same**
  `RuntimeBridge` method tree (walked recursively; `WebSocketRuntime` is built with an inert injected
  socket, so nothing connects); (3) driving the mock through `load → setPosition` republishes a
  `StackItemState` carrying the applied `position` on **both** `stackSnapshot()` and the `stackChanged`
  emission, and the item parses against `StackItemStateSchema`.
  **Proof it works:** reintroducing the B-072 divergence (mock stops merging `position`) fails with
  `expected undefined to deeply equal { anchor: 'bottom-left', ... }`.

**Source impact:** two **additive exports** only — `buildRoutes` (caspar-bridge) and `createMockBridge`
(runtime platform) were module-private and are now exported for the guards. No behavior change, no
AMCP verb, no channel or schema change.

**Env:** `@cg/caspar-bridge` + `@cg/runtime`. Found while reviewing why B-070/B-071/B-072 all shipped green.

---

## [ ] B-077 — the rundown never enforces a dynamic field's `pattern`: a malformed value (bad email/time/phone) is accepted without a word and goes to air ⟨priority: medium⟩

Found during the D-059 session (which made `pattern` **authorable** in the Designer via friendly
validation presets). D-059 is not the cause — this is a **pre-existing** gap in the operator-facing
Runtime and is filed separately: `field.pattern` is **never read anywhere in `apps/runtime/src`**.
The only "pattern" hit in the whole app is an unrelated code comment
(`apps/runtime/src/renderer/features/inspector/Inspector.tsx:418`, "adjust state during render
pattern").

**Repro:**

1. In the **Designer**, give a dynamic text field a `pattern` — e.g. pick the **Email** preset
   from D-059 — and export the `.vcg`.
2. In the **Runtime** app, load that template into the rundown and select the item.
3. As operator, type a value that clearly violates the pattern (`not-an-email`, `99:99`, `abc`).
4. Hit **Update** / Apply.

**Expected:** the operator is **warned** that the value doesn't match the field's declared pattern —
a per-field error/tint, consistent with how the Designer's `PreviewFieldForm` already surfaces it
(`role="alert"` on the offending row).

**Actual:** no validation at all. Nothing is read, nothing is shown, nothing is flagged. The value is
staged, applied, and sent to CasparCG — a malformed email/time/phone **goes on air** unchallenged.

**Where it's missing (traced):**

- **Value entry — `FieldControl`** (`Inspector.tsx`, ~307-411). The `text` (~400-410) and
  `multiline` (~384-395) branches are a bare `input`/`textarea` calling `onStage(value)` on every
  keystroke: no regex test, no error, no block. Sibling branches DO read their constraints —
  `NumberField` reads `min`/`max`/`step` (~451-453), `select` reads `options` — but **nothing reads
  `pattern`, `minLength`, or `required`.**
- **The value still ships.** staged → `applyDraft.ts` (~16-21) → `window.cg.stack.update({ fields })`
  with no validation gate anywhere on the path.
- **The IPC boundary won't catch it either.** `FieldValuesSchema`
  (`packages/shared-schema/src/fields.ts` ~111-141) accepts any `z.string()`, so a pattern-violating
  string validates cleanly, crosses the boundary and reaches CasparCG. (Correct as designed — the
  payload schema carries values, not per-field constraints — but it means there is no backstop.)

**DECISION (owner, this session) — WARN-ONLY, NOT BLOCKING.** The rundown SHOWS a per-field mismatch
warning but **STILL allows Apply/Update to send the value**. Rationale: during live playout an
over-strict regex must never stop a graphic from reaching air — the cost of a blocked lower-third is
far higher than the cost of a malformed one. **Warn, don't gate.** Recorded explicitly so the
implementation does not build a blocking gate: `applyDraft` / `stack.update` stay ungated.

**Scope:**

- Read `field.pattern` in `FieldControl` and render a per-field warning mirroring the Designer's
  `PreviewFieldForm` affordance (per-field message + tint; a header summary is optional).
- Do **NOT** gate `applyDraft` / `stack.update`. No schema change — `pattern` already exists and
  already reaches the Runtime.
- Spec: likely a `## MODIFIED` on the Runtime inspector/fields capability.

**Proposed direction — lift `validateField`, don't rewrite it (resolves the `required`/`minLength`
question):** the Designer **already has the exact validator this needs** —
`validateField(field, value): string | null` at
`apps/designer/src/renderer/features/fields/PreviewFieldForm.tsx:497`. It already covers
`required`, `minLength`, `maxLength` **and** `pattern` (including the `try/catch` that treats an
invalid regex as a field-config issue, not a value error), and it already returns operator-ready
strings (`Required`, `Min N characters`, `Doesn't match <pattern>`). It is **app-local**, so the
Runtime cannot import it (cross-app import; the lint tiers forbid it).

Recommendation: **lift `validateField` into a shared package and consume it from both apps.**
`@cg/shared-schema` is the natural home — it already owns `DynamicField` / `FieldValue`, the helper
is pure over exactly those two types, and **`apps/runtime` already depends on it**. This makes the
open design question moot: `required` and `minLength` come along **for free**, so the Runtime gets
constraint-consistent warnings in one move rather than a pattern-only special case, and the two apps
cannot drift into two different notions of "invalid".

**Constraints are enforced inconsistently today** (the real shape of the problem — `pattern` is just
the loudest instance):

| Constraint                         | Enforced where                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `maxLength`                        | **truncated at render** (`packages/template-runtime/src/bindings.ts` ~125-126, by code point) |
| `min` / `max` / `step`, `options`  | by **control construction** (number input bounds; select can only offer valid options)        |
| `pattern`, `minLength`, `required` | **nothing** — not in the Runtime, not at the IPC boundary                                     |

**Nuance worth recording — it's only OUR runtime that ignores it.** `pattern` **is** exported into
the GDD (`packages/vcg-format/src/gdd.ts` ~179, ~188), so a third-party MOS client consuming our
template can enforce it. The constraint is published and honored downstream; our own operator app is
the one that drops it.

**Precedent for warn-only:** even the Designer's `PreviewFieldForm` is warn-only today — an invalid
field shows a `role="alert"` message and a "N fields need attention before this looks right on air"
callout, but the **Update button still applies the value**. So warn-only is not a compromise invented
here; it is the house behavior this item extends to the Runtime.

**Env:** `apps/runtime` (Inspector / `FieldControl`). Reproduces on latest `main`. Runtime-only —
no Designer change beyond (optionally) re-pointing it at the lifted helper.

**Notes:** Builds on **D-059** (which made `pattern` authorable). Filed as a BUG, not a feature: the
fields already work, the correctness check is missing. This entry is the filing only —
implementation is its own task, on `dev` like everything else.

## [x] B-079 — a FAILED take is outranked by stale OSC: the row badges ON AIR for a `CG PLAY` that never reached CasparCG ⟨priority: high⟩ — merged (#312, `fix/offline-mock-safety`) + archived: `openspec/changes/archive/2026-07-18-runtime-failed-take-truth/`

The second, independent path to a false ON AIR (found while tracing [R-006](runtime.md)'s
live incident — this one needs no mock, and it is reachable on real hardware).

`Reconciler.reconcileStatus()` consults OSC truth **above** the ack:

```ts
const fresh = this.freshTruth(rec);
if (fresh !== null) return fresh; // OSC wins
if (rec.ackedStatus !== undefined) return rec.ackedStatus;
```

and `freshTruth()` derives `rec.played ? 'on-air' : 'loaded'` — where `played` is set at
**intent** time (B-053's deliberate contract), before any wire confirmation.

OSC is bound **independently of AMCP**: `ServerSession` binds it once for the session
lifetime, _before_ the connect loop, and keeps it bound across every failed AMCP cycle; the
bridge feeds it to the Reconciler with no health gate. So producer evidence outlives the
ability to command the server.

**Repro:** AMCP link dead (or the send otherwise rejected) while OSC still arrives, and any
producer sits on the item's layer — an orphan, or the producer from a `CG ADD` that landed
before the drop. Press PLAY.

**Expected:** the item does not claim air — the `CG PLAY` never reached CasparCG.
**Actual:** `applyIntent('take')` sets `played = true`; the send is rejected →
`ackedStatus = 'error'`; `freshTruth` sees producer-present + `played` → returns `'on-air'`;
`reconcileStatus` returns it **without ever consulting the failed ack**. Published as
`{ status: 'on-air', pending: false, errorCode: 'amcp-send-failed' }` — solid red ON AIR,
and `StackRow` never renders `errorCode`. The failed ack is recorded and then outranked:
B-044's unconfirmed discipline is not broken here, it is **bypassed** by the OSC branch.

**Fix:** a failed take retracts the play evidence **it** claimed — `applyIntent('take')`
records the prior evidence and a failed ack (or an expiry) restores it. Scoped deliberately:
a failed re-take of a genuinely on-air item still reads `on-air`, because a false
`loaded`/`idle` would HIDE a live graphic — the more dangerous direction, and the one this
file's own doctrine names. A blanket "error outranks OSC" short-circuit was rejected for
exactly that reason.

**Also fixed here:** `take` armed **no** expiry (`#armExpiry` was called for update/out
only) and `expireIntent` refused to expire anything but `updating`/`exiting` — so an
unsettled take rested on its optimistic claim **forever**, with nothing to bound it. A take
now arms the same bounded timer; the expirable predicate is "still in flight"
(`ackedStatus === undefined`), NOT `intentStatus === 'playing'`, because a settled _update_
legitimately rests at `playing` and must never be expirable (B-044).

**Frozen, verified unchanged:** B-053's read-time derivation (producer present but never
taken still reads `loaded`), B-070's failed-ack settlement, B-072's position read-back.

---

## [x] B-080 — the StatusBar sits on "Loading…" beside a green ● LIVE until the operator refreshes: every bridge snapshot is pulled ONCE at mount, and nothing re-pulls it when the link comes up ⟨priority: medium⟩ — merged (#321, `8b92d60`), no change dir

A display-subscription regression from **R-006 ([#312](https://github.com/yasermostafaee/cg/pull/312))**,
found live: start the Runtime before the bridge, then start the bridge. The link indicator
goes green **● LIVE**, the stack takes and shows ON AIR, data flows — and the footer's
health pill stays on **"Loading…"** for the whole life of the page. A full refresh clears it.

**Root cause — the invariant #312 removed, and the six hooks still leaning on it.** Every
`window.cg` snapshot hook (`useConnections`, `useStack`, `useLock`, `useOrphans`,
`useOwnedOccupancy`, `useTemplateIndex`) does a **one-shot** `fetch().then(setState)` in a
`useEffect(…, [])` and then relies on its publish channel for everything after. That was only
ever correct because `createRuntimeBridge` guaranteed a **settled** backend at mount: the boot
probe either connected (`live`) or handed the renderer the **mock** — and either way the
mount-time pull resolved.

R-006 deleted the mock fallback (rightly — it is what put a green "PRIMARY A HEALTHY" beside
a graphic that was not on air). An unreachable-at-boot bridge now mounts the **live**
`WebSocketRuntime` in `disconnected`, where `#invoke` **refuses every request** by design.
So the mount-time pull **rejects** — unhandled, silently — and nothing ever re-pulls it:

- the bridge publishes `connections.health-changed` only when health **CHANGES**
  (`wirePublishes` forwards `healthChanged`; it pushes no snapshot on connect), and
- `WebSocketRuntime.#resync()` re-pulls stack/health/lock only when `reconnected` is true —
  i.e. on a **RE**-connect, never on the first open.

`useConnections` therefore holds `null` forever → `StatusBar` renders its `health === null`
branch → "Loading…", next to a `useLink()` pill that correctly reads LIVE (link status IS
pushed, on every transition). A refresh fixes it because the fresh mount finally pulls while
the link is `live`. Same defect, quieter symptom, in the siblings: the stack can sit **empty**
on a live link while the bridge holds retained items, until the next push happens to arrive.

**Why no test caught it:** every StatusBar test and the whole Playwright harness mount against
an **already-settled** bridge (`link.status() === 'live'`, `health()` resolves). A fresh mount
is precisely the refresh that masks the bug — the suite could only ever see the healed state.

**Fix:** tie the pull to the **link**, not to the mount. `useBridgeSnapshot` (new, shared)
re-pulls on every transition into a usable link, skips the pull while `disconnected` (a
refusal there is the contract, not an error — and never an unhandled rejection), and keeps
pushes authoritative: a pull still in flight when a publish lands is **dropped**, so a slow
round-trip can never overwrite fresher state with staler state. The six hooks now sit on it.

**Frozen, verified unchanged:** this is a display-subscription fix **on top of** R-006's
connection-state model, not a change to it. The `disconnected`/`live`/`offline-mock` model,
the refuse-while-disconnected contract, the NOT CONNECTED / TEST MODE banners and the
test-mode door are all untouched — `createRuntimeBridge`, `WebSocketRuntime` and the bridge
have **no diff**. Regression test mounts DISCONNECTED and drives the transition on the live
root (no remount).

---

## [x] B-081 — the footer keeps a confident green "PRIMARY A HEALTHY" after the bridge DROPS, beside "NOT CONNECTED — NOTHING CAN REACH AIR" ⟨priority: high⟩ — merged (#321, `8b92d60`) with [[B-080]], no change dir

The mirror of [[B-080]], found in the same live session and fixed with it. B-080 is the
footer failing to react to `disconnected → live`; this is the footer failing to **distrust**
what it already has on `live → disconnected`. Same footer, same connection-state model,
opposite direction — and this direction is the dangerous one.

**Repro:** connect the Runtime to the bridge, then stop the bridge.
**Expected:** the server-health pills stop asserting a health they can no longer read.
**Actual:** they keep rendering the last snapshot as a confident **green ● PRIMARY A
HEALTHY**, indefinitely, directly beneath R-006's red **NOT CONNECTED — NOTHING CAN REACH
AIR** banner. Only a refresh clears it.

**Root cause — not a missing subscription; a missing INVALIDATION.** Unlike B-080, the
StatusBar _does_ re-render on the drop (it already called `useLink()`, and the banner appears
on the same transition — the subscription was never the problem here). The bug is that it
kept treating the last `ConnectionHealth` as current. Server health only ever reaches the
Runtime **through** the bridge (the AMCP handshake + OSC). The moment the bridge is gone we
have no channel by which health could be known at all — so the last snapshot is not "still
true", it is **unverifiable**, and it ages with every second the link stays down.

This is precisely the failure mode **R-006** was filed to kill, one surface over: a green
HEALTHY pill sitting next to an alarming truth, and **the reassuring claim wins**. R-006 fixed
it for the mock ("⚠ NO SERVER — SIMULATED"); the same pill was still lying whenever the link
merely dropped.

**Fix:** health is trustworthy only while the link is. While `disconnected`, the pills read a
muted **UNKNOWN** (word AND color — a green ● dot is a claim too), and the last-known reading
survives only in a tooltip that says so in as many words ("Last known before the link
dropped: HEALTHY"). On reconnect, real health resumes — no refresh (B-080's re-pull). The
gate is the LINK, never "a state I would rather not show": a genuine DEGRADED on a live link
keeps its own word and color, which the spec pins.

**Frozen, verified unchanged:** the connection-state model is untouched (this reads it, it
does not change it) — `createRuntimeBridge`, `WebSocketRuntime` and the bridge have **no
diff**. The `strategy` pill stays as-is: it is CONFIG, not health, and does not go stale with
the link. R-006's banners and test-mode honesty (`⚠ NO SERVER — SIMULATED`) are unchanged and
still asserted by their own specs.

---

## [x] B-082 — offline, every **Load** lands the row in ✗ ERROR: a load is not an on-air action, but it still ATTEMPTED the pre-roll `CG ADD` and reported the dead link as a broken item ⟨priority: high⟩ — code merged (#327, `e44e5eb`); the REOPENED black-layer window was fixed under [[B-100]], and this entry's ONLY owed gate — real-CasparCG check #1 — was discharged in the ONE consolidated hardware session, owner-verified 2026-07-22. No change dir

With the bridge up but **PRIMARY A OFFLINE**, pressing **Load** on a library template puts
the item on the stack and immediately paints it **✗ ERROR** / "Not accepted" — every row,
every time. But a Load is **not** an on-air action: it adds the item to the operator's
stack. Nothing reaches air. The only true statement was "the server isn't there"; the row
said "this item is broken".

**Root cause — NOT the R-006 guard over-reaching.** `#linkDown()` ([#312](https://github.com/yasermostafaee/cg/pull/312))
was already narrow and still is: its only three call sites are `take`, `update` and `out`,
the verbs that must reach the wire. It never touched `load`. The ERROR came from one step
further down. `load()` ran to completion and issued its pre-roll `CG ADD`; on a dead AMCP
link `#send` throws, the Reconciler honestly acks the failure — and a failed ack is
`ackedStatus = 'error'` with `errorCode: 'amcp-send-failed'`. Reproduced exactly:

```
LOAD RESULT = {"accepted":false}
SNAPSHOT    = [{ "itemId":"item1", "status":"error", "errorCode":"amcp-send-failed", … }]
```

**Fix — skip the pre-roll, do not defer it.** When no declared server is reachable there is
nothing to pre-roll, so `load()` no longer attempts the `CG ADD`. The item keeps the
`loaded` its intent already set, with no failing ack to knock it into ERROR. Nothing is on
air to hide (no server is reachable), so the Reconciler's "never claim `idle`/`loaded` over
a live graphic" doctrine is intact.

Crucially this is **not** the deferral R-006 forbids — nothing is queued for later delivery.
The item simply has no live producer, which is the **same condition every item is in after a
reconnect** (`#loaded` is per-server and cleared on drop). B-039's lazy re-ADD already covers
exactly that case: `take`/`update` re-issue the `CG ADD` before the `CG PLAY`, pulling the
template and the **current** fields from the Reconciler at the moment of use rather than
replaying a stored command. So an item loaded while the server was down **plays normally**
once the link is back — and until then the on-air verbs stay **refused**.

**Frozen, verified unchanged:** offline safety is NARROWED, never removed — PLAY/TAKE,
UPDATE and OUT are still refused with `errorCode: 'disconnected'` while no server is
reachable, R-006's four refusal tests pass untouched, and no command is queued. No AMCP verb
is added, the `CG ADD` → `CG PLAY` order is preserved, and the quoter/verb sequence is not
touched. `#linkDown()`'s "no declared server is reachable" predicate (B-056's mirror-pair
case) is unchanged.

**REOPENED 2026-07-20 — a code trace found a CLEAR-then-nothing window this fix can open.** This
entry reads as a UI fix, but the change also lands in
`tools/caspar-bridge/src/caspar-runtime.ts` (+19), and the gate on the skip is
`if (this.#linkDown()) return { accepted: true };` (`caspar-runtime.ts:647`), where `#linkDown()`
is `sessions.every((s) => s.state !== 'healthy')` (`:959`).

**`#linkDown()` is NOT "the AMCP link is dead". It is "no session is `healthy`" — and `degraded`
is not `healthy`.** A session enters `degraded` on **OSC silence alone**, with the AMCP socket
untouched: `if (this.currentState === 'healthy' && sinceOsc > this.oscDegradedAfterMs) { … transitionTo('degraded', …) }`
(`packages/caspar-client/src/session/server-session.ts:311`, default threshold 3000 ms). The
caspar-client says so in as many words — `/** A session whose AMCP axis is believed up: healthy, or degraded (OSC-silent). */`
above `isLiveState()` (`packages/caspar-client/src/redundancy/redundancy-adapter.ts:505`), which
returns true for BOTH. **So the client's own "AMCP is up" predicate and the bridge's `#linkDown()`
disagree, and `#linkDown()` is the stricter one.** OSC silence and AMCP health are different
signals — [[B-094]] is exactly "a server answers commands but cannot be heard", and [[B-030]]
records the converse.

**The failure sequence.** With a single declared server that has gone OSC-silent for >3 s while
its AMCP socket still works:

1. `#linkDown()` → **true** (the only session is `degraded`, not `healthy`).
2. `load()` allocates a layer. Nothing stops it: C-014's quarantine only skips layers with a
   FRESH non-`html` observation, and `allocation fails OPEN on silence, deliberately opposite to clearLayer's refusal`
   (`caspar-runtime.ts:1796`). Under OSC silence there ARE no fresh observations, so the
   protection is absent in precisely the state that triggers this.
3. `#adoptLayer` (`:603`) runs and calls
   `await this.#send(this.#builder.out(slot), …)` (`:1740`) — **an unguarded CLEAR**. It carries
   no `#linkDown()` check, and neither does `#send` (`:1893`) nor
   `RedundancyAdapter.send` (`redundancy-adapter.ts:162`) nor `sendJournalReplay`, which goes
   straight to `primarySession.queue.enqueue` (`:314`). The AMCP axis is up, so **the CLEAR
   reaches the wire and destroys the resident producer.**
4. Line `:647` then returns early and **skips `#sendAdd`**.

**Result: CLEAR-then-nothing — the layer goes BLACK.** Pre-fix the same path was
CLEAR-then-ADD, which left the new template loaded on the layer. Black is not "safer" than the
new template; on air it is worse. **R-015 does not cover this** — its clearing-refusal-on-silence
guards the operator's `clearLayer` (`:1230`), and `:1797` records that the adopt path is
_deliberately_ the opposite, failing open.

**What was wrong with the previous `[x]` (2026-07-20, superseded same day).** It rested on the
change being "purely subtractive" — true of `#sendAdd` in isolation — plus the claim that the
adopt-CLEAR "runs before the check and is untouched". Both halves are individually correct and
the conclusion still does not follow: leaving a destructive step in place while removing the
constructive step that FOLLOWED it changes the net on-air effect of the pair. Subtractive is not
the same as safe when what you subtract is the repair.

**Gates — ALL DISCHARGED as of 2026-07-22; this is why the item is now `[x]`.** The code was
merged (#327, `e44e5eb`); the verification below was the last thing outstanding, and the trace
above — a code reading, not an observation when written — has since been confirmed on hardware:

1. **Real-CasparCG check of the OSC-silent load — DONE, owner-verified 2026-07-22 in the ONE
   consolidated hardware session; do NOT schedule it again.** That session (checklist, now all
   ticked: `openspec/changes/archive/2026-07-22-runtime-amcp-probed-liveness/tasks.md` §6)
   discharged this check together
   with [[B-100]], [[B-101]] and both [[C-014]] on-air validations, in one visit. The check as
   specified: drive a server
   to `degraded` by stopping OSC while
   leaving AMCP up (B-094's condition), put a graphic on the layer, then Load onto it. Observe
   whether the layer goes black. This cannot be settled by the mock: `amcp-mock` is what the
   existing `disconnected-refusal.integration.test.ts` runs against, and that test exercises the
   fully-disconnected case, not `degraded`. **It is the SAME code path and the same hardware
   session as [[B-100]]** — one run discharges both, and B-082 should be re-read against that
   run's result rather than given its own booking.
2. **The fix — NOW OWNED BY [[B-100]], not by this entry.** The underlying defect has since been
   filed properly as a predicate mismatch with its own blast radius, acceptance criterion and fix
   options; it is not a B-082 remainder. This entry keeps only the record that B-082's shipped
   change is what exposed it.

**Why this stayed `[~]` rather than being reopened as a defect of its own (2026-07-20; the
`[x]` verdict in the heading supersedes the "stays `[~]`" status below).** The
CLEAR-then-black window is a real on-air bug, but it is NOT rooted in B-082 — the adopt-CLEAR and
the predicate both predate it. B-082's contribution was to remove the ADD that had been masking
the window. That defect now lives at [[B-100]] (the predicate mismatch) with [[B-101]] (the
OSC-silent reconnect loop that makes the state permanent). B-082 stays `[~]` for its own owed
verification only, and must NOT be scheduled as separate fix work — fixing B-100 is what closes
the black-layer path.

**Update 2026-07-21 — the CLEAR-then-nothing window is now FIXED under [[B-100]]** (change dir
`runtime-reachability-predicate`): the predicate is corrected to reachability and `load()` gates
the adopt-`CLEAR` and the pre-roll `CG ADD` on ONE evaluation, so the pair is atomic. B-082 STAYED
`[~]` at that point: its owed **real-CasparCG check #1** was the SAME physical session as
[[B-100]]'s owed hardware verification — one run discharges both — and this entry said not to flip
it until that run happened.

**Update 2026-07-22 — that run happened, and B-082 is now `[x]`.** The ONE consolidated hardware
session was performed and every check passed, discharging this entry's check #1 alongside
[[B-100]], [[B-101]] and both [[C-014]] validations. The condition the 2026-07-21 note set is met,
so the flip above is the one it authorised, not an override of it.

**Scope of the reopening — what is NOT in doubt.** The operator-facing symptom this entry was
filed for (every offline Load painting ✗ ERROR) is genuinely fixed, and the fully-disconnected
case is sound: with no socket at all, the adopt-CLEAR cannot land either, so nothing is
destroyed. The defect is confined to the `degraded`/OSC-silent window where AMCP still delivers.
[[B-083]], merged in the same PR, is untouched by this and stays `[x]`.

---

## [x] B-083 — Library names render ONE LETTER PER LINE: two rigid `nowrap` buttons take 63% of the row and the name's `overflow-wrap: anywhere` lets it collapse to a one-character min-content ⟨priority: high⟩ — merged (#327, `e44e5eb`), no change dir

In the left **Library** panel the template names wrap **per character** — "پ / ن / ل" stacked
vertically, 3–5 lines tall for a single name. The operator cannot read the list.

**Root cause — measured, not guessed** (real browser, seeded starters):

|                                   | width        |
| --------------------------------- | ------------ |
| Library row                       | 214px        |
| `Load` + `Remove` (both `nowrap`) | **134.75px** |
| what's left for the name          | **53.25px**  |

The row was a `1fr auto` grid with the name in the `1fr`. The `auto` track is sized to the
**max-content** of `itemActions`, and `.cg-btn` is `white-space: nowrap`, so the two buttons
are **rigid** — they never shrink. `#306` added the second (`Remove`) button into that same
track, roughly doubling it (~60px → ~135px) inside an unchanged **240px** column and
squeezing the name's track to 53px. `overflow-wrap: anywhere` did the rest: unlike
`break-word`, `anywhere` **lowers the element's intrinsic min-content size to a single
glyph**, so nothing stopped the collapse and the name had no choice but to wrap one letter
per line.

Note the popular suspect is **not** the cause: `itemBody` already has `min-width: 0`, so this
is not the classic missing-`min-width:0` flex/grid overflow trap. Nor is the disconnected
banner squeezing the panel — it is a sibling **row above** the shell's column, so it can only
consume height, never width.

**Fix.** No rule _inside_ that structure could fix it — the buttons are rigid, so the `1fr`
track can never exceed ~53px while they sit beside it. The row therefore **reflows**: the
name takes the row's full width and the actions sit under it, right-aligned. That costs
nothing elsewhere (the alternative, widening the 240px Library column, steals width from the
canvas and the stack). `overflow-wrap` becomes **`break-word`**, deliberately not `anywhere`:
both break a token too long for its line, but only `anywhere` lowers min-content to one glyph
— `break-word` keeps it at the longest word, so a squeezed container can never again cascade
into per-character wrapping, while a pathological unbroken token still cannot overflow.

**Why it shipped:** nothing asserted **geometry**. Every library spec checked text and
visibility, and a one-letter-per-line name is still perfectly "visible" with the right text
content. The regression test is therefore a **measuring** one (`library-title-wrap.spec.ts`):
it pins the name box's real width and its real line count, and it fails on the pre-fix build
with exactly the measured `53.25px`.

## [x] B-085 — the whole template-LIBRARY class (import / list / display / remove / field-schema) is refused when the SPA↔bridge WS is down, because `WebSocketRuntime.#invoke` blanket-rejects EVERY channel and the library has NO local ownership — even though none of these operations command CasparCG ⟨priority: high⟩ — merged (#330, `fix/B-085-browser-local-library`) + archived: `openspec/changes/archive/2026-07-15-runtime-local-library/`

Umbrella for the connection-state recon's Tier-B bug family. **None of these operations
command CasparCG** — they read/verify/register template metadata + HTML — yet all fail when
the local **bridge process** (not CasparCG) is unreachable.

**Root cause — two coupled facts:**

1. **The blanket transport guard.** `WebSocketRuntime.#invoke` (`apps/runtime/src/platform/WebSocketRuntime.ts`)
   rejects **every** channel with `BridgeDisconnectedError` ("Bridge disconnected — command
   rejected. Not sent to CasparCG.") when `#status !== 'live'`. `templates.import` /
   `templates.list` / `templates.remove` / `templates.get` are Tier-B registry channels — the
   bridge answers them from its in-memory `TemplateRegistry` with **no `#linkDown()` check and
   no AMCP verb** (`tools/caspar-bridge/src/caspar-runtime.ts` `templateImport`/`templateList`/
   `templateRemove`) — but the transport guard cannot tell a registry read from an on-air
   command and refuses them identically. The error copy even says "Not sent to CasparCG" about
   an import that was never going to CasparCG.
2. **The library has no browser-local ownership.** The registry's source of truth lives in the
   bridge process; the SPA only caches the last `templates.list()` in React state. So when the
   WS is down there is nothing to read, register into, or serve from — and on a fresh
   disconnected mount the Library shows empty ("No templates yet") and never re-pulls
   (`LibraryPanel.refresh` isn't link-aware, unlike `useBridgeSnapshot`/`useTemplateIndex`).

**Observed instances (all one class):**

- **Import .vcg offline** → the local verify + unpack + single-file HTML export all SUCCEED,
  then the one `bridge.templates.import({template,html})` round-trip rejects and the panel
  shows `"file.vcg" Bridge disconnected — command rejected. Not sent to CasparCG.` — nothing is
  registered, the library stays empty. (Primary.)
- **Library empties on disconnect and never repopulates** — mounted-while-disconnected → empty,
  no re-pull on reconnect, no persistence across reload.
- **Remove-from-library refused offline** (`templates.remove` — a pure registry op).
- **Stack rows lose their names offline** — `useTemplateIndex` early-returns
  `if (link === 'disconnected')`, so the registry name-join is skipped (rows read "Unnamed
  template").
- **Inspector field-schema degraded offline** — `templates.get` rejects; its `.then` has no
  `.catch` (unhandled rejection), so `info` stays null and the Inspector falls back to
  type-inferred flat fields (loses labels / select options / nested groups).

**Fix (deliberate architecture, per CLAUDE.md "No backend, file-based storage" / `@cg/storage`
doctrine):** give the template **LIBRARY** browser-local ownership. Import = verify + unpack +
HTML export + register **locally** (persisted via `@cg/storage`); list / display / remove /
field-schema read local state — all work with the bridge fully down and survive page reload.
The bridge becomes a **delivery/serve target reconciled on (re)connect** — generalizing the
existing `WebSocketRuntime.#retained`/`#resync` re-delivery so CasparCG can still load a
template when an on-air command eventually fires. Conflict policy: **local-wins** (the browser
is the source of truth). The transport guard is narrowed **structurally** — `templates.*` no
longer round-trip `#invoke` at all, so they can't be refused — while Tier-C on-air channels
(`stack.take`/`update`/`out`/`setPosition`/`load`/`clearAll`/`removeAll`) STILL reject when the
link is down. **Frozen:** every on-air refusal (R-006 `#linkDown`, StackRow on-air disables,
Apply-position lock, B-070/B-072/B-056/B-079) is untouched — this narrows the SPA↔bridge guard
off the registry channels and moves the library local; it does not weaken on-air safety.

**Scope: LIBRARY only.** The **stack** stays bridge-owned (inherent playout state in the
Reconciler). Load (add-to-stack) still needs the bridge — B-082 covers the common
CasparCG-down/bridge-up case; when the bridge PROCESS is down, Load still refuses (acceptable,
out of scope). Also folds in: the stack-row **Remove** inconsistency (gated consistently with
PLAY/UPDATE/CLEAR — removal is bridge-owned stack state, so it genuinely needs the link) and the
`useTemplateIndex` / Inspector offline degradations.

The two-connection distinction the guard conflated: **SPA↔bridge WS** (`#status`,
`disconnected` = bridge process unreachable) vs **bridge↔CasparCG AMCP** (`#linkDown()`,
`disconnected` = CasparCG unreachable, bridge still up). This class of bug lives entirely in the
first; the frozen on-air safety lives entirely in the second.

## [x] B-086 — the stack keeps showing red "● ON AIR" after the CasparCG link drops: a broadcast-safety lie (the UI asserts on-air the wire no longer backs) ⟨priority: high⟩ — merged (#336, `fix/B-086-onair-honest-linkloss`) + archived: `openspec/changes/archive/2026-07-18-runtime-onair-honest-linkloss/`

When the CasparCG connection drops (CasparCG died, or the link briefly dropped —
**indistinguishable from our side**, confirmed by testing), on-air stack items keep rendering
the confident red **● ON AIR** badge indefinitely. The UI is asserting a state the wire can no
longer verify. This is the same species of lie [[B-081]] killed for the health pills, one
surface over — the reassuring claim wins, and the operator trusts it.

**Root cause (recon, verified against source):** the Reconciler merge ladder
(`packages/caspar-client/src/reconciler/reconciler.ts` `reconcileStatus`) is
`freshTruth → ackedStatus → intentStatus`. Sticky for two compounding reasons:

1. The fallback floor `'playing'` renders **identically** to `'on-air'` (both red "● ON AIR",
   `theme.ts` `airStateVisual`/`badgeTone`), so when `freshTruth` decays off stale OSC the badge
   does not visibly change.
2. The Reconciler is **event-driven** — `emitChange` fires only from `applyOsc`/`applyIntent`/
   `applyAck`. When OSC goes silent nothing re-publishes, so the **last on-air freezes on
   screen**, and nothing wires session-state → the Reconciler.

**Fix (owner-locked direction — mirrors [[B-081]]'s HEALTHY→UNKNOWN idiom), bridge/reconciler-side:**

- On CasparCG **link-loss** (a session leaving `'healthy'` — the same signal `#linkDown()` gates
  on, AMCP TCP close or OSC silence): re-publish every on-air/played item as **UNVERIFIABLE** —
  a NEW `'unverified'` `StackItemStatus`, label **"WAS ON AIR"**, tone **muted grey**
  (`colors.textMuted` — the health-UNKNOWN tone, NEVER red, NEVER amber), last-known "ON AIR" in
  the tooltip. Not ON AIR, not forced-IDLE.
- On **reconnect**: reconcile against actual OSC. A still-occupied layer re-announces its
  producer within ~1 tick → `freshTruth` re-derives `'on-air'` automatically. A silent layer
  (producer gone, e.g. CasparCG restarted) is reset to **IDLE** — a one-shot post-`RESYNCING`
  occupancy check (`session.osc.occupancy.occupied(OCCUPANCY_STALE_MS)`) against each item's
  slot, mirroring the sweep's "absence of knowledge is not knowledge of absence". Reset is a
  silence-inference (real CasparCG never reports `empty` — `occupancy-tap.ts`), so it lands after
  the ~150ms drain; that latency is inherent and accepted.

**FROZEN:** does NOT weaken `#linkDown()`'s on-air REFUSAL (take/update/out stay refused while
the link is down — R-006), does NOT change command semantics, does NOT touch [[B-085]]'s library.
This makes the ON AIR **display + reconcile-truth** honest across a link loss. Distinct from
**B-030** (auto-out-stuck-on-air: OSC still flowing, link up, producer genuinely present — a
template-runtime completion-signal problem, separate bug).

Status name: a NEW `'unverified'` status (not the latent `'disconnected'` one, whose "OFFLINE"
meaning would mislead; not amber `'unconfirmed'`, which is B-044's item-scoped ack-timeout).

## [x] B-087 — the stack row badge freezes red "● ON AIR" when the BRIDGE process dies (SPA↔bridge WebSocket drops): the same broadcast-safety lie [[B-086]] closed, but for the OUTER link ⟨priority: high⟩ — merged (#340, `fix/B-087-bridge-death-onair-badge`) + archived: `openspec/changes/archive/2026-07-18-runtime-onair-honest-bridge-loss/`

[[B-086]] made the ON AIR badge honest when the **CasparCG** link drops (the bridge↔CasparCG AMCP
link). But when the **BRIDGE** process itself dies — the SPA↔bridge WebSocket — the on-air row
stays frozen on a confident red **● ON AIR**. Operator testing: killing CasparCG correctly flips
the row to muted "WAS ON AIR" (B-086 works); stopping the bridge leaves it red for as long as the
bridge is down. The UI asserts an on-air state the SPA can no longer verify — in fact _less_
verifiable than the CasparCG-death case, because the bridge is the SPA's ONLY conduit to CasparCG,
so on bridge death the SPA has no path to the wire at all.

**Root cause (recon, verified against source):** B-086's `unverified` demotion is a **bridge-side**
product — the reconciler re-publishes it and it reaches the SPA over `StackStateChanged`. A **dead**
bridge cannot send it. Meanwhile the renderer **freezes** the last snapshot: `useBridgeSnapshot`
(`apps/runtime/src/renderer/hooks/useBridgeSnapshot.ts:53`) early-returns on `link === 'disconnected'`
without clearing or demoting, so `useStack()` keeps every row at `status: 'on-air'` and `StackRow`
renders sacred-red **● ON AIR** at full confidence. Every OTHER air-claim surface already shows an
honest disconnected/UNKNOWN state on bridge death via a direct `useLink()` display override over the
frozen data — the health pills (`StatusBar.tsx`), the `LinkIndicator`, the `ConnectionBanner`. The
stack row status badge is the **only** air-claim surface missing that override.

**Fix (renderer-only display mask — reuses B-086's `'unverified'` status, NO bridge/schema change):**
`StackRow` already reads `useLink()` (`linkDown`) and has the same on-air/`playing` predicate B-086's
reconciler override uses. When `linkDown && onAir`, feed the badge an effective `'unverified'` status
instead of the raw frozen `item.status`; the already-defined theme mapping renders it muted grey
`◌ "WAS ON AIR"`. Purely a display mask over frozen snapshot data during the outage — it makes NO
restore-vs-reset decision. On reconnect (`link → 'live'`) `useBridgeSnapshot` re-pulls and the
authoritative status replaces the mask automatically. This mirrors how the health pills already
demote via a `useLink()` read (`StatusBar.tsx`'s `stale` override), closing the last inconsistency.

Also: the `'unverified'` tooltip (`StatusBadge.tsx`) is worded for the CasparCG-death case ("before
the CasparCG link dropped"); make it link-aware so it reads accurately for both the CasparCG-death
(B-086) and bridge-death (B-087) cases now that both use `'unverified'`.

**FROZEN:** NO bridge change, NO schema/enum change (`'unverified'` already exists from B-086), NO
change to on-air REFUSAL (R-006) or [[B-085]]'s browser-local library, and NO change to B-086's
bridge-side reconciler path. This does NOT contradict B-086's "a renderer-only mute is wrong" note:
that note was scoped to **CasparCG** death (bridge alive → only the bridge's occupancy tap can decide
restore-vs-reset); on **bridge** death there is no live bridge or tap, so a renderer overlay is the
only possible actor, and the two fixes trigger on disjoint conditions (`useLink()==='disconnected'`
vs a live bridge's CasparCG session leaving `healthy`). Sibling of [[B-086]]; the display half of the
bridge-death story (the recovery half — stack surviving a bridge restart — is tracked separately).

## [x] B-092 — stack items VANISH when the bridge process restarts: the stack lives ONLY in the dead bridge's memory, so a restart re-delivers the library ([[B-085]]) but the SPA adopts an EMPTY stack and every row disappears ⟨priority: high⟩ — merged (#343, `fix/B-089-stack-survives-bridge-restart`) + archived: `openspec/changes/archive/2026-07-18-runtime-stack-survives-bridge-restart/`

[[B-087]] made the ON AIR badge honest while the bridge is down (the DISPLAY half of the
bridge-death story). This is the RECOVERY half: when the bridge comes BACK, the operator's whole
stack is gone. Owner mandate: **stack items must survive a bridge restart in ANY case.**

**Root cause (recon, verified against source):** the stack lives ONLY in the bridge's in-memory
`Reconciler` (`items` Map + `#slots`/`#loaded`/`#adopted` in `caspar-runtime.ts`) — nothing persists
it. On a bridge restart the new process boots EMPTY; the SPA's `#resync`
(`WebSocketRuntime.ts:280-296`) re-delivers the browser-local library (B-085 works) but then
re-PULLS the now-empty stack snapshot and pushes `[]` to every subscriber (`:301-307`), so every row
disappears. The SPA retains NO stack intent of its own: `stack.*` are bare pass-throughs and
`#lastStack` exists only for B-085's offline remove-reference check. Pre-existing — B-085 made the
LIBRARY browser-local but deliberately left the stack bridge-owned.

**The broadcast-safety hazard that forbids the naive fix (adversarially verified):** simply
re-issuing `stack.load` per retained item drives the CG ADD path, which **CLEARs BEFORE it ADDs** —
`load()` → `#adoptLayer(slot)` (`:517`) → `#adopted` is empty on a fresh process → falls through to
`#send(#builder.out(slot))` (`:1267`), a hard CLEAR that DESTROYS the producer. On a **bridge-only**
restart (CasparCG still on air) that CLEAR lands on the **LIVE** layer: an OFF-AIR FLASH, then a
re-add as merely loaded. That is exactly the broadcast-safety lie the frozen doctrine forbids (same
adopt-CLEAR-vs-primary code family as [[B-056]]). "Must not disappear in any case" therefore CANNOT
be met by the naive path — the restore MUST be occupancy-aware.

**Fix — browser-local stack retention + an occupancy-aware restore that NEVER clears a live layer:**

1. **Browser side.** A persistent (OPFS) `StackRetentionStore` mirroring B-085's `LibraryStore`,
   holding stack INTENT (itemId, templateId, fields, play evidence, desired slot, position, order),
   mirrored from every published snapshot. A stack reconcile-on-connect step alongside the library
   one in `#resync`, re-delivering the retained intents FIRST (new `stack.restore` channel) so the
   bridge rebuilds before the SPA re-pulls — the re-pull then returns the RESTORED stack instead of
   `[]`. Conflict policy: local-wins, except an item the live bridge already holds is never
   clobbered.
2. **Bridge side.** `restore()` seeds the Reconciler (via a new `restoreItem`), reserves each
   retained slot exactly (`LayerManager.reserve`), binds OSC interest and publishes IMMEDIATELY —
   the rows come back at once — then defers the adopt-vs-re-ADD decision per item to the moment
   occupancy is knowable. At the `to === 'healthy'` transition (the EXACT [[B-086]] hook,
   `:334-339`, where the tap is drained) each pending item is decided by
   `session.osc.occupancy.occupied(staleMs)`:
   - **Occupied layer → ADOPT WITHOUT CLEAR.** Seed `#adopted`, send NOTHING; resumed OSC
     re-derives ON AIR on its own (`reconciler.ts:610-615`). This is the bridge-only-restart case:
     the live graphic is never touched, so it never flashes.
   - **Silent layer → re-ADD as loaded.** A normal `#sendAdd` (still NO adopt-CLEAR). This is the
     bridge+CasparCG-restart case: the layers really are empty, so the items return `loaded`.
     Occupancy is the discriminator, and neither branch can ever clear a live layer.

3. **Visible while the bridge is down (found in owner visual confirmation).** Retention alone does
   not satisfy "in any case": a hard REFRESH during an outage still showed an empty stack, because
   the retained intent was only ever the reconnect delivery set (`useBridgeSnapshot` skips the pull
   while `disconnected`, and `stack.snapshot()` rejected). So the snapshot is now served from the
   retention while the link is unusable — display only, sending nothing, deciding nothing, with the
   authoritative snapshot replacing it on reconnect. Offline rows are honest: a was-on-air row
   renders as [[B-086]]/[[B-087]]'s muted `unverified`, never a confident red, since with no bridge
   the SPA has no conduit to CasparCG at all.

**FROZEN:** no change to on-air REFUSAL (R-006), health-honesty, [[B-085]]'s library, or [[B-086]]'s
CasparCG-death path, and NO weakening of the adopt-CLEAR on the normal (non-restore) `load()` path —
only the RESTORE path gets adopt-without-clear. Additive recovery that STRENGTHENS broadcast safety.
Sibling of [[B-087]]; the recovery half of the bridge-death story.

## [x] B-093 — the occupancy tap cannot tell "this layer is empty" from "I have never heard any OSC", so a bridge restart against an OSC-blind install re-ADDs over a LIVE layer and takes the graphic OFF AIR ⟨priority: high⟩ — merged (#355) + archived: `openspec/changes/archive/2026-07-19-runtime-blind-occupancy-tap/`

Found by the [[B-092]] hardware probe (#353) and captured on the wire, not inferred.

`OscOccupancyTap.entries` is populated only by `note()`, called only from OSC events. If OSC never
arrives — misconfigured `casparcg.config`, OSC pointed at the wrong port, a firewall — the map is
empty and `occupied()` returns `[]`, so a genuinely **LIVE** layer reads as unoccupied. B-092's
restore then takes the re-ADD branch and sends `CG <ch>-<layer> ADD 0 "<template>" 0 "{}"` over the
live producer. Play-on-load is `0`, so the playing graphic is replaced by a **non-playing** one:
**OFF AIR**, silently, with no error and no operator-visible signal.

B-092's literal invariant survived — no CLEAR is ever sent — but the property it existed to protect
did not. The safe path degraded into the unsafe one, which is the more dangerous shape of failure:
the design looked intact.

**Root cause:** silence has two meanings that demand OPPOSITE actions — "this layer is empty" and
"I have never heard from the server". Silence from a tap that has never received a packet is not
evidence of emptiness; it is evidence of no evidence.

**Fix:** the tap learns whether it has EVER received OSC this session (`hasReceivedOsc`, driven by
OSC **traffic** and reset with `reset()` on resync). Keyed on traffic rather than producer events
on purpose: a healthy server whose layers are all empty emits only channel-level messages
(verified on 2.3.2), so a producer-event flag would make healthy-but-idle indistinguishable from
blind and would break the legitimate "layers really are empty" re-ADD path. Then, at the restore
decision: heard + occupied → adopt (unchanged); heard + silent → re-ADD as loaded (unchanged);
**never heard → REFUSE TO DECIDE** — send nothing, keep the row visible, and publish it as
[[B-086]]/[[B-087]]'s `unverified` ("WAS ON AIR"), which already means exactly "was on air, cannot
confirm". The periodic sweep decides the item for real if OSC starts arriving.

**Same bug in a sibling path, fixed with it:** `reconcileOnReconnect` (B-086's reconnect reconcile)
also reads silence as proof the producer is gone, and would reset a genuinely live item to `idle`
on a blind tap — on a link that is UP. It is now skipped while the tap is blind. This
STRENGTHENS B-086 rather than weakening it: it prevents a false `idle`, and the `unverified`
demotion from the drop still stands.

**FROZEN:** on-air refusal (R-006), [[B-085]]'s library, [[B-086]]/[[B-087]]'s `unverified` badge,
and B-092's occupied-branch behaviour when OSC IS flowing (hardware-confirmed correct: nothing
sent, live producer untouched) are all unchanged.

## [x] B-094 — a CasparCG that answers AMCP but sends no OSC reads as a confident green "PRIMARY A HEALTHY", and when the session finally notices it reads "DEGRADED" — which points the operator at the opposite remedy from the truth ⟨priority: medium⟩ — merged (#356) + archived: `openspec/changes/archive/2026-07-19-runtime-no-osc-indicator/`

Hit live by the owner: `casparcg.config` had the OSC `predefined-client` on port 5253 instead of
6250, plus a literal `false [true|false]` left inline in `<disable-send-to-amcp-clients>`. AMCP
worked perfectly throughout — commands acked, graphics rendered — so nothing in the UI pointed at
the real fault.

**Why it is mis-warning, not un-warning.** The health pill's HEALTHY is derived from the AMCP axis
alone (`amcpAxisOk: state === 'healthy'`), so a blind install reads confident green. When
`ServerSession` does notice the silence it degrades and then force-disconnects, so the pill reads
DEGRADED / OFFLINE — and every operator reads that as "CasparCG is down". The truth is the
opposite: the server is up and rendering; its OSC configuration is wrong. Those demand opposite
remedies, and the wrong one — restarting a working playout box — takes air down. The install also
FLAPS (healthy → degraded → reconnect), so the bar is reassuringly green for part of every cycle
and mis-attributed for the rest.

What is silently degraded meanwhile: on-air confirmation, [[B-086]]'s reconnect reconcile, R-009's
orphan detection, and [[B-092]]/[[B-093]]'s stack restore — which now correctly REFUSES to decide,
but could not say why.

**Fix (indicator only — no decision, gate or command path changes):** publish `oscFreshAt` on each
server's health from the SAME source-filtered has-heard-OSC signal [[B-093]] added (not a second,
divergent one), using the `ServerHealthSchema` slot that already existed unused — no schema change.
The StatusBar renders `⚠ NO OSC` beside the health pill when the server is answering AMCP and
nothing has ever been heard from it, with a tooltip naming it as a CasparCG-side **configuration**
problem, stating the server is UP, listing what is degraded, and giving the remedy.

**A separate indicator, deliberately NOT a pill state.** The pill's vocabulary mirrors the session
state machine exactly; "answering AMCP but inaudible" is an orthogonal axis, not another state on
it. Keeping them apart lets the bar say both at once — "PRIMARY A HEALTHY ⚠ NO OSC" reads as "it is
up, but I am deaf to it" — and it survives the flap: as the pill oscillates HEALTHY↔DEGRADED the
indicator stays put and explains both, where a pill state would be overwritten by DEGRADED at
exactly the moment the operator most needs the explanation.

**FROZEN:** on-air refusal (R-006), [[B-086]]/[[B-087]]'s `unverified` badge, [[B-092]]'s restore
and [[B-093]]'s blind-tap guard are untouched. This is an indicator; it changes no decision.

## [x] B-100 — the bridge's link predicate calls an OSC-silent server UNREACHABLE: `#linkDown()` tests `state !== 'healthy'`, but the caspar-client's own predicate counts `degraded` (OSC-silent, AMCP UP) as live — so a working AMCP link is treated as dead, `load()` can leave a layer BLACK, and every on-air verb is refused ⟨priority: high⟩ — merged + archived: `openspec/changes/archive/2026-07-22-runtime-reachability-predicate/` — owner-verified on real CasparCG hardware, 2026-07-22

**Root cause — a PREDICATE MISMATCH. The black screen is a symptom, not the bug.** Two predicates
in this codebase answer "is this server usable?" and they disagree:

- `tools/caspar-bridge/src/caspar-runtime.ts:959` —
  `return sessions.every((s) => s.state !== 'healthy');`
- `packages/caspar-client/src/redundancy/redundancy-adapter.ts:505-507` —
  `/** A session whose AMCP axis is believed up: healthy, or degraded (OSC-silent). */`
  `function isLiveState(state) { return state === 'healthy' || state === 'degraded'; }`

`degraded` is entered on **OSC silence alone, with the AMCP socket untouched**
(`packages/caspar-client/src/session/server-session.ts:311`, default `oscDegradedAfterMs` 3000 ms
at `:130`). So in `degraded` the client says "AMCP up" and the bridge says "unreachable". The
bridge's is the stricter one, and it is the one that gates every operator verb.

**`#linkDown()` contradicts its own documented intent.** Its doc block (`:951-953`) states the
rule it means to implement: _"The predicate is **no declared server is reachable**, NOT 'the
primary is down'… We refuse only when the command can reach no server at all."_ In `degraded` the
command **can** reach the server. The implementation does not match the sentence above it — which
is the whole defect in one line, and the reason this is a predicate bug rather than a `load()` bug.

**Repro — the traced sequence (code reading, #378; NOT yet observed on hardware).** One declared
server, OSC silent > 3 s, AMCP working:

1. `#linkDown()` → **true** (the only session is `degraded`, not `healthy`).
2. Operator presses **Load**. Allocation proceeds: [[C-014]]'s quarantine only skips layers with a
   FRESH non-`html` observation, and `allocation fails OPEN on silence, deliberately opposite to clearLayer's refusal`
   (`caspar-runtime.ts:1796`). Under OSC silence there are no fresh observations — the protection
   is absent in exactly the state that triggers this. (`#reconcileForeignQuarantine` also returns
   early on `state !== 'healthy'`, `:1815`.)
3. `#adoptLayer` (`:603`) sends an **unguarded CLEAR**:
   `await this.#send(this.#builder.out(slot), …)` (`:1740`). No link check there, nor in `#send`
   (`:1893`), `RedundancyAdapter.send` (`redundancy-adapter.ts:162`), nor `sendJournalReplay`,
   which goes straight to `primarySession.queue.enqueue` (`:314`). **The AMCP axis is up, so the
   CLEAR lands and destroys the resident producer.**
4. `:647` then returns early and **skips `#sendAdd`**.

**Expected:** either the load completes (CLEAR then ADD), or nothing is sent at all.
**Actual:** **CLEAR-then-nothing — the layer goes BLACK on air.** Pre-[[B-082]] the same path was
CLEAR-then-ADD, which at least left the new template on the layer.
**Env:** `@cg/caspar-bridge` + `@cg/caspar-client`. Any install where OSC is silent while AMCP is
up. Not app-specific to the SPA.

**Why this state is COMMON, not exotic — verified against the code, not assumed.** The two axes
run over different transports: **OSC is UDP** (`packages/caspar-client/src/osc/transport.ts:66`,
`dgram.createSocket('udp4')`) and **AMCP is TCP**
(`packages/caspar-client/src/amcp/transport.ts:61`, `net.createConnection`). UDP has no
retransmission, so ordinary packet loss, a busy NIC, a firewall/NAT rule that permits the AMCP
port but not the OSC port, or CasparCG simply not configured to send OSC all produce precisely
"OSC silent, AMCP fine" — while TCP quietly retransmits and keeps the command channel perfect.
[[B-094]] exists because this state was ALREADY observed in production, and its own text records
the oscillation: _"as the pill oscillates HEALTHY↔DEGRADED"_ (`bugs-runtime.md:1842`). This is a
routine operating condition, and on a no-OSC install it is the PERMANENT condition — see
[[B-101]].

**Blast radius — every site testing `state` against `'healthy'` directly instead of via
`isLiveState()`.** All line numbers `tools/caspar-bridge/src/caspar-runtime.ts` unless noted.

| Site                                       | Gates                                     | Behaviour when OSC-silent / AMCP-up                                                      | Direction                   |
| ------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------- |
| `:647` `load()`                            | skip of the pre-roll `CG ADD`             | CLEAR lands, ADD skipped → **layer BLACK**                                               | **FAIL-OPEN (destructive)** |
| `:990` `take()`                            | R-006 on-air refusal                      | TAKE refused on a working link → **a missed take on air**                                | **FAIL-CLOSED**             |
| `:1039` `update()`                         | R-006 on-air refusal                      | UPDATE refused; on-air graphic cannot be corrected                                       | **FAIL-CLOSED**             |
| `:1104` `stopItem()`                       | R-006 on-air refusal (C-012 graceful)     | STOP refused                                                                             | **FAIL-CLOSED**             |
| `:1120` `out()`                            | R-006 on-air refusal                      | CLEAR refused → **operator cannot take a graphic OFF air**                               | **FAIL-CLOSED (safety)**    |
| `:1546` `health()`                         | the `amcpAxisOk` field shipped to the SPA | reports `false` while the AMCP axis is UP — wrong by the field's name                    | **mis-report (latent)**     |
| `:1815` `reconcileForeignQuarantine()`     | C-014 quarantine refresh                  | returns early; quarantine not reconciled (contributes to step 2 above)                   | fail-open (by C-014 design) |
| `:1164` `sweepOccupancy()`                 | R-009 orphan sweep                        | returns early — correct, the sweep is OSC-derived                                        | correct                     |
| `:701` / `:417` → `Reconciler.setLinkDown` | [[B-086]]'s `unverified` demotion         | on-air items demote to "WAS ON AIR" — **honest**, OSC is the confirm channel ([[B-093]]) | correct                     |

The `:1120` row is the sharpest operational one: with OSC silent the operator **cannot clear a
graphic off air** through a link that would carry the command perfectly well.

**`amcpAxisOk` is currently latent, not harmless.** It is a published contract field
(`packages/shared-ipc/src/channels/connections.ts:15`) and reaches the SPA, but no renderer view
reads it today — `StatusBar` derives its blind-server indicator from the raw state and gets it
RIGHT (`apps/runtime/src/renderer/features/status/StatusBar.tsx:109` treats `healthy || degraded`
as up). The moment any surface starts trusting `amcpAxisOk`, it inherits this bug.

**ACCEPTANCE — the governing requirement, above either fix option.**

> **`load()` must not be able to destroy without repairing.** Whatever guard is chosen must gate
> the PAIR — the adopt-CLEAR and the ADD — **atomically: either both, or neither**.
> **CLEAR-then-nothing must not be a constructible sequence, regardless of which predicate fires.**

This is deliberately stronger than "fix the predicate", because a predicate fix alone does not
satisfy it. `#adoptLayer` (`:603`) **awaits a real AMCP round-trip**, and the check at `:647` is
re-evaluated after that await — so a session that transitions to `degraded`/`disconnected` DURING
the adopt still yields CLEAR-then-nothing even with a perfectly correct predicate. The pairing has
to be structural, not a second correct test.

**Fix directions — owner-facing decision, NOT resolved here.**

1. **Move the check above `#adoptLayer`.** Narrow and obvious; makes the pair atomic at that one
   call site. Leaves the predicate lying at every other site in the table above — the four
   FAIL-CLOSED refusals stay wrong.
2. **Fix the predicate to use `isLiveState()`.** The root fix: one change corrects `load()` and
   all four refusals at once. Cost: it changes refusal semantics everywhere `#linkDown()` is read,
   so R-006's specs and tests must be re-read against it.

**Owner's read (recorded 2026-07-20): (2) is correct and (1) is a band-aid** — conditional on
R-006's refusals never having been DELIBERATELY keyed to OSC silence. **This item's audit finds
they were not**, on the code's own evidence: `#linkDown()`'s doc block (`:951-953`) states the
intended rule as reachability — _"We refuse only when the command can reach no server at all"_ —
and says nothing about OSC. The OSC-derived behaviours are handled elsewhere and correctly
(`sweepOccupancy` `:1164`, the [[B-086]]/[[B-093]] `unverified` demotion). So the coupling to
`degraded` reads as an accident of `state !== 'healthy'` being a convenient shorthand, not a
designed refusal-on-silence. **(2) is therefore not blocked by a prior intentional decision** —
but note it does NOT satisfy the ACCEPTANCE on its own, so the chosen fix is (2) **plus** the
atomic pairing.

**Regression test:** drive a session to `degraded` (OSC silent, AMCP up) and assert (a) a `load()`
onto an occupied layer either completes or sends nothing — never CLEAR-then-nothing; (b)
`take`/`update`/`out`/`stopItem` are NOT refused. The offline `amcp-mock` can hold the AMCP side
up while OSC is withheld; note the existing `disconnected-refusal.integration.test.ts` exercises
the fully-DISCONNECTED case only, which is why this was never caught.

**Not the same as [[B-094]]**, which reports the blind state honestly to the operator and changes
no decision. This is about the bridge acting on it wrongly. **Cross-refs:** [[B-082]] (the entry
that surfaced it — its owed hardware check is the same run as this item's, see there), [[B-101]]
(the no-OSC reconnect loop that makes this the permanent state), [[C-014]] (allocation's
deliberate fail-open on silence), [[B-093]], [[B-086]], [[B-087]], [[B-030]].

**RESOLUTION (2026-07-21, change dir `runtime-reachability-predicate`).** Owner's read taken:
**fix option (2) — correct the predicate to reuse `isLiveState` — PLUS the atomic pairing** the
ACCEPTANCE demands. Three parts, one commit:

1. **Predicate corrected and renamed.** `#linkDown()` → `#noServerReachable()`
   (`tools/caspar-bridge/src/caspar-runtime.ts:1002`), body now
   `sessions.every((s) => !isLiveState(s.state))`. `isLiveState` is promoted to the
   `@cg/caspar-client` public entry (`packages/caspar-client/src/index.ts`) and IMPORTED — one
   canonical reachability notion, no second local copy (the copy is what let the name lie).
   Renamed at all FIVE call sites — `load` (`:668`), `take`, `update`, `stopItem`, `out` — and in
   the comments that reference it (the `restore()` contrast and the [[B-086]] demote comment,
   which is corrected to note the demote-display and the refusal are now DIFFERENT conditions).
2. **Pairing made structural.** `load()` evaluates reachability ONCE (`:627`) and threads that one
   `reachable` value into both `#adoptLayer(slot, reachable)` (which now skips the adopt-`CLEAR`
   when unreachable) and the pre-roll `CG ADD` gate. CLEAR-then-nothing is no longer constructible
   at that site — either both reach the wire or neither, regardless of a state slip in the await
   gap. The item still lands at `loaded` with slot bound and OSC interest registered ([[B-082]]
   behaviour unchanged); only the CLEAR is gated.
3. **On-air policy change (deliberate, owner-approved).** All FIVE predicate call sites change
   behaviour on a `degraded` (OSC-silent, AMCP-up) server. The four on-air verbs — **`take`,
   `update`, `out` and `stopItem`** — are NO LONGER refused, and `load` now sends its pre-roll
   `CG ADD` (paired with its adopt-`CLEAR`, part 2) instead of skipping it. The command reaches
   CasparCG over AMCP, and refusing on OSC silence turns a monitoring fault into a total playout
   outage ([[B-094]]'s incident would go off air entirely).

   **`stopItem` and `out` are the ones that mattered most, and the entry should say so plainly:
   the old behaviour left the operator unable to take a graphic OFF air through a link that would
   have carried the command perfectly well.** That is strictly worse than a refused `take` — a
   take that does not happen shows nothing, while a stop that does not happen leaves a live
   graphic on air with no way to remove it. `stopItem` (C-012's graceful `CG STOP`) was also the
   call site with NO test coverage in either direction until this was closed.

   Honesty under silence is preserved by the surfaces that already exist ([[B-086]] `unverified`
   "WAS ON AIR", [[B-094]] `⚠ NO OSC`), not by refusal — the operator is WARNED, not BLOCKED. With
   NO server reachable all four on-air verbs are STILL refused `disconnected` (R-006 intact);
   offline safety is re-scoped to its true condition, not removed.

**Tests.** New `reachability-predicate.integration.test.ts` (a `degraded` hold via a TEST-ONLY
`sessionTuning` seam + a `deafPort` the mock never emits to): the black-layer regression, the
CLEAR⇒ADD pairing invariant across healthy/degraded/disconnected, `take` accepted on `degraded`
with `CG PLAY` on the wire, and the FROZEN [[B-056]] mirror-pair send. Each of those was shown RED
pre-fix.

**Coverage completed (2026-07-21, follow-up).** The fifth call site had none. Added, and passing on
the already-fixed code (coverage, NOT red-first repros — the behaviour they pin was changed by the
fix above): `stopItem` ACCEPTED on `degraded` with `CG STOP` on the wire and the producer left
resident (C-012); FROZEN `stopItem` still refused `disconnected` with no server reachable, queueing
nothing (a reconnect replays no `CG STOP`); and a walk of **all five call sites** on one degraded
server — `load → take → update → stopItem → out` — asserting each verb's line genuinely reaches the
wire. Note the CLEAR⇒ADD pairing invariant has no verb axis to widen: it is a property of the
`load` path alone, so the verb axis lives in that new walk instead.

Spec: `runtime-caspar-bridge` requirement "On-air verbs are refused while the server is not
connected" MODIFIED — predicate corrected to reachability with degraded-accepted and never-black
scenarios.

**Frozen, verified unchanged:** R-006 offline refusal + [[B-082]] offline load-rests-at-loaded
(`disconnected-refusal.integration.test.ts`, untouched); [[B-086]] `onair-honest-linkloss` refusal
(drives a full disconnect, not `degraded` — still refused); [[C-014]] quarantine; the AMCP
verb/order/quoting seam. Out of scope and untouched: [[B-101]]'s force-disconnect watchdog,
`clearLayer`'s R-015 refusal, [[B-086]]'s demote wiring.

**GATES — ALL DISCHARGED.**

- **Real-CasparCG verification — DONE, owner-verified 2026-07-22** (this changed on-air
  behaviour, so it was mandatory before archive). Every step of the protocol below PASSED on real
  CasparCG hardware: the load onto an occupied `degraded` layer did NOT go black, and take,
  update, the graceful stop (outro, producer resident) and out all behaved as specified.
  This was the SAME physical session as [[B-082]]'s owed real-CasparCG check #1 — one run
  discharged both. **The protocol as run, kept for the record:** 0. Drive one declared server to `degraded`: stop OSC (or point it at a port nobody listens on)
  while leaving the AMCP socket up. Confirm the health surface reads `⚠ NO OSC` / not-healthy
  before starting. Put a graphic on the target layer first, so the adopt-`CLEAR` has a real
  resident producer to destroy.
  1. **Load** onto that occupied layer → the layer is **NOT black** (the adopt-CLEAR is paired
     with the pre-roll ADD).
  2. **Take** → the graphic **plays**.
  3. **Update** → the on-air fields **change** on the rendered output.
  4. **stopItem** (graceful) → the template runs its **outro** and the producer stays resident.
     **This is the check that matters most** — it is the one whose refusal used to strand a
     graphic on air.
  5. **out** (hard clear) → the layer **clears**.

  Every step must be performed while the server is still `degraded`; if it recovers to `healthy`
  mid-run the run proves nothing and must be restarted.

  **This run was part of ONE consolidated hardware session** that also discharged [[B-082]]'s
  check #1, [[B-101]] and both [[C-014]] on-air validations — full checklist, now all ticked, in
  `openspec/changes/archive/2026-07-22-runtime-amcp-probed-liveness/tasks.md` §6. **Nothing here
  needs booking again.**
  Note the earlier warning here — that [[B-101]] force-disconnects the session roughly every 13 s
  so a reconnect window mid-protocol is expected and steps should be re-issued rather than
  recorded as failures — **no longer applies**: B-101 is fixed, OSC silence no longer disconnects
  anything, and the link now HOLDS. A retry-free run is therefore the expectation, and needing a
  retry is itself a finding to record.

- **`pnpm gate:e2e` on Linux — NOT owed.** The diff is bridge-internal (`caspar-bridge` +
  `caspar-client`) + tests + docs; it touches no browser-visible surface.

## [x] B-101 — an OSC-silent install cannot hold a connection: the watchdog tears down a WORKING AMCP socket every ~13 s and reconnects forever, so after B-100 the operator gets INTERMITTENT command capability rather than restored capability ⟨priority: high⟩ — merged (#385) + archived: `openspec/changes/archive/2026-07-22-runtime-amcp-probed-liveness/` — owner-verified on real CasparCG hardware, 2026-07-22

**Distinct from [[B-100]]** — different component, different fix. B-100 is the bridge reading the
session state wrongly; this is the session state machine itself destroying a healthy AMCP link
because a **different** transport went quiet. Filed together because this is what turns B-100 from
an occasional window into the steady state on any install without OSC.

**Repro:** run the bridge against a CasparCG that answers AMCP but sends no OSC — the [[B-094]]
condition, and the install [[C-014]] explicitly designs for (`caspar-runtime.ts:1797`, _"a blind
(B-094) install must still be able to play out"_).

**Expected:** the AMCP link stays up. OSC silence degrades what can be CONFIRMED, not what can be
COMMANDED.
**Actual:** a permanent cycle, roughly every 13 s + backoff. Traced in
`packages/caspar-client/src/session/server-session.ts`:

1. `:219` `this.lastOscAt = this.now();` — connect seeds a synthetic OSC timestamp, then
   `:224` `transitionTo('healthy', 'resync complete')` and `:227` `startWatcher()`.
2. `:311-313` after `oscDegradedAfterMs` (**3000 ms**, `:130`) with no OSC → `degraded`.
3. `:324-325` after a further `oscDownAfterMs` (**10000 ms**, `:131`) still silent →
   `transitionTo('disconnected', …)` + `resolveHealthyExit()`.
4. `:240-241` the loop then runs `this.currentQueue.dispose(); this.currentAmcp.destroy();` —
   **a perfectly working TCP socket is destroyed**, pending queue items rejected.
5. `:245-247` backoff, then reconnect at `:211`. Repeat forever.

**So the answer to "is a no-OSC install permanently `degraded`?" is NO — it is worse.** The
session does reach `healthy`, but only for ~3 s of each cycle; the rest is `degraded` (~10 s) plus
the connect/handshake/resync climb. And each cycle needlessly drops a live command channel.
[[B-094]]'s own text already recorded the visible half of this — _"as the pill oscillates
HEALTHY↔DEGRADED"_ (`bugs-runtime.md:1842`) — and attributed it to display flap rather than to a
reconnect loop.

**Updated 2026-07-21, post-[[B-100]] — what this now costs, and why the entry as filed overstated
it.** As FILED this said the bridge predicate was true "for most of every cycle", i.e. the on-air
verbs were refused nearly always. [[B-100]] has since landed: the predicate is now
`#noServerReachable()` and counts `degraded` as REACHABLE, so the ~10 s degraded window **accepts**
commands. The residual cost is therefore **INTERMITTENT command capability, not restored
capability** — commands land during the healthy (~3 s) + degraded (~10 s) stretch and are correctly
refused `disconnected` during the connect/handshake/resync climb that follows each needless
teardown. B-100's fix survives only BETWEEN teardowns, which is exactly why this item bounds how
much of it an OSC-broken install actually receives, and why B-100's owed hardware protocol warns to
re-issue any step that lands in a reconnect window rather than record it as a failure.

**The category error, stated plainly — it is B-100's, one layer down.** B-100 was the bridge using
OSC silence to decide REACHABILITY, a property OSC does not measure. This is the session FSM doing
the same thing: using OSC silence as a liveness proxy for the AMCP socket, a channel it does not
measure either. The correct liveness probe for the AMCP axis is **an AMCP command** — disconnect on
a failed AMCP probe, never on a silent monitoring channel. OSC silence should be left to do only
what it can honestly support: drive `degraded` and [[B-094]]'s `⚠ NO OSC` indicator.

**There is no opt-out.** `startWatcher()` is called unconditionally on every entry to `healthy`
(`:227`); `oscDegradedAfterMs` / `oscDownAfterMs` are the only knobs (`:130-131`) and neither
disables the teardown. The bridge passes **no** overrides — `#buildSessions`
(`tools/caspar-bridge/src/caspar-runtime.ts:308-315`) supplies only `name`, `host`, `port`,
`oscPort`, `oscBindHost` and `resyncDurationMs`, so the 3 s / 10 s defaults are what production
runs.

**Env:** `@cg/caspar-client` session FSM. Any install where OSC never arrives — no OSC configured
in CasparCG, a firewall/NAT permitting the AMCP TCP port but not the OSC UDP port, or an OSC bind
on an interface CasparCG does not send to.

**RESOLVED 2026-07-21 — the escalation is re-pointed at AMCP evidence, not deleted** (change dir
`runtime-amcp-probed-liveness`). OSC silence now degrades CONFIDENCE, never CONNECTIVITY. Past
`oscDownAfterMs` the session stops concluding from the silence and **asks the command axis
itself**: a bounded `VERSION` at `urgent` priority on the CURRENT queue, under the same
`versionTimeoutMs` the handshake already trusts to judge a link.

- **Answered** → stay `degraded`, KEEP the transport, re-arm and re-probe on that cadence for as
  long as OSC stays silent. The socket is never destroyed, so an OSC-silent install now holds ONE
  stable connection with full command capability — what [[C-014]] and [[B-094]] already design
  for, and what makes [[B-100]]'s fix continuously available rather than available only between
  teardowns.
- **Failed** (rejected, timed out, or a non-OK code) → `disconnected` with an `amcp probe failed:
…` reason, and the existing teardown/backoff/reconnect loop runs — this time for a reason AMCP
  actually reported. This also catches the HALF-OPEN link (peer holds the socket open, answers
  nothing, emits no close) that the `close` handler structurally cannot see.

The probe is the SAME function `HeartbeatService` pings with (`probeAmcpLiveness`) — one
definition of "the command axis answered", not two, per the golden rule [[B-100]] produced. It
does NOT revive `HeartbeatService` ([[C-010]] wiring stays dead): it fires only inside the
degraded window, so a healthy link carries no extra traffic.

**Frozen, verified unchanged:** `onAmcpClose` (a genuine peer close still disconnects at once,
from `healthy` and from `degraded`), the `healthy → degraded` demote at `oscDegradedAfterMs`, the
`degraded → healthy` recovery when OSC returns, the backoff/reconnect loop, and
`HeartbeatService`'s observable behaviour including its miss-reason strings.

**Notes — the per-server "OSC expected / not expected" flag is REJECTED for now, deliberately.**
This entry called it the more honest model, and in the abstract it is: only an explicit
declaration can distinguish "OSC was never expected" from "OSC was expected and stopped", which
no timer can infer. It is rejected here because it needs new config and new UI surface — a
PRODUCT decision, not a bug fix — and because the AMCP probe makes it **optional rather than
required**: with liveness measured on AMCP, a blind install already behaves correctly with no
configuration at all, and [[B-094]]'s `⚠ NO OSC` indicator is already truthful about the one
thing that IS wrong. It stays available as a possible follow-up for that distinction and nothing
here forecloses it. **Do not re-litigate it as part of this fix.**

**Regression test (done, red-first):** `packages/caspar-client/tests/amcp-probed-liveness.test.ts`
— OSC never delivered against a normally-answering AMCP mock: across 3+ probe windows the session
stays `degraded`, the transport is never destroyed or rotated, the same TCP connection stays open
and no reconnect is attempted. Shown RED pre-fix (`expected 'resyncing' to be 'degraded'` — caught
mid-reconnect). Plus: the probe-failure safety net (RED pre-fix: `expected 'osc down > 120ms' to
match /amcp probe/`), the half-open link, a non-OK `VERSION` code, no overlapping probes, recovery
after a probe, and the two FROZEN peer-close guards.

**GATE DISCHARGED — real-CasparCG verification, owner-verified 2026-07-22.** Consolidated with
[[B-100]], [[B-082]] and [[C-014]] into ONE hardware session; the full checklist, now all ticked,
lives in `openspec/changes/archive/2026-07-22-runtime-amcp-probed-liveness/tasks.md` §6. B-101's
own item was §6.3, and it PASSED: with OSC stopped, the AMCP link HELD for several minutes — no
HEALTHY↔DEGRADED oscillation, no reconnect churn, and every step of the on-air walk worked **first
time**, with no retry inside a reconnect window. That retry-free walk is the direct observable of
this fix: before it, the session force-disconnected roughly every 13 s. **All four items are
closed; nothing here needs booking again.**

**Cross-refs:** [[B-100]] (the predicate that turns this cycle into refused verbs and a black
layer), [[B-094]] (the honest indicator for the same state), [[C-014]] (designs for the blind
install this breaks), [[B-093]].

## [~] B-107 — an errored stack row flips to READY when the BRIDGE PROCESS dies: the browser's retained-intent projection reduces every non-played status (including `error`) to `loaded`, so a load that never got a layer presents as playable ⟨priority: high⟩ — FIXED and on `dev`: `openspec/changes/runtime-retention-state/` (the DISPLAY face of the shared root)

**What:** While the SPA↔bridge WebSocket is up, a load that fails allocation shows on the stack
as a red **ERROR / "no layer"** row — correct, and one such row accumulates per further failed
load. The instant the bridge PROCESS dies (the WS drops), every one of those ERROR rows flips to
**READY**. The mechanism is NOT the reconciler (see Notes — this was mis-hypothesised at filing
and verified against merged `main` instead): the `Reconciler` runs IN the bridge and dies with
it, so nothing on the bridge re-derives these rows. The BROWSER answers `stack.snapshot()` from
its own retained intent instead — `WebSocketRuntime.#retainedProjection()` maps each retained
item to `status: i.played ? 'unverified' : 'loaded'`, and `StackRetentionStore.isPlayed()` counts
`error` as NOT played. So the round-trip is `error` → (mirror) `played:false` → (projection)
`loaded` → the `airStateVisual` label **READY** (`theme.ts`). The retained intent
(`RetainedStackItem`) carries no `status`/`errorCode` field, so the error has nowhere to live and
is dropped the moment it is mirrored. `useStack` opts into `pullWhileDisconnected`, so the
projection is pulled the moment the link goes `disconnected` — which is why the flip is immediate
and hits every errored row at once. `StackRow`'s B-087 display mask rescues only a frozen
`on-air` → `unverified`; there is NO equivalent mask for `error`, so the flip is unmasked. The
collapse is status-BLIND in BOTH directions — the projection maps EVERY `played:false` status to
`loaded`/READY, so `error` is only ONE instance. VERIFIED reachable: an item resting at `idle`
after a CLEAR/`out` (an out is NOT a remove — the row stays on the stack, reconciled `idle`, and
is published + mirrored as `played:false`) also projects to `loaded`/READY on bridge death.
`loaded` → READY is the ONE correct case; `error` → READY (the owner's observation, and the
dangerous one) and `idle` → READY are both lies — a failed or cleared row presenting as
pre-rolled and playable. So `error` is one instance of a general defect, not the whole of it.

**Why:** a status must NEVER improve when a link is lost. [[B-086]]/[[B-087]] established
demote-on-silence for on-air claims — a too-confident state made honest; this is the SAME rule
broken in the OPPOSITE direction, a FAILED state promoted to a confident, actionable one. READY
invites the operator to PLAY a row that never loaded a producer and cannot play, on a link the SPA
can no longer use in either direction. The collapse is status-BLIND: the projection preserves only
the single `played` bit, so it is not specific to the layer-exhaustion trigger the owner hit —
every error code reaches it, and so does a non-error `played:false` status: a cleared `idle` row
projects to READY too (verified reachable, a milder lie than the errored case).

**Generality check (done, PASSES):** a NON-layer error code reaches the identical errored state
through the same path. `caspar-runtime.ts`'s `load()` acks `applyAck(seq, false,
'unknown-template')` BEFORE `#allocate()` runs — a template that is simply not registered produces
`status:'error'` with NO layer involved, and it projects to READY identically (`no-layer`,
`no-layer-foreign-occupied`, `amcp-error` likewise). So this is a status-honesty defect in the
retained-intent projection, not a pool-exhaustion symptom.

**Acceptance:**

- WHEN a stack row's reconciled status is any NON-PLAYED status — `error`, or `idle` after a
  CLEAR — and the SPA↔bridge link drops (the bridge dies) THEN the published status stays honest:
  it never resolves to `loaded`/READY, and each keeps its own meaning (an errored row reads
  `error` or an explicit unverifiable state; a cleared row reads `idle`), because a lost link may
  never IMPROVE a status
- WHEN the retained-intent projection reduces a row to displayable state THEN distinct source
  statuses stay distinct — an errored row (any errorCode, layer or not) and a cleared `idle` row
  are each DISTINGUISHABLE from a cleanly-loaded one; the projection can never collapse `error`,
  `idle` and `loaded` to the same output
- WHEN the link returns THEN the authoritative reconciled status re-pulls (still `error` on the
  bridge while the condition persists) and the honest state is restored

**Notes:**

- **Mechanism CORRECTED from the filing hypothesis.** The observed flip is NOT the reconciler's
  `reconcileStatus` link-down clause: that runs in the bridge, dies with it, and its `setLinkDown`
  demotes ONLY `on-air`/`playing` (an errored `ackedStatus:'error'` base stays `error`). On a
  CasparCG link-drop with the bridge ALIVE the errored row correctly STAYS `error`. The flip is
  exclusively the BROWSER-side retained-intent projection on bridge death — the SPA↔bridge link
  ([[B-087]]'s domain), not the CasparCG link ([[B-086]]'s).
- **Fix direction (do NOT implement):** it belongs in the browser retained-intent path —
  `StackRetentionStore`/`RetainedStackItem` + `WebSocketRuntime.#retainedProjection` — either by
  retaining the errored state so the projection renders it honestly, or by projecting a
  never-loaded/errored row as something other than `loaded`/READY. NOT in the reconciler's
  `reconcileStatus` (that site is dead when the flip happens).
- Same honesty CLASS as [[B-086]] (CasparCG link-loss demotes on-air → `unverified`) and [[B-087]]
  (SPA↔bridge link-loss masks a frozen on-air → `unverified`); the difference is DIRECTION — those
  demote a state too confident, this one PROMOTES a failed state. Lives in the [[B-092]]
  retained-intent projection.
- **Not a regression from #405** (verified, not asserted): the projection + `isPlayed` are
  [[B-092]] (`#343`, 2026-07-18) and the load-error ack is [[C-014]] (`#368`, 2026-07-19); both
  predate R-021. R-021 stage 2a (`#404`) last-touched `WebSocketRuntime.ts` / `caspar-runtime.ts`
  for the fixed-bank wire contract, not these lines; R-021 did not touch `reconciler.ts`
  (`reconcileStatus` is [[B-100]], `#380`) or `StackRetentionStore.ts` at all.
- **Owner product direction (2026-07-25), a decision not an open question:** the R-021 fixed-bank
  model has the operator import/load onto PRE-DECLARED permanent rows rather than each load
  creating a row and grabbing a layer, which removes the ad-hoc accumulation the owner hit. This
  does NOT narrow the item — the defect is trigger-independent (any error code, no layer needed).
  It gets WORSE: R-021's fixed rows are PERMANENT, so once stage 3 binds an item to a fixed slot,
  an errored row that flips to READY also never leaves the screen.
- **Open architectural question (record, do NOT answer):** whether the R-021 fixed bank COEXISTS
  with the dynamic pool or eventually REPLACES it. On `main` the locked design COEXISTS —
  `LayerManager` fences fixed slots from birth and `allocate()` never returns one even when the
  dynamic range is exhausted (unit test T1, `packages/caspar-client/tests/layer-manager.test.ts`:
  "allocate() never returns a fixed slot, even with the range otherwise exhausted"). The answer
  shapes R-021 stage 3.
- **Two status-derivation sites that can drift — and this bears directly on [[R-021]] stage 3
  (record, do NOT redesign).** `#retainedProjection` derives display status INDEPENDENTLY of the
  `Reconciler`, from the single `played` bit — a SECOND source of truth for row state, which is
  exactly what can drift from the reconciler's. R-021 stage 2a deliberately locked against this for
  the fixed-layer wire: its per-slot channel ships FACTS only, because "a bridge-computed row state
  or verb list would be a SECOND derivation … that can drift from the renderer's — the exact
  two-copies failure mode the repo's one-canonical-predicate rule exists to prevent"
  (`openspec/changes/runtime-fixed-layers/design.md`, the stage-2a note). The retained path ALREADY
  contains that second derivation, and it dropping `error`/`errorCode` (this very bug) is one
  symptom of it. It bears on stage 3 concretely: a fixed-slot BINDING must survive a bridge restart,
  so it enters this SAME retained intent — and the retained projection DROPS every field it does not
  model. Whoever implements stage 3 must extend `RetainedStackItem` + `#retainedProjection` to carry
  the binding, or a restart will silently lose it, exactly as the error state is lost here. Cross-ref
  the R-021 change (`openspec/changes/runtime-fixed-layers/`).
- **Reproduction is MANUAL** (owner, real Runtime + real bridge, 2026-07-25): load past the dynamic
  pool size so further loads error with "no layer", then kill the bridge process — the ERROR rows
  flip to READY. No automated reproduction exists.
- ⭐ **FIXED 2026-08-11** in `openspec/changes/runtime-retention-state/`, together with [[B-109]] and
  [[B-108]] — one root, three faces. `RetainedStackItem.played: boolean` is REPLACED by
  `state: 'on-air' | 'loaded' | 'cleared' | 'error'` plus an `errorCode`, mapped by ONE canonical
  `retainedStateFor()` in `@cg/shared-schema` (the item's own note about "two status-derivation
  sites that can drift" is why it lives there and not in the store). `#retainedProjection` now maps
  `error` → `error` with its code and `cleared` → `idle`, so nothing collapses onto `loaded`.
  Reproduction is no longer manual: `apps/runtime/tests/e2e/retention-honesty.spec.ts` kills a real
  bridge process under a real browser.
- ⚠ **ONE PART OF THIS ITEM WAS DELIBERATELY NOT DONE, and it is a decision rather than an
  oversight.** The acceptance says an errored or cleared row must never resolve to "`loaded`/READY".
  The STATUS half is fixed exactly as written. The WORD is not: `idle` and `loaded` both render as
  **READY** by a LATER owner decision (`runtime-unified-layer-rows` — "an operator does not perceive
  the difference and showing two states for one perception is false precision"), with the real
  difference kept in `readyDetail`'s tooltip. That decision post-dates this item and was made on its
  own grounds, so re-opening it belongs to whoever revisits the row language, not to a bug fix.
  **The dangerous case named in this item's title — `error` → READY — IS fixed**: an errored row
  renders ERROR with its code. What remains is the milder `idle` → READY, on a row whose tooltip
  says the layer is empty.

## [~] B-108 — a bridge restart silently DROPS stack rows it cannot re-seat: `restore()` skips them and returns a `skipped` count no UI surface consumes ⟨priority: medium⟩ — FIXED and on `dev`: `openspec/changes/runtime-retention-state/` (the HONESTY face; `restore()` now returns per-item reasons and `#resync` consumes them)

**What:** on bridge restart the browser re-delivers its retained stack intent
(`StackRestoreChannel`) and the bridge's `restore()` re-seats what it can. Any item it CANNOT
re-seat is skipped and simply disappears from the stack — nothing tells the operator that rows
they were looking at a moment ago are gone, or why. The information is already computed:
`restore()` returns `{ restored, skipped }`, and `packages/shared-ipc/src/channels/stack.ts`
documents `skipped` as "intents the bridge declined (an item it already holds, an unregistered
template, no free layer)". The gap is that NOTHING consumes it — `WebSocketRuntime.#resync` awaits
the restore call and DISCARDS its return value.

**Why:** rows vanishing with no operator action silently desynchronises the operator's model of
the stack from reality — the same broadcast-safety hazard as a lie about on-air state, one step
removed. The count and its meaning already exist; only the operator-facing surface is missing.
Scope is the GENERAL case, not the exhausted range the owner happened to trigger: `restore()`'s
docstring names THREE skip reasons, and only one is layer exhaustion — (1) an item the live bridge
ALREADY holds (a page reload against a healthy bridge — benign, the row is still there, backed by
the live bridge, and nothing is lost), (2) an unregistered template (the SPA re-delivers its
library FIRST, so this means the template is genuinely gone), and (3) no free layer (the exhausted
range). Reasons (2) and (3) are real LOSSES — the row disappears; reason (1) is not.

**Acceptance:**

- WHEN a restore skips items that were on the operator's stack and are now GONE (the
  unregistered-template and no-free-layer reasons) THEN the operator is told how many and why, in
  a surface they will actually see
- WHEN a restore skips ONLY the benign already-held case (a page reload against a healthy bridge,
  which loses no row) THEN nothing is surfaced — no false alarm
- (the widget is deliberately unspecified — that is for whoever implements)

**Notes:**

- **Verified: NO existing UI surface consumes `skipped`.** `WebSocketRuntime.#resync` does `await
this.#invoke(StackRestoreChannel, …)` and drops the `{ restored, skipped }` result; nothing
  subscribes to it or renders it. So this is a real gap, not a narrower one — the item is not
  overstated.
- The `skipped` count and its three-reason meaning already exist ([[B-092]]: `restore()` returns
  it; `packages/shared-ipc/src/channels/stack.ts` documents it). Only the surface is missing.
- **Not a regression from #405** (verified, not asserted): `restore()` and its skip/return are
  [[B-092]] (`#343`, 2026-07-18), predating R-021. R-021 stage 2a (`#404`) last-touched
  `caspar-runtime.ts` for the fixed-bank wire contract, not this path.
- **Owner product direction (2026-07-25), a decision not an open question:** the R-021 fixed-bank
  model (import/load onto pre-declared permanent rows) does NOT narrow this item — two of the three
  skip reasons survive under fixed rows (a fixed slot can still lack its template; a dynamic load
  can still exhaust the dynamic range), so a restore can still drop rows silently.
- **Open architectural question (record, do NOT answer):** whether the R-021 fixed bank COEXISTS
  with the dynamic pool or eventually REPLACES it. On `main` the locked design COEXISTS —
  `LayerManager` fences fixed slots from birth and `allocate()` never returns one even when the
  dynamic range is exhausted (unit test T1, `packages/caspar-client/tests/layer-manager.test.ts`).
  The answer shapes R-021 stage 3.
- **Reproduction is MANUAL** (owner, 2026-07-25): load past the pool size, kill the bridge, restart
  it — only the layer-holding rows come back; the rest are gone with no message. No automated
  reproduction exists.

## [~] B-109 — a bridge restart RE-ADDs a deliberately CLEARed graphic onto its layer: retention stores `played:false` for both `idle` and `loaded`, so `restore()` cannot tell "cleared, leave empty" from "loaded, re-seat" and re-loads the producer UNASKED ⟨priority: high⟩ — FIXED and on `dev`: `openspec/changes/runtime-retention-state/` (the WIRE face of the shared root)

**What:** an operator CLEARs a graphic (the stack's `out` verb) to take it off air but keeps the
row to re-take later — an `out` is NOT a `remove`, so the row stays on the stack, reconciled
`idle`, with its layer slot still RESERVED (`caspar-runtime.ts` `out()` sends `CG CLEAR` and
deletes `#loaded`, but NOT `#slots` / `rec.slot`; its comment: "the slot stays RESERVED (the item
is still on the stack, idle) until remove"). When the bridge PROCESS restarts, the browser
re-delivers its retained stack intent and the cleared row is not only re-seated — its producer is
RE-LOADED onto the layer by a `CG ADD` the operator never issued. This is the ON-AIR/wire twin of
[[B-107]]; both grow from the same root — retention does not model status.

Traced on merged `main`: `StackRetentionStore` reduces reconciled state to `played` + slot and
DROPS status (`isPlayed('idle')` is `false`, exactly like `loaded`), so a cleared `idle` row and a
pre-rolled `loaded` row are IDENTICAL in retained intent — `{ played:false, slot }`. On restart
`restore()` → `#slotForRestore` reserves the retained slot (the item is NOT skipped: it has a slot
and a registered template, so this is NOT [[B-108]]'s drop path), `restoreItem` seeds it at
`loaded`, and `#decidePendingRestores` finds the layer SILENT (the operator's CLEAR emptied it) and
takes its "silent → the producer is gone, so re-ADD as loaded" branch: `applyIntent({kind:'load'})`

- `#sendAdd` = `CG ADD`. That branch exists to recover a LOADED item whose producer a CasparCG
  restart destroyed; it cannot tell that apart from a producer the OPERATOR destroyed with a CLEAR,
  because retention dropped the one bit that distinguished them.

**Why:** this is an ON-AIR/wire behaviour defect, not a display one. A graphic the operator
deliberately removed is put back onto its layer by a `CG ADD` nobody asked for; the producer is
resident again and the row returns as `loaded`/READY — one `CG PLAY` from air. The operator's model
("I cleared that; the layer is empty") is silently falsified against the wire after a restart. It
directly UNDERMINES the [[B-092]] restart-survival design (`#343`), whose whole safety property is
"a restore can never change what is on a layer" — it is occupancy-aware precisely so it never CLEARs
a LIVE layer, yet the same path RE-ADDs onto a layer the operator EMPTIED: the mirror-image
violation. It protects a surviving producer but resurrects a cleared one.

**Acceptance:**

- WHEN an item is reconciled `idle` because the operator CLEARed it (out, not remove) and the bridge
  restarts THEN `restore()` must NOT re-ADD its producer onto the layer — a cleared graphic stays
  cleared until the operator re-takes it
- WHEN retained intent is re-seated after a restart THEN a cleared (`idle`) row is DISTINGUISHABLE
  from a pre-rolled (`loaded`) row, so the re-ADD decision can honour "the operator emptied this
  layer on purpose"
- WHEN the layer is silent at restore because the operator CLEARed it THEN silence is NOT read as "a
  loaded producer was lost, re-ADD it" — the `#decidePendingRestores` silent branch must not
  resurrect a deliberately cleared item

**Notes:**

- **Root cause SHARED with [[B-107]]:** `StackRetentionStore` reduces reconciled state to `played` +
  slot and drops `status`, so `idle` (cleared) and `loaded` (pre-rolled) become the same retained
  record. B-107 is the DISPLAY face (`#retainedProjection` shows both as READY); this is the WIRE
  face (`restore()` re-ADDs both). A fix that teaches retention to carry the cleared/`idle`
  distinction addresses both faces.
- **NOT [[B-108]]'s territory** — this is the exact prediction that gated the filing, and it came
  back FALSE. B-108 is items restore SKIPS (no slot / unregistered template / no free layer). The
  cleared item is NOT skipped, because `out` RETAINS its slot: verified `out()` never calls
  `#slots.delete` or `#layers.deallocate` (only `remove()` does, `caspar-runtime.ts:1579`), so
  `#slotForRestore` reserves the retained slot and restore RE-SEATS the item. The slot survives the
  CLEAR, which is exactly why the chain is reachable.
- **Reachable in NORMAL operation, not an edge case:** clearing a graphic but keeping its row IS the
  ordinary out-vs-remove workflow, and [[B-092]] restore runs on every bridge restart against a
  healthy primary with a warm OSC tap. (On an OSC-blind install `#decidePendingRestores` REFUSES to
  decide and sends nothing — so the re-ADD fires on OSC-working installs, the intended config.)
- **Precise on the wire:** the re-ADD is `CG ADD` with play-on-load OFF, so the producer is re-loaded
  HIDDEN (B-053: the html page stays hidden until the template's own play()), not re-played. The
  defect is the UNREQUESTED wire mutation restoring a cleared producer to `loaded`/READY, not an
  instantly-visible graphic — but it is one operator take from air, and the wire no longer matches
  what the operator did.
- **Verification level:** filed from a VERIFIED code trace on merged `main` (every step read:
  `out()` retains the slot; `toRetained`/`isPlayed` drop status; `#slotForRestore` reserves;
  `#decidePendingRestores` silent → `#sendAdd`), NOT from an owner sighting of this specific chain
  and NOT from a runtime/hardware run. Fix direction (do NOT implement): model the cleared/`idle`
  distinction in `RetainedStackItem` so restore leaves a cleared layer empty. Not resolved here.
- **Reproduction is MANUAL** (no automated reproduction exists): load a graphic, take it, CLEAR it
  (leaving the idle row on the stack), then kill and restart the bridge — the producer is re-ADDed
  onto its layer and the row returns READY.

## [~] B-113 — a field's chosen source FILE is lost on every page refresh, and the delimiter list hides four of its five options behind a text input the operator must first clear ⟨priority: high⟩ — FIXED and on `dev`: `openspec/changes/runtime-from-file-persistence/` (20/21 tasks). Both halves are implemented — the attachment now writes through to IndexedDB on every mutation and is restored on load (`fromFileStore.ts`), and the delimiter list no longer hides behind the input. **The ONLY thing between this and `[x]` is task 6.2, an OWNER BROWSER CHECK** on a Chromium that does NOT auto-grant the File System Access permission: the needs-gesture path is covered by unit test against a FAKE handle, but the real prompt's wording and timing on this station's browser has never been seen, and a fake handle cannot prove it

**What:** two defects in R-018's "from file" affordance, both reported by the owner from live
use, both in the same control:

1. **The chosen file does not survive a refresh.** `fromFileStore.ts` keeps the attachment in a
   module-level `Map` (`const entries = new Map<string, FromFileState>()`), keyed by
   `itemId + fieldPath`. Nothing writes it to `localStorage`, OPFS or IndexedDB and nothing
   sends it over the bridge, so a page reload — which an operator does routinely, and which the
   SPA also does on its own after certain recoveries — drops every attachment silently. The
   field keeps its last applied VALUE, so nothing looks broken; the operator only discovers the
   loss when Reload is gone and the file must be picked again mid-programme. (A bridge
   disconnect/reconnect is NOT affected — the store is never cleared on link change and item
   ids are stable across it — but the owner reported both together and both must hold.)

2. **The delimiter list is invisible until the input is cleared.** The control is a free-text
   `<input>` backed by a `<datalist>` (`FromFileControl.tsx`), initialised to `DEFAULT_DELIMITER`
   = `\n`. A `<datalist>` FILTERS its options against the input's current value, so with `\n`
   already in the box the only matching option is "new line" — pipe, Persian comma, comma and
   semicolon are all filtered out. The operator must delete the input's contents to discover
   that four other delimiters exist, and a plain text input carries no dropdown affordance to
   suggest they do. Worse, the popup renders the option's raw `value`, so what is offered reads
   as the escape sequence `\n` rather than "new line".

**Why:** (1) is data loss in an operational surface — the whole point of a file source is that
the operator stops hand-typing content, and an attachment that evaporates on refresh returns them
to hand-typing at the worst moment. (2) is a discoverability failure that makes the feature look
like it supports one delimiter: the Persian comma entry exists precisely because Persian content
needs it, and a Persian operator cannot find it. The control is also free-text where it should not
be — a delimiter typed by hand is a way to produce a split nobody intended.

**Acceptance:**

- A field's file attachment (the handle, the split flag and the delimiter) survives a page
  refresh: after reload the field still names its file and still offers Reload.
- Where the browser cannot restore READ permission without a gesture, the restored attachment
  says so plainly and offers the gesture — it never silently presents an unreadable file as
  attached, and never reads stale content in place of the file.
- A field's file attachment survives a bridge disconnect and reconnect.
- The delimiter control presents ALL configured delimiters at once, by NAME, with no typing
  required and no filtering step.
- The delimiter control cannot be free-typed.

## [x] B-114 — a bridge RESTART empties every declared row and leaves it unable to accept a new load: `#slotForRestore` re-seats a retained fixed coordinate with `reserve()`, which refuses fixed slots by construction ⟨priority: high⟩

**What:** restart the bridge process and every declared layer row loses the template on it —
the row publishes `binding: null`, so the operator's loaded graphics simply disappear from the
surface — AND the row's LOAD button is disabled, so nothing can be put back. Reported by the
owner from live use; reproduced in an integration test against a real AMCP mock, where the
restored row's binding is `null` (`fixed-layers-load.integration.test.ts`, the B-114 case).

Two mechanisms combine, and only one of them is a defect:

1. **The defect.** `restore()` → `#slotForRestore` re-seats a retained coordinate with
   `this.#layers.reserve(slot, …)`. `LayerManager.reserve()` returns `false` for a FIXED slot by
   construction — a fixed slot is born allocated, so it is never "free" to reserve, and
   `bindFixed` is the only door onto one (`fixedLoad` uses it; its comment says exactly this).
   The retained item therefore fell through to `#allocate()`, which either re-homed the
   operator's row onto some dynamic layer or, for a `custom` template type — whose range IS the
   reserved playout range — threw, so the item was SKIPPED entirely ([[B-108]]'s drop path).
   Neither branch records a `fixedBinding`, and `fixedLayersState` reads `binding` straight off
   `LayerManager.fixedBinding`, so every row published `null`.

2. **Correct behaviour that made it unrecoverable.** A freshly restarted bridge has heard no OSC
   yet, so each row's occupancy is `unknown`, and R-028 part B's load gate refuses a load onto
   anything not observably `empty` (fail closed — an unbound row can still be carrying a live
   graphic, [[B-093]]). That is right on its own. Combined with (1) the operator got a row that
   showed nothing and could do nothing.

**Why:** the operator's layer assignments are the whole operator surface. Losing them on a
restart is the [[B-092]] failure one level up: B-092 made the stack survive a bridge restart, and
this is the same promise broken for the row a stack item was assigned to.

**Fix (shipped):** `#slotForRestore` re-binds a retained coordinate that is a fixed slot through
`bindFixed`, using the registry's own `templateType` exactly as `fixedLoad` resolves it (binding
the raw `templateId` would restore the row under a UUID). `reserve()` is still tried first and
still correctly handles every dynamic coordinate. The rollback path releases by the same door it
took: `deallocate` returns early for a fixed slot on purpose (it must keep the fence), so a
refused `restoreItem` now calls `unbindFixed` instead — otherwise a failed restore left the row
bound to an item that does not exist, occupied forever and clearable by nothing.

**Acceptance:**

- After a bridge restart, an item retained on a declared row is bound to THAT row again, named
  by the registry's template type.
- The item's slot is its own row's coordinate — never re-homed into the dynamic pool.
- No other declared row is disturbed.
- A restore the reconciler refuses leaves the row UNBOUND, not stuck.

## [ ] B-115 — `PRIMARY A` sticks on `connecting`: `emitHealth`'s dedupe key collapses four FSM states into one, so only the first of them is ever published ⟨priority: high⟩

**What:** remove backup B from the server settings and the footer pill freezes on
`PRIMARY A CONNECTING` and stays there, while the link is in fact cycling normally. Reported by
the owner from live use; **diagnosed by reading the path end to end, NOT reproduced** — there is
one plant on this machine and no second box to fail over.

`RedundancyAdapter.emitHealth()` (`packages/caspar-client/src/redundancy/redundancy-adapter.ts`)
dedupes publishes on a key built from `effectiveState()`, and `effectiveState` collapses **four**
distinct `ServerSession` FSM states — `disconnected | connecting | handshaking | resyncing` — into
one value. `ConnectionHealth.primary.state` is rendered verbatim by `StatusBar.sessionLabel`, so
whichever of the four is published first wins and the other three are never emitted. The pill is
therefore reporting a state the bridge really sent; it is a state we fail to **re-report**, not one
we fail to leave. Secondary, and separable: `AmcpTransport.connect()` has no timeout, so a connect
that never completes is also never bounded.

The `connecting` here is the bridge-side FSM state, **not** the renderer's `useCasparReach` boot
window (which means "the bridge has not answered yet" and renders as `UNKNOWN` on this pill).

**It does not need a backup to occur.** Any `setConfig` takes the same path, so a single-server
plant can hit it. Removing B may simply be when a pre-existing A problem stopped being masked by
auto-failover.

**Why:** the pill is the operator's only readout of whether the playout link is alive. A pill
frozen on a word that was true once teaches the operator to distrust it, which is worse than no
pill — and it is indistinguishable, from the outside, from a link that really is stuck.

**ORIGIN — this is the cost of [[B-046]], and B-046 must NOT be reverted.** `B-046`
([bugs-runtime.md](bugs-runtime.md), `[x]`) introduced exactly this dedupe to kill health churn
and a primary double-emit, and it achieved that: its own note records "`emitHealth` dedupes by
effective liveness (churn + primary double-emit gone)", and its soak run publishes zero health
churn in steady state. The defect is that the dedupe key is **lossy** where it needed to be merely
**quiet**. Reverting the dedupe would revive the churn B-046 removed. The fix has to keep publishes
bounded while preserving the four states — publish the raw state through a coalescing window
rather than a lossy key.

**Do NOT touch `effectiveState` for the FAILOVER decision** — that use of it is correct, and is a
different question from what the pill displays.

**The ten-second test that separates the two readings, and it has not been run:** with the pill
stuck, **refresh the browser**. The word CHANGES → publish bug, as diagnosed. The word STAYS → A
really is in `connecting` and this is a connection defect instead. Recorded so the next session
runs it before writing code.

**Env:** Runtime + bridge, owner's plant. Source: `DEBT.md:119`, `DEBT.md:248` (the full
write-up), `DEBT.md:409`.

## [ ] B-116 — every bridge boot warns that a template is corrupt and tells the operator to re-import it, because `delimiters.json` is stored inside the templates directory ⟨priority: medium⟩

**What:** `DelimiterStore` persists to `delimiters.json` **inside** `--templates-dir`
(`~/.cg-runtime/bridge-templates/`), and `TemplateRegistry`'s loader reads every `*.json` in that
directory as a template. The delimiter file is not a template, so it fails schema validation and
every single boot prints a warning naming it as an unusable persisted template and instructing the
operator to re-import it.

**Nothing is actually broken** — the delimiters load correctly from their own store.

**Why:** the message is the loudest thing in the boot output and it is false. It tells the
operator a template is corrupt and instructs them to re-import it, on a machine where nothing is
wrong. A boot warning that is routinely untrue is worse than silence: it trains the operator to
scroll past the one boot line that will one day be real.

**Acceptance:**

- A bridge boot on a machine with persisted delimiters prints no template warning.
- A genuinely unusable persisted template still warns, with the same message.
- Existing delimiter configurations keep working across the change.

**Notes:** two candidate fixes and the choice is a small design call — skip the store's own
filename in the registry loader, or move the delimiter file up to `~/.cg-runtime/` alongside the
other bridge config. **The second is a migration** (an existing `delimiters.json` has to be moved
or it is silently abandoned), so it is not the one-liner it looks like. Source: `DEBT.md:230`.

## [x] B-117 — a reachability gate disabled the ENTIRE console in TEST MODE, because it asked "is a real CasparCG healthy?" instead of "will this command be executed?" ⟨priority: medium⟩ — **CLOSED 2026-08-03 WITHOUT ANY WORK BEING DONE: the defect was already gone when this item was filed, and the item says so in its own text. See the closing note at the foot of this entry.**

**What:** `useCasparReachable` answered from `useConnections()` alone. The offline mock reports a
`disconnected` primary **deliberately** — `seedHealth` is `disconnected` so that test mode never
wears a signal meaning a real server said something ([[R-006]]), and `testModeHonesty.dom.test.ts`
pins exactly that. So in test mode every AMCP verb went disabled behind "CasparCG cannot be
reached" while the mock stood ready to execute all of them. **14 E2E specs red** across
`fixed-layers`, `inspect-list-field`, `nested-composition-fields`, `onair-position`,
`rehearse-layout`, `server-settings`, `stage-inspector-edits` and `test-mode-honesty`.

**Fixed** in `8613772`, the session after the gate landed. Filed here as a **bug class**, not as a
fix note, because the shape will recur.

**Why it is filed after the fix:** the gate violated, in the opposite direction, the exact rule it
was built to enforce — a control refusing when it would have succeeded. The question a
reachability gate asks is **"will this command be executed?"**, not "is a real CasparCG healthy?".
In test mode the mock IS the executor, and `offline-mock` was already the honest wire signal for
"the simulator is the far end". Reading the link as well as the health makes test mode reachable.
**That is not an exception carved out of the rule — it is the rule stated correctly.**

**The fix that would have been a lie, named because it is EASIER and was one line away:** making
the mock report a `healthy` primary also turns the suite green, and is an [[R-006]] violation —
the mock claiming a server it does not have. Any future reachability change must not reach for it.

**Caught only by `gate:e2e`.** No unit or DOM test noticed that every verb in the app had gone
dead, which is worth knowing when deciding what a future gate change owes.

**Env:** Runtime, test mode. Source: `DEBT.md:796`.

---

### CLOSING NOTE — 2026-08-03. **NO WORK WAS DONE FOR THIS ITEM.**

**Read this before assuming a fix shipped in response to this entry.** Nothing was implemented,
nothing was changed in the reachability path, and no test was added. **The defect described above
had already been resolved before this item was filed** — by `8613772`, the session after the gate
landed.

**What was measured on 2026-08-03:**

- **The gate no longer asks the health question first.**
  `apps/runtime/src/renderer/hooks/useCasparReachable.ts:96` —
  `if (link === 'offline-mock') return 'reachable';` — the link branch precedes any health read
  inside `resolveCasparReach` (`:92-99`), and `useCasparReachable()` (`:57-59`) is that resolver
  folded to a boolean. `useCasparReach()` (`:75-79`) feeds it `useLink()` **and**
  `useConnections()`, where the pre-fix version answered from `useConnections()` alone.
- **The rationale is written into the file, not left to this item.**
  `useCasparReachable.ts:40-45` — _"TEST MODE IS REACHABLE, AND THIS IS NOT AN EXCEPTION TO THE
  RULE — IT IS THE RULE. The question is 'will this command be executed?', not 'is a real CasparCG
  healthy?'"_ — and `:47-55` records why the mock was **not** changed instead, which is the
  [[R-006]] violation this entry names as the easier wrong fix.
- **The commit exists and carries a regression test.**
  `8613772` (2026-07-31), _"fix(runtime): test mode refused the verbs it exists to simulate"_,
  touching `useCasparReachable.ts`, `apps/runtime/tests/support/reachability.ts` and
  `apps/runtime/tests/testModeHonesty.dom.test.ts` (+77/−6). The pin is at
  `apps/runtime/tests/testModeHonesty.dom.test.ts:131` — `stubLink('offline-mock')`, then an AMCP
  verb asserted **enabled**.
- **The "caught only by `gate:e2e`" complaint at `:2637` is therefore also discharged**: the same
  commit added the DOM-level coverage whose absence the entry records.
- **[[R-006]] honesty is preserved.** The mock is untouched and still reports a `disconnected`
  primary; nothing was made to claim a server it does not have.

**HOW THIS DIFFERS FROM [[B-118]], because the difference matters.** B-118 was filed from a
`DEBT.md` row whose subject had silently moved — the filing session did not know. **Here the filing
session DID know and wrote it down**: `:2623-2624` reads _"**Fixed** in `8613772`, the session
after the gate landed. Filed here as a **bug class**, not as a fix note, because the shape will
recur."_ The entry was correct in its body and wrong only in its **checkbox**. That is a distinct
failure — not a stale observation, but an unchecked box contradicting the prose beneath it — and it
produces the same symptom: a PRD carrying an already-fixed defect at `[ ]`.

**The bug-class record is the part worth keeping, and it survives this closure.** The rule the
entry exists to state — _a reachability gate asks "will this command be executed?", not "is a real
server healthy?"_ — is preserved above and is now also stated at the code (`:40-45`). Closing the
box does not retire the rule.

## [x] B-118 — `enterRehearse` reports a flat `mute-failed`, but CasparCG never refuses `MIXER VOLUME` — the real cause is an unreachable server, and the error names the wrong thing ⟨priority: high⟩ — **CLOSED 2026-08-03 WITHOUT ANY WORK BEING DONE: the defect was already gone when this item was filed. See the closing note at the foot of this entry.**

**What:** the rehearse path reports `mute-failed` as though CasparCG had rejected the mute.
**Measured against the owner's own plant** (`127.0.0.1:5250`, `2.5.0 69e8ad5 Stable`), raw AMCP on
layer 1-88 (outside the bank and outside the reservation, cleared afterwards):

| command                                            | response       |
| -------------------------------------------------- | -------------- |
| `MIXER 1-88 VOLUME 0` — **empty layer**            | `202 MIXER OK` |
| `MIXER 1-88 VOLUME 1` — empty layer                | `202 MIXER OK` |
| `MIXER 1-88 VOLUME 0` — **producer resident**      | `202 MIXER OK` |
| `MIXER 1-88 VOLUME 0` — **after `CG 1-88 STOP 0`** | `202 MIXER OK` |

CasparCG accepts `MIXER VOLUME` in **every** state tested, including on an empty layer. So a
`mute-failed` verdict cannot mean "the mute was refused"; on this plant it can only mean the
command never reached a server at all.

**Why:** the operator is shown a specific, confident, wrong cause. `mute-failed` sends them
looking at audio and at the mute logic, when the actual condition is an unreachable server — a
different problem with a different remedy. An error that names the wrong subsystem costs more time
than a generic one.

**Acceptance:**

- A rehearse that fails because the server could not be reached says so, and does not attribute
  the failure to the mute.
- A `MIXER VOLUME` that genuinely returns a non-202 response still reports a mute failure.
- The distinction is visible to the operator, not only in the log.

**Notes:** this measurement is also load-bearing for [[B-119]] — it is what makes "unreachable
server" the more likely reading there. Source: `DEBT.md:1012`.

---

### CLOSING NOTE — 2026-08-03. **NO WORK WAS DONE FOR THIS ITEM.**

**Read this before assuming a fix shipped.** A bare `[x]` on this entry would say "someone fixed
it", and that would be a second false claim replacing the first. Nothing was implemented, nothing
was changed in the rehearse path, and no test was added. **The defect described above had already
been resolved by other work before this item was ever filed.**

**What was measured on 2026-08-03:**

- **`enterRehearse` no longer produces `mute-failed` at all.** Its only refusals are
  `unknown-item`, `busy` and `on-air`. On the resident-producer branch the mute is **BEST EFFORT**
  and **entry never fails on it** — see the `§4 — THE MUTE IS BEST-EFFORT. ENTRY NEVER FAILS ON IT`
  block in `tools/caspar-bridge/src/caspar-runtime.ts`, inside `enterRehearse`.
- **The wire contract says so explicitly.**
  `packages/shared-ipc/src/channels/rehearse.ts:87` — _"NOTE — `mute-failed` CURRENTLY HAS NO
  PRODUCER, and that is deliberate rather than an oversight. Entry no longer refuses when the mute
  does not land."_ The code is kept in `REHEARSE_ENTER_REASONS` so that a future decision to fail
  closed on a genuine server REFUSAL would use exactly this word, and because removing it would
  silently narrow the wire.
- **Why the refusal was dropped**, recorded there rather than inferred here: refusing made `ON PVW`
  behave differently on two rows the operator considers identical — a row closed with `STOP` keeps
  its producer so the mute branch ran and failed, while a row closed with `CLEAR` took the
  zero-AMCP path and succeeded.

**The original observation was ACCURATE and is now SUPERSEDED.** `DEBT.md:1012` measured, against
the owner's own plant, that CasparCG never refuses `MIXER VOLUME` — that measurement stands and is
still the load-bearing fact behind [[B-119]]. What changed is the code it described: the flat
`mute-failed` report it complained about no longer exists. The entry was true when written and had
been overtaken by the time it was filed.

**The class, because this is its third instance in the `DEBT.md` sweep:** a debt note that was
accurate when written becomes a **false claim** the moment its subject is resolved and nothing
records the discharge. Filing from such a note produces a confident, wrong bug report. See
`DEBT-SWEEP.md`'s closing section, where the class and the sweep-wide exposure it implies are
recorded.

**One thing deliberately NOT filed as a defect.** The best-effort exchange gives something up, and
the code states it openly: with the mute unlanded, a resident producer stays unmuted while the row
claims PVW, and on 2.5.0 a resident producer's audio can be on air ([[R-029]]). That is a
**recorded decision with a stated rationale**, not an observed defect — PVW sends nothing to the
layer, and the common case for a failed mute is an unreachable server where nothing reaches air
anyway. Filing it would be recording a decision as a bug on no evidence. It is carried instead as
one line of **owed measurement** in `DEBT-SWEEP.md`, to be answered on real hardware alongside the
[[C-018]] / [[C-019]] work: _on 2.5.0, with the mute unlanded, does a resident producer stay
audible while the row claims PVW?_ If the answer is yes, it becomes an item then, with a
measurement behind it.

## [ ] B-119 — whether `unknown` was ever displayed while a server was CONNECTED is INFERRED, not observed — and the alternative reading is a second defect ⟨priority: unrated⟩

**MECHANISM NOT DIAGNOSED. This entry records an open question and the one observation that
settles it. No cause is written here on purpose.**

**What:** the owner saw layer slots reading `unknown`. Two readings fit, and they need different
fixes:

1. **One root cause, both symptoms.** `MIXER VOLUME` succeeds in every state on this plant (see
   [[B-118]]), so `mute-failed` can only have come from an **unreachable** server — and an
   unreachable server is also exactly what makes the occupancy tap silent and every slot read
   `unknown`. If this holds, the rule "show `unknown` only when we have positive reason to believe
   the layer may be occupied" fixes the display and nothing else is owed.
2. **A second defect.** Connected, occupancy reported the layer unoccupied, and `unknown` was
   displayed anyway. **This is NOT ruled out**, and the rule in reading 1 would MASK it rather
   than fix it.

**Why it is `unrated`:** the severity depends entirely on which reading is true, and the evidence
to choose does not exist. Rating it now would be inventing a number.

**The observation that settles it, and it needs the owner:** when the slots read `unknown`, was
the link indicator reading LIVE? That single observation separates a display bug from a second
defect. It could not be taken by the session that filed this — it could not observe the owner's
session, and this machine has one plant.

**Do not implement the reading-1 rule until this is answered** — if reading 2 is true, shipping
that rule hides the defect behind a correct-looking display.

**Related:** [[B-093]] (`[x]`) fixed the safety consequence of a blind occupancy tap (a restart
re-ADDing over a live layer). It did not answer the display question above.
Source: `DEBT.md:1048`.

## [ ] B-120 — `PLAY` is enabled on a bound row whose template has left the registry, so the operator is told the row will reach air and finds out otherwise at the take ⟨priority: high — reaches air⟩

**What:** the PLAY verb is gated on `empty || playing || rehearsing` and knows nothing about
whether the row's template can still be **resolved**. On a bound row whose template has left the
registry, PLAY therefore invites a take that `take()` refuses with `unknown-template`.

**Left open deliberately** by the `dev-cleared-row-state` sweep, which is otherwise complete: that
sweep measured every layer-acting verb on a cleared row and found nothing else to fix (`PLAY` on a
cleared row genuinely reaches air via `take()`'s B-039 pre-roll, asserted on the wire in
`tools/caspar-bridge/tests/cleared-row-verbs.integration.test.ts`).

**What it is NOT — recorded so the severity is not over-read.** The failure is **not silent**: the
refusal surfaces as the command toast, and the row's template cell already reads
"(not in this browser)". The operator is told — just at the moment air needs it.

**Why it still rates high:** it is the dangerous direction. A control that says "this will go to
air" and then refuses at the take is worse than one that refuses early, because the operator has
already committed the slot in their head. This is a take-time failure on an on-air path.

**Notes — the honest fix is a DECISION, not a patch,** which is why it was left open:

- either PLAY gates on template availability — which re-opens "do not gate PLAY on
  occupancy-adjacent facts", and note the renderer's view of the registry is **not** the bridge's,
  so the gate would be built on the wrong side unless that is solved;
- or the row refuses earlier and louder, and PLAY stays ungated.

Source: `DEBT.md:1092` (the residual, inside the CLEARed-row sweep entry at `DEBT.md:1064`).

## [x] B-121 — `CG ADD` site 2, the reconnect reconciliation, is not rehearse-guarded, so a bridge blip re-ADDs an UNMUTED producer under a rehearsing row ⟨priority: high — reaches air⟩ — FIXED 2026-08-14, `openspec/changes/live-source-multibox/` (tasks 6.5c / 6.5d)

**What:** a sweep of every `CG ADD` call site in `caspar-runtime.ts` found four, and asked of each
whether the rehearse guard covers it:

| #   | site                          | what it is                                   | rehearse-guarded?                          |
| --- | ----------------------------- | -------------------------------------------- | ------------------------------------------ |
| 1   | `#loadOnto` (via `loadFixed`) | the operator's LOAD                          | **YES** — added by `dev-cleared-row-state` |
| 2   | reconnect reconciliation      | a silent layer re-ADDed after a bridge blip  | **NO — this bug**                          |
| 3   | `setPosition`                 | re-ADD so the new `?pos=` query takes effect | NO, and it is safe                         |
| 4   | `take()` B-039 pre-roll       | PLAY's implicit ADD on a cleared row         | YES — `take()` refuses `rehearsing` first  |

Site 2 runs without operator action, after a reconnect, and is the one uncovered path.

**Why:** on 2.5.0 a bare `CG ADD` puts the template's audio on the channel ([[R-029]]). The whole
point of the rehearse mute is that a rehearsing row never reaches air; a reconnect that silently
re-ADDs an unmuted producer under a row the UI shows as rehearsing defeats it, without the
operator doing anything. It is the same leak the guard on site 1 exists to prevent, arriving by a
path nobody triggers on purpose.

**Acceptance:**

- A reconnect reconciliation that would re-ADD onto a rehearsing row either mutes before the ADD
  or does not ADD.
- The guard is asserted on the wire, not only in the renderer — a renderer-only guard is the shape
  site 1's fix explicitly rejected.
- Sites 1, 3 and 4 keep their current behaviour.

**FOLDED INTO `live-source-multibox` 2026-08-08 (owner).** This bug, [[R-029]] and [[R-042]] are one
problem under one rule (design.md §7): every bridge-created producer is created muted, audio raised
only by explicit recorded intent. Site 2 is fixed under that rule — **mute before the re-ADD, or do
not ADD** — asserted on the wire, since a renderer-only guard is the shape site 1's fix explicitly
rejected. Task **6.5d** additionally pins **all four** sites with one test, so site 3's "unchanged
and safe" stops being a claim in a table and becomes an assertion — a table that is not pinned is
re-derived by the next sweep.

**FIXED 2026-08-14 — at the chokepoint, not at the site.** The mute lives in `#sendAdd`, which is the
single emit point every one of the four callers goes through, so site 2 is closed together with the
other three rather than by a guard of its own. `live-add-mute.integration.test.ts` drives each site
through its REAL entry point — site 2 through `restore()`, the way a reconnect reaches it — and
asserts the `MIXER … VOLUME 0` index precedes the `CG ADD` index in the AMCP trace. Verified by
MUTATION: with the mute removed, five of the six tests go red.

⚠ **THE TABLE ABOVE IS STALE IN ONE ROW, and it is left standing with this correction rather than
quietly edited.** Site 1 is listed as rehearse-guarded; it is not. The guard was removed when LOAD
became LIST-ONLY (`loadFixed` emits no AMCP at all) — the stronger form, and the code says so. What
the row misses is that `#loadOnto` has a SECOND caller, the dynamic `load()`, which is not list-only
and never had a guard at all. The mute covers it now. The same stale row appears in [[R-042]] and in
the design; all three are corrected there too.

**Notes:** related to [[R-022]] (the rehearse feature) and to the deferred `mute-before-ADD`
upgrade, which would change the ordering constraint here — on 2.5.0 the volume must land BEFORE
the `CG ADD`, never after. Source: `DEBT.md:1104`.

## [~] B-122 — `CLEAR ALL` is always ENABLED but is not always EFFECTIVE: it filters on the very statuses that may be wrong, and reports success having sent nothing ⟨priority: high — reaches air⟩

> ⚠ **`layers.clear` gained a FOURTH refusal reason on 2026-08-12 — `live-source`** (C-015 phase 5,
> a bridge-owned Live Source layer; it is neither `foreign` nor `owned`). Whatever fixes this item
> must honour it: the canonical list is `LAYER_CLEAR_REASONS` in
> `packages/shared-ipc/src/channels/layers.ts` — match on that, never on inline string literals.

**What:** the owner's decision was that CLEAR and CLEAR ALL are always enabled, because refusing
the remedy when the state model is confused strands a graphic on air. The UI does that. The two
halves do not deliver it equally:

- **The per-row CLEAR is genuinely effective.** `caspar-runtime.out(itemId)` requires only that
  the item has a bound slot — it does **not** inspect the status — so pressing CLEAR on a row
  sends `CLEAR <ch>-<layer>` whatever the status claims.
- **`CLEAR ALL` is not.** `caspar-runtime.clearAll()` filters on `status` before sending anything
  — i.e. it is gated on **precisely the statuses that might be wrong in the situation the escape
  hatch exists for**. If every item wrongly reads `idle`, CLEAR ALL sends nothing and returns a
  success with a cleared count of zero.

**Why:** a success report for a no-op is the worst available outcome — worse than a disabled
button, which at least tells the truth. The operator presses the emergency control, is told it
worked, and the graphic is still on air. Found by the adversarial self-review that
`dev-clear-bank-scoped` required, not by a test.

**Acceptance:**

- `CLEAR ALL` sends a clear for **every item with a bound slot**, regardless of its believed
  status.
- Its report counts what was actually sent; it never reports success for a no-op.
- The per-row CLEAR is unchanged.

**Notes:** the predicate change is on-air bridge behaviour, which is why it was left out of the UI
review that found it. Related: [[R-012]] is the Clear-All feature this defect sits inside. Source:
`DEBT.md:1539`, restated at `DEBT.md:2558` inside the `dev-clear-bank-scoped` DONE entry
(`DEBT.md:2456`).

⭐ **THE OPEN DECISION IS ANSWERED (owner, 2026-08-12): YES.** The question was whether CLEAR ALL
should hard-cut rows the model believes are merely `loaded` and not yet on air. **It does** — a
clear is sent for every item with a bound slot, whatever the status claims, `loaded` included.

**The rationale, recorded so it is not re-litigated: filtering on status IS the defect.** An
emergency control must not depend on the bookkeeping whose failure is the emergency. **Losing a
cued row is the accepted cost** — it loses its pre-rolled producer and re-ADDs on its next play,
which is cheap; the alternative cost is a graphic stranded on air with the console reporting
success, which is not.

**Landed 2026-08-12** in `4cbe3331` (`fix(caspar-bridge,runtime,shared-ipc): B-122/B-125`).

**Linux `gate:e2e` OWED and DISCHARGED** — `LayersPanel.tsx` changed (the confirm dialog, the
button’s aria-label and title, the result toasts), so the debt was owed on the UI rule, not on an
edited spec. Discharged by a COMPLETED, GREEN `e2e` job that actually RAN for that exact commit:
<https://github.com/yasermostafaee/cg/actions/runs/31573550952>.

What changed:

- `caspar-runtime.clearAll()` — the status filter is gone. The only remaining question is the
  STRUCTURAL one (does the item hold a slot), which is also the broadcast-safety property that
  keeps this per-LAYER.
- `stack.clear-all` now answers `{ ok, cleared, attempted, refused }`. `cleared` counts what
  CasparCG **accepted**, `attempted` what was **sent**, and `ok` is true only when something was
  owed and all of it landed — so no shape of no-op can return a success. `LayersPanel` reports all
  three outcomes (complete / partial / nothing sent) instead of discarding the result, which is
  how a bulk verb that sent nothing used to look like it had worked.
- ⚠ **A Live Source layer still refuses**, with C-015 phase 5's distinct `live-source` reason, via
  the same `#isLiveLayer` the other three ownership doors read. Pinned by a boundary test: the
  ledgered row survives and its identical unledgered neighbour is cleared.
- `isOnAir` survives as **STOP ALL's** predicate only, with the prohibition written on it. STOP is
  the one bulk verb where the status is the right question — `CG STOP` asks for an authored outro,
  which a never-played row does not have — and `clearAll`/`stopAll` now differ deliberately.

**Two findings from the fix, worth keeping:**

1. **On a HEARING plant this defect is nearly invisible**, because the occupancy tap keeps the
   status honest and the filter rarely excludes anything wrongly. It bites on the **OSC-less
   install** ([[B-094]] / [[B-101]]), where nothing corrects the belief. That is why the
   regression test is built on a deliberately deaf tap — a hearing one cannot construct the bug.
2. The old UI dialog **documented the defect in its own body text** ("this may send no commands at
   all … use CLEAR on its own row"), i.e. a bulk emergency control whose confirm dialog told the
   operator to use a different control. Worth reading as a signal: when wording has to apologise
   for a verb, the verb is what needs changing.

## [ ] B-123 — the failover banner overlays the monitor strip instead of pushing it down ⟨priority: low⟩

**What:** `FailoverBanner` is `position: fixed` (per `layout.ts`, deliberately, so it is not a grid
item), so while `PRIMARY A unhealthy (degraded)` is showing it **covers** the top of the
PREVIEW/PROGRAM panels rather than displacing them.

**Why:** the banner appears exactly when the operator most needs to see the monitors, and it hides
the top of both. Pre-existing and unrelated to the work that noticed it — but newly noticeable now
that there is real content under it instead of a placeholder line.

**Env:** Runtime, visible whenever the failover banner is up. Source: `DEBT.md:1714`.

## [ ] B-124 — `MIN_WORKSPACE_PX` does not mean what its name says: `clampInspector` ignores ~54px of shell chrome ⟨priority: low⟩

**What:** `MIN_WORKSPACE_PX` is treated as "viewport minus Inspector", but the shell also spends
~54px on padding, the gap and the divider. The workspace COLUMN is therefore that much narrower
than the floor implies.

**Why:** harmless today — the table's `tight` density fits in ~360px, far below any reachable
width — so this is filed as a **naming/correctness** defect rather than a layout failure. The
constant is load-bearing for a future minimum-width decision, and a constant that silently means
something narrower than its name is how that decision gets made on a wrong number.

**Env:** Runtime shell, pre-existing. Source: `DEBT.md:1722`.

## [~] B-125 — a bound-row race lets the unbound branch CLEAR a just-loaded producer, and the item's state machine still reads `loaded` while the layer is empty ⟨priority: high — reaches air⟩

> ⚠ **`layers.clear` gained a FOURTH refusal reason on 2026-08-12 — `live-source`** (C-015 phase 5,
> a bridge-owned Live Source layer; it is neither `foreign` nor `owned`). Whatever fixes this item
> must honour it: the canonical list is `LAYER_CLEAR_REASONS` in
> `packages/shared-ipc/src/channels/layers.ts` — match on that, never on inline string literals.

**What:** the row routes on `item === null` **at click time**. If an item is loaded onto the row in
the instant between render and click, the unbound branch sends a layer `CLEAR` that destroys the
just-loaded producer **without** going through `stack.out`. The item's state machine therefore
still reads `loaded` while the layer is empty, and the row misreports until the operator hits
REMOVE.

**Why:** it is not a safety hole in the bank sense — the layer is in the bank, not reserved, and
the operator did ask for a clear — but it leaves the model and the wire disagreeing about what is
on air, which is the condition every other honesty item in this file exists to prevent. A row that
says `loaded` over an empty layer is a row an operator will take.

**Acceptance:**

- After a successful bank clear, any item bound to that layer is reconciled, so no item reports
  `loaded` over a layer that was just cleared.
- The per-row CLEAR keeps working without consulting item bookkeeping.

**Notes — one fix was considered and REJECTED, recorded so it is not reproposed:** refusing the
clear when the layer is owned. That reintroduces dependence on the very bookkeeping this escape
hatch exists to bypass. The proper fix is to reconcile **after** a successful clear, which is
on-air bookkeeping and wants its own diff. Source: `DEBT.md:2207`, with the full finding at
`DEBT.md:2535` inside the `dev-clear-bank-scoped` DONE entry (`DEBT.md:2456`).

**Landed 2026-08-12** in `4cbe3331` (same commit as [[B-122]], and covered by the same
discharged Linux e2e run recorded there) — `clearBankLayer` calls a new
`#reconcileClearedSlot(slot)` **after** the CLEAR is acked, never before it, and never on a
refusal. The rejected fix was not reproposed: the clear stays unconditional and the bookkeeping
catches up behind it.

⭐ **THE DAMAGE HAS TWO HALVES, AND ONLY ONE OF THEM IS A STATUS STRING.** This was the finding
that shaped the test, and it is the part the item as filed understated:

1. **`#loaded` — the bridge's own producer record — is the durable half.** It is what `take()`'s
   B-039 pre-roll reads to decide whether to re-`CG ADD`. Left stale, the next take sends a bare
   `CG PLAY` onto an **empty layer**: accepted on the wire, and **nothing on air**. This never
   self-heals, on any install, and it is what the regression test asserts — on the COMMANDS, not
   on a rendered string.
2. **The published status is the fragile half.** On a plant with a working OSC tap it self-heals
   within one TTL (the tap observes `empty`, `freshTruth` derives `idle`), so a test written
   against the status alone would have **passed before the fix** and been a test of the tap. On an
   OSC-less install ([[B-094]] / [[B-101]]) the correction never arrives and the row lies until
   the operator hits REMOVE — the item's wording exactly.

**Two related gaps, deliberately NOT fixed here — recorded rather than actioned:**

- **`clearBankLayer` is a FOURTH clear door that C-015 phase 5 did not fence.** Phase 5 wired
  `live-source` into three doors (the R-009 sweep, the C-014 quarantine, `clearLayer`); this one
  checks only `reserved` + bank membership. Whether it should refuse a Live Source layer is a real
  question with two defensible answers: **(a) add the refusal** — a guest's face is never the
  operator's to cut from a bank row, and the ledger is bridge-owned config-like state, not a
  status; **(b) leave it** — this door's stated doctrine is that it consults nothing that can be
  wrong, and the ledger can be wrong. Not decided here because nothing seats a live producer until
  C-015 phase 6.1, so the case is not yet reachable. It must be decided **before** phase 6.1
  lands.
- **Live Source layers survive CLEAR ALL entirely.** Under phase 6 an item will own a template
  layer AND live plate layers; CLEAR ALL clears the first and refuses the second, so a guest feed
  could be left running with no template over it. That is phase 6's problem to answer (probably by
  tearing the item's live layers down with it), and it is named here so it is not discovered on
  air.

## [ ] B-126 — the adopt-`CLEAR` succeeded and the `CG ADD` after it failed, leaving the layer empty: the CLEAR/ADD pair is not atomic in the other direction ⟨priority: high — reaches air⟩

**What:** observed on the wire during a 2.5.0 recon session. The bridge sent its documented
sequence and the two halves disagreed — `CLEAR 1-71` returned `202 CLEAR OK`, and the
`CG 1-71 ADD 0 "<bridge-served http URL>" 0 "{…}"` after it returned `404 CG ADD FAILED`.

Layer 71 was left **empty**. The row reported `ERROR` honestly and its description column read
`empty`, so the UI did not lie — but a destructive step had committed before the constructive step
that repairs it was known to succeed.

**Why the diagnosis in the source log does NOT apply, and why this is still live.** That session
concluded 2.5.0 refuses `CG ADD` with an http URL. **That conclusion is void** — the real cause was
that CEF was dead in that CasparCG instance (`cef_executor Could not post task`), fixed by adding
an `<html>` block with a writable `cache-path` to `casparcg.config`; `CG ADD` with a bridge-served
http URL is fine. **The void kills the diagnosis, not the event.** The `CLEAR` did return 202 and
the `ADD` did return 404, and that sequence is possible whenever an ADD fails for any reason. If
anything the void makes this **broader**: a mere config fault is now a demonstrated way to fail an
ADD, so ADD failure is an ordinary operational condition rather than an exotic version
incompatibility.

**Why it is not covered by the existing guards.** [[B-100]] fixed the _re-read boolean_ route to a
CLEAR-then-nothing window — one condition gating both the destructive and the constructive step,
read once. This is a **different route**: the boolean was read once and was correct, and CasparCG
refused the ADD anyway.

**The mirror of [[B-056]] (runtime), not a duplicate of it.** The runtime B-056 is _the
adopt-`CLEAR` did not land and `load()` proceeded anyway_ — an unadopted live orphan renders under
an owned slot. This is the opposite half: the CLEAR **did** land and the ADD failed, so the layer
is empty. Same seam — the pair is not atomic — opposite failure modes. Neither subsumes the other.

**Acceptance:**

- A load whose `CG ADD` fails after its adopt-`CLEAR` succeeded does not leave the layer silently
  empty: it either restores what was there or reports the layer as empty in a way the operator
  cannot miss.
- The behaviour is asserted against an AMCP mock that fails the ADD, not only against a
  happy-path mock.

**Notes:** two shapes are open — probe-then-clear (establish the ADD will be accepted before
destroying), or restore-on-ADD-failure. Both are on-air bridge behaviour and want a decision.
Source: `DEBT.md:1531`.

## [ ] B-130 — three library E2E specs were DELETED rather than re-pointed, and [[B-083]]'s regression test went with them ⟨priority: medium⟩

**What:** `R-028` folded the Library into the stack, so the Library panel stopped existing as a
surface and the picker moved behind `LOAD`. The specification for that work
(`dev-list-vs-layer` v3 §5) said, verbatim: _"Re-point the two E2E specs at the picker reached
through `LOAD`. **Do not delete them** — their subject survives, only its entry point moved."_

**Three specs were deleted** (in `ed3aedc2`, merged as `14bc793b`), not re-pointed:

| deleted spec                         | what it asserted                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `library-inspector-dispatch.spec.ts` | Library + Inspector controls each dispatch on click                                    |
| `library-name-and-remove.spec.ts`    | display names; refuses removing a REFERENCED template; removes an unreferenced one     |
| `library-title-wrap.spec.ts`         | names wrap at WORD level, never one letter per line; every name stays within two lines |

**What replaced them, and what did not.** `apps/runtime/tests/templatePicker.dom.test.ts` was added
and covers three things — `LOAD` opens the picker and it offers both re-use and import; an empty
list points at the import control; nothing on the row or in its menu still says LIBRARY. **None of
those is any of the three subjects above.**

**Where each subject actually stands, measured:**

- **Remove semantics SURVIVED, one layer down.** `apps/runtime/tests/LibraryStore.test.ts:77`
  asserts _"remove: unreferenced → ok and gone; referenced → in-use refusal; unknown →
  unknown-template"_. That is the store, not the surface, but the property is pinned.
- **Title wrapping is GONE, at every layer.** A sweep of `apps/runtime/tests` for `wrap` /
  `two lines` / `per-character` / `word level` returns only unrelated hits (`asyncButton`,
  `inspect-list-field`'s row-wrap, `rehearse-layout`). **Nothing asserts it any more.**

**Why that matters: it was [[B-083]]'s regression test.** `B-083` (`[x]`, this file) is _"Library
names render ONE LETTER PER LINE: two rigid `nowrap` buttons take 63% of the row and the name's
`overflow-wrap: anywhere` lets it collapse to a one-character min-content"_. Its regression test
was `library-title-wrap.spec.ts`. Deleting it removes the only thing standing between that defect
and its return.

**And the subject DID survive, which is the whole point of the "do not delete" instruction.** The
picker renders each template's display name as the label of a `Button`, in a flex row beside a
rigid `Remove` button — `apps/runtime/src/renderer/features/fixedLayers/useTemplatePicker.tsx:183`
(`rowActions`, `display: flex`), with the name at `:190` and `Remove` at `:192`–`:198`. That is
structurally the shape B-083 described: a variable-length name competing for width with a rigid
button on one line.

**MECHANISM NOT MEASURED, and deliberately not asserted.** Whether the picker actually reproduces
B-083's per-character collapse depends on the shared `Button`'s own wrapping behaviour, which was
**not** measured here. This item reports a **coverage hole** — a shipped fix whose regression test
was deleted while its subject moved — not a reproduced defect. **Do not write "the picker wraps per
character" into this item without measuring it.**

**Acceptance:**

- A test asserts template names in the picker wrap at word level and never collapse to one
  character per line, at the widths the picker can actually reach.
- A test asserts display names are shown in the picker (the surviving half of
  `library-name-and-remove`).
- If any of the three deleted subjects is judged genuinely obsolete, that is recorded as a decision
  rather than left as a silent deletion.

**Notes:** the store-level half needs nothing — `LibraryStore.test.ts:77` already holds it. The
`library-inspector-dispatch` subject (controls dispatch on click) is likely covered incidentally by
the picker specs, but that was **not** verified and is not claimed here. Source:
`dev-list-vs-layer` v3 §5, recovered 2026-08-03; the census row is `DEBT.md:936`.

## [ ] B-135 — the Runtime's storage root is SILENTLY substituted: `initRuntimeWorkspace()` swallows an OPFS failure and hands back in-memory storage, so the template library and the retained stack are lost for the session with nothing said ⟨priority: high⟩

**What:** `apps/runtime/src/platform/library/workspace.ts` resolves the Runtime's one
persistence root like this:

```ts
try {
  return isOpfsSupported() ? await openOpfsWorkspace('runtime') : new MemoryWorkspace();
} catch {
  // OPFS can throw in insecure contexts / private modes — never let storage init
  // blank the app; fall back to in-memory (this-session-only) storage.
  return new MemoryWorkspace();
}
```

Both legs — the `isOpfsSupported()` false branch and the bare `catch` — resolve to a
`MemoryWorkspace`, and **nothing anywhere tells the operator.** That workspace is the root for
BOTH browser-local stores the Runtime owns: [[B-085]]'s `LibraryStore` (the operator's imported
templates) and [[B-092]]'s `StackRetentionStore` (the intent that makes the stack survive a
bridge restart). Both are constructed from it in `createRuntimeBridge.ts` and both hydrate
from it at boot.

So on any install where OPFS is unavailable or throws — an insecure context (plain `http://`
to a station box, which is exactly how a playout machine on a house LAN gets served), a private
window, a locked-down profile — the Runtime runs a full session that LOOKS normal: templates
import, rows load, the stack builds. Every one of those writes goes to memory. The first
reload, and the operator's library and stack are gone with no error, no banner, and no reason
given.

**Why:** this is [[B-104]]'s defect, on the Runtime surface, and [[D-150]] already removed it
on the Designer's. The Designer's `initWorkspace()` now returns
`WorkspaceInit { workspace, root: { kind, label, reason, detail? } }` — a degraded root is
REPORTED rather than swallowed, because "the app silently wrote a session's work somewhere it
will not be tomorrow" is a data-loss class no amount of resilience justifies. The Runtime kept
the old shape. The asymmetry is the bug: the two apps disagree about whether losing your
persistence root is worth mentioning, and the Runtime is the one where the loss lands during a
broadcast.

It is worse here than in the Designer in one specific way, and that is why this is filed
`high` rather than `medium`: an author notices a missing image. An operator does not notice a
retention store that is quietly volatile — they notice it at the moment the bridge restarts
mid-programme and the stack does not come back, which is the exact failure [[B-092]] exists to
prevent. A silent memory fallback turns a working safety net into one that is only pretending.

**Acceptance:**

- WHEN `initRuntimeWorkspace()` cannot open the durable root — OPFS unsupported, or
  `openOpfsWorkspace` throws — THEN the substitution is REPORTED, not swallowed: the caller
  receives the root's kind and the reason it degraded, in the same shape the Designer's
  `initWorkspace()` returns
- WHEN the Runtime is running on a degraded (session-only) root THEN the operator is told, in a
  surface they cannot miss, that the template library and the stack will NOT survive a reload —
  the loss is announced BEFORE it happens, never discovered after
- WHEN the durable root opens normally THEN nothing is surfaced and no degradation is reported
- WHEN the reason is one the operator can act on (an insecure context) THEN the message names
  the fix, rather than reporting only that storage is unavailable

**Notes:**

- **Filed, deliberately NOT fixed**, from the retention-state session (2026-08-11). It is the
  same class as the work that session did — a store that quietly loses the state it exists to
  hold — but a different surface and a different fix, and folding it in would have crowded out
  the on-air cluster.
- **Cross-refs:** [[B-104]] (the Designer-side data loss this mirrors), [[D-150]] (which fixed
  it there, and whose `WorkspaceInit` shape is the precedent to reuse — do NOT invent a second
  one), [[B-085]] (the library store on this root), [[B-092]] (the retention store on it).
- The E2E path is unaffected and must stay so: `isE2E()` returns a `MemoryWorkspace`
  DELIBERATELY, for run isolation. That leg is not a degradation and must not be reported as
  one — only the two failure legs are.
- **Not verified against a real degraded install.** This is filed from a code read of
  `initRuntimeWorkspace()` and its two call sites in `createRuntimeBridge.ts`; the insecure-context
  leg in particular has not been reproduced on a station box.

## [~] B-139 — the row's DRAFT chip and the Inspector disagree about a staged plate, in OPPOSITE directions, and the row's UPDATE verb is disabled off the same wrong boolean ⟨priority: medium⟩ — implemented: `openspec/changes/fix-plate-dirty-baseline/`

**What:** `isItemDirty` takes `appliedPlates` as an OPTIONAL third argument. The Inspector passes
it; **the stack row does not** — so for the row every staged plate is compared against a fabricated
`''` baseline instead of the assignment actually in force. Re-picking the value that is already
saved reads as dirty, and picking _not assigned_ reads as clean. Both surfaces are reporting on the
SAME staged edit and disagreeing about whether it is dirty.

**Repro:** a plate has source **A** assigned and saved. Then, in any order:

1. set the plate to **B**
2. set it back to **A** (the saved value)
3. set it to **not assigned**

**Expected:** (1) draft on the row and in the Inspector · (2) draft in NEITHER · (3) draft in BOTH.

**Actual:**

| action                | Inspector    | row / layer     | correct?      |
| --------------------- | ------------ | --------------- | ------------- |
| set to **B**          | draft        | draft           | ✅ both right |
| set back to **A**     | **no draft** | **draft** ❌    | row is wrong  |
| set to _not assigned_ | draft        | **no draft** ❌ | row is wrong  |

Order-independent, because the comparison depends only on the staged value and never on history.

**Env:** Runtime SPA, any build carrying the LIVE PLATES section. Read from the code at `3d25585`;
the reproduction is the owner's, on the running app.

**Why:** the arithmetic is one line, and the contract it breaks is written directly above it.

- `isItemDirty` compares each staged plate as
  `if (value !== (appliedPlates?.get(plateId) ?? '')) return true;`
  (`apps/runtime/src/renderer/features/inspector/draftStore.ts:270-274`). With `appliedPlates`
  omitted the right-hand side is always `''`, which is why a staged `'A'` against an applied `'A'`
  reads dirty and a staged `''` against an applied `'A'` reads clean. Both observed rows fall out
  of that single expression.
- **The Inspector passes the map; the row does not.** `Inspector.tsx:400-404` calls it as
  `isItemDirty(itemId, item.fields, appliedPlateSources(item.templateId, info?.liveSources?.sources ?? []))`.
  `LayersPanel.tsx:760` calls it as `isItemDirty(item.itemId, item.fields)`.
- 🔴 **The docstring states a contract the code does not implement**, and it names the very call
  site that suffers: _"`appliedPlates` is optional because most callers hold no assignment map (the
  stack row's dirty dot, for one) … **Omitting it means 'I am not asking about plates'** — never
  'this item has none'"_ (`draftStore.ts:248-257`). Omitting it does not skip plates; it compares
  them against a value nobody supplied. This is `CLAUDE.md` golden rule 6 one level out — the
  contract is asserted in prose and not tested by the implementation.
- 🔴 **It BREAKS A LIVING SPEC, not merely an internal consistency.**
  `openspec/specs/runtime-ui/spec.md:87-90`, _"Scenario: Dirty state is visible"_: **WHEN** an item
  has staged-but-unapplied edits (R-003) **THEN** a dirty-dot on the field and a `● draft` chip on
  **the row + Inspector** are shown in the dirty hue. The requirement names BOTH surfaces, so a row
  that disagrees with the Inspector is a shipped requirement violated, and the regression test has a
  spec scenario to map onto.
- 🔴 **It is not only cosmetic.** The row's **UPDATE verb is disabled on `!deps.dirty`**
  (`apps/runtime/src/renderer/features/layers/layerRowActions.ts:713`), fed by the same boolean. So
  setting a plate to _not assigned_ both hides the chip and **disables the row's UPDATE** on a row
  that genuinely has an unapplied edit — the exact failure the Inspector's own comment warns about
  one level in: _"an Update the operator cannot press … would be the panel disagreeing with its own
  controls about whether there is an unapplied edit."_
  ⚠ **Scope it precisely:** the same expression gates on air-state FIRST —
  `empty || !onAir || !deps.dirty || blocked || needsCaspar` (`:713`), with
  `const onAir = item !== null && isOnAir(item);` (`:363`). So the disabled-UPDATE consequence
  applies only to a row that is **already on air** — which makes it narrower than "any row" and
  **worse where it lands**, because that is precisely where an unapplied edit matters.
- **The canonical join already exists.** `appliedPlateSources(templateId, sources)`
  (`features/inspector/livePlates.ts`) is already the one join, read by the Inspector's LIVE PLATES
  section, by `isItemDirty`'s Inspector call, and by `PreviewPanel`. The row needs to call the same
  thing, not a new one.

**Two misdiagnoses ruled out, recorded so the next reader does not chase them:**

- **NOT "one rule derived twice."** There is ONE predicate and it does compare values correctly.
  The defect is an optional parameter whose absence silently means "everything is unassigned". The
  fix is to supply the argument (or to make omission genuinely skip plates), not to delete a second
  implementation.
- **NOT the assignment-vs-override confusion** (the template-scoped assignment vs [[R-048]]'s
  per-row override). Both surfaces read the same staged plate draft; the reproduction rules it out.

**Acceptance:**

- WHEN a plate is set to a different source THEN the row and the Inspector BOTH show a draft
- WHEN a plate is set back to its saved source THEN NEITHER shows a draft
- WHEN a plate is set to _not assigned_ and the saved value was a source THEN BOTH show a draft
- WHEN those three actions are performed in any order THEN the outcome is the same, because the
  answer is a value comparison and not a function of history
- WHEN a plate has a real unapplied edit THEN the row's UPDATE verb is ENABLED, including when the
  staged value is _not assigned_
- WHEN any surface reports plate draft/dirty state THEN it resolves through the one predicate given
  its applied-plate map, and no caller can get a plate answer without supplying one

**Notes:**

- **Every draft/dirty reader found**, so the fix cannot miss one:

  | reader                                       | how it asks                                              | correct today? |
  | -------------------------------------------- | -------------------------------------------------------- | -------------- |
  | Inspector commit bar — Apply disabled + chip | `Inspector.tsx:401,588,593` — `isItemDirty` WITH the map | ✅             |
  | Inspector LIVE PLATES — per-plate marker     | `LivePlatesSection.tsx:115,143` — `isPlateDirty`         | ✅             |
  | Inspector per-field dot                      | `Inspector.tsx:666` — `isFieldDirty` (fields only)       | ✅ n/a         |
  | **stack row — `DraftChip`**                  | `LayersPanel.tsx:760` → `LayerRow.tsx:708`               | 🔴 no map      |
  | **row verb block — UPDATE enabled state**    | `layerRowActions.ts:713`, same boolean                   | 🔴 no map      |
  | `PositionPicker`'s own dot                   | `PositionPicker.tsx:128,137` — local value compare       | ✅ separate    |
  | `PreviewPanel`                               | reads `appliedPlateSources`, deliberately NOT drafts     | ✅ n/a         |

- **`isPlateDirty` (`draftStore.ts:187-191`) is the correct shape** and is the natural surviving
  home for the per-plate answer — it is already a value comparison that treats _not assigned_
  (`''`) as a value.
- **Owner question:** the two fixes differ in what the row's chip MEANS.
  **(a)** pass `appliedPlates` at the row call site — the chip then covers fields AND plates, which
  is what an operator most likely reads it as; the row must obtain the assignment map, which the
  canonical join already provides. **(b)** make omission genuinely skip plates, honouring the
  existing docstring — the row's chip then means "fields only", and plates need their own row-level
  tell or the operator has none. ⟨Owner to choose; the item does not pick.⟩
- 🔴 **Whichever is chosen, REMOVE THE LANDMINE rather than fixing the one line — and this file
  already carries the pattern.** `StackPruneInput` (`draftStore.ts:360-372`) makes the unsafe call
  shape unrepresentable, for exactly this reason: _"That is the difference between fixing this line
  and removing the landmine — a plain `(ids, ready)` pair would let the next caller pass `true` by
  habit."_ An optional `appliedPlates` is the same landmine: the next caller omits it by habit.
  The equivalent here is a parameter that forces the caller to SAY which answer it wants — plates
  included with their map, or plates explicitly skipped — so that no caller can get a plate answer
  without supplying a baseline. Filing the one-line argument fix alone leaves the trap armed.
- **Regression test:** pin all three transitions in the table above — including the two that are
  wrong today — plus the order-independence and the UPDATE-enabled case. `livePlateDraft.test.ts`
  already covers the THREE-argument call (`:122-126`); what is missing is the TWO-argument call with
  staged plates, which is the defect. A test that only exercises the three-argument form passes
  today and would have passed before this bug existed.
- **Cross-refs:** [[R-048]] (the per-row source override, a different axis), [[R-053]] (the
  aspect-crop consent, which will add a fourth per-plate row indicator and must read the same
  predicate rather than adding a third spelling).

## [~] B-140 — a shell-divider drag that ends by anything other than a mouseup never ends: the divider stays blue and the resize cursor and dead text selection persist application-wide; the Designer's splitter is the same bug, worse ⟨priority: medium⟩ — implemented: `openspec/changes/shared-drag-gesture/` (new `@cg/gesture` package, both apps migrated)

> 🔴 **CORRECTION, 2026-08-17 — the original cause recorded below is DISPROVEN, and the title above
> has been re-anchored on the one that reproduces.**
>
> This item was filed as "the pointer crosses the PVW iframe, so the parent never gets the
> `mouseup`". **Measured against the pre-fix code, with a positive control asserting the release
> point hit-tests to an `IFRAME` and with a rebuild between runs, that drag ENDED CORRECTLY.** The
> lead: the rehearsal frame carries no `sandbox` attribute, so it is same-origin, and Chromium's
> implicit mouse capture already keeps `mousemove` / `mouseup` with the document where the
> `mousedown` happened.
>
> **What reproduces is an ending that is not a `mouseup` at all** — the window losing focus
> (alt-tab, a dialog, the OS taking the pointer). The old divider listened for `mouseup` and nothing
> else, so such a drag never ended. That is the same reported symptom, through the door that is
> actually open, and the E2E now pins it red-then-green.
>
> ⚠ **The Designer half is unchanged in substance and re-anchored in cause**: its listeners really
> are added inside `onPointerDown` and removed only in its own `onUp`, so a missed `onUp` strands
> them permanently and the panel then follows the mouse with no button held. But the reachable path
> to that missed `onUp` is blur / `pointercancel`, not the canvas iframe.
>
> The iframe text is left below rather than deleted so the correction is legible against what it
> corrects — but **it is wrong, and nothing should be built on it.**

**What:** `ShellDivider` listens for `mousemove` / `mouseup` on the PARENT window, and the PVW
preview is a same-origin `<iframe>`. While the pointer is over that frame the events are dispatched
in the IFRAME's document, so resizing stops — **and the `mouseup` lands inside the iframe too, so
the parent's `onUp` never runs.** The drag appears released while the component still believes it is
dragging.

**Repro:**

1. Grab the horizontal divider between the top and bottom panels and start dragging.
2. Move the pointer over the PVW canvas.
3. Release the mouse there.

**Expected:** the drag keeps resizing across the PVW frame, and releasing anywhere ends it
completely.
**Actual:** resizing stops as soon as the pointer is over PVW; the divider **stays blue**; and the
drag never ends.
**Env:** Runtime SPA, any build. Read from the code at `3d25585`; the report is the owner's, on the
running app.

**Why — the visible blue line is the symptom of stuck GLOBAL state, not a cosmetic glitch.**

`onUp` is the ONLY place that undoes the gesture's side effects
(`apps/runtime/src/renderer/ui/ShellDivider.tsx:73-78`):

```
drag.current = null; setDragging(false);
document.body.style.cursor = ''; document.body.style.userSelect = '';
```

🔴 **All FOUR survive a missed `onUp`**, not some: the drag ref stays non-null, `is-dragging` keeps
the divider blue, and `document.body` keeps **`cursor: row-resize`** and **`user-select: none`** —
so the whole application wears the resize cursor and **text selection is dead app-wide** until some
later drag happens to end cleanly. Both body properties are written on `mousedown`
(`ShellDivider.tsx:118-119`), with a comment explaining why the cursor is held on the body at all.

**Why per-iframe listener registration is not the answer — the frames are plural and dynamic.**
PVW is not one iframe. `features/monitors/rehearsalFrames.ts` stacks **one frame per rehearsal
subject** — `stackedByLayer(subjects)` (`:96`), `frameZIndex(index)` (`:112`),
`overlayZIndex(frameCount)` (`:132`) — created and destroyed as subjects change. Registering on each
iframe's document works (they are same-origin) but needs one registration per frame, for a set that
changes at runtime: _extend the list, forget the mutator_. And `setPointerCapture` alone fixes
crossing any element in the SAME document but is **not dependable across a browsing-context
boundary**, so it is insufficient on its own rather than the fix.

**🔴 The SAME rule exists twice, and the second spelling fails WORSE.**

`apps/designer/src/renderer/features/shell/Splitter.tsx` is a second, independent derivation of one
gesture. It is ahead in one way and behind in another:

|                      | Runtime `ShellDivider`                                      | Designer `Splitter`                                                            |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| events               | `mousedown` + window `mousemove`/`mouseup` — **mouse only** | `pointerdown` + window `pointermove`/`pointerup` — mouse/touch/pen             |
| pointer capture      | none                                                        | none — **same crossing defect**                                                |
| `pointercancel`      | n/a                                                         | **not handled**                                                                |
| listener lifetime    | `useEffect`, torn down on unmount                           | **added inside `onPointerDown` (`:51-52`), removed only in `onUp` (`:45-46`)** |
| leaks on a missed up | drag ref, `is-dragging`, body `cursor`, body `user-select`  | `dragging`, body `user-select`, **and the listeners themselves**               |
| hit area vs visual   | 6px, the same                                               | `HIT = 10`, `LINE = 2` / `LINE_ACTIVE = 4` — **separated**                     |

🔴 **The Designer's failure is the more severe of the two.** Because its listeners are attached
per-gesture and removed only in `onUp`, a missed `onUp` leaves them attached **permanently**: every
later pointer move over the parent document keeps calling `onResize`, so **the panel follows the
mouse with no button held**. The Runtime's bug is a stuck highlight and a stuck cursor; the
Designer's is a panel that never stops moving. And the Designer has iframes to lose the release into
— the canvas preview (`features/canvas/CanvasArea.tsx:937`) and `PreviewModal.tsx:405`.

⚠ **Filed as ONE item deliberately.** One root cause with two spellings must not get two fixes —
that is the failure this item exists to close. A cross-reference is filed in `bugs-designer.md`.

**Acceptance:**

- WHEN a divider drag passes over the PVW preview THEN it keeps resizing, and keeps resizing after
  the pointer comes back out
- WHEN the pointer is released anywhere — over a panel, over the PVW frame, or outside the window —
  THEN the drag ends once and completely
- WHEN any drag ends by any route THEN `document.body` carries no leftover cursor and no leftover
  `user-select`, and no divider carries `is-dragging`
- WHEN `Escape` is pressed during a drag THEN the drag ends, and the panel keeps the size it had at
  that moment ⟨or reverts — state which and why⟩
- WHEN the vertical (Inspector) divider is dragged THEN all of the above holds for it too
- WHEN the divider is dragged with a mouse, with touch, or with a pen THEN it works, through ONE
  code path
- WHEN a `pointercancel` arrives mid-drag THEN the drag ends completely, with no leftover global
  state
- WHEN a second finger is placed during a drag THEN the divider does not move
- WHEN the handle is grabbed by finger THEN it can be hit without catching the panels on either
  side, and its VISIBLE width is unchanged
- WHEN any drag path runs THEN it writes neither `cursor` nor `user-select` onto `document.body`
- WHEN the Designer's splitter is dragged across the canvas preview THEN it behaves identically, or
  the item explicitly names it as separate work

**Notes:**

- **Both fixes are in scope — owner decision, and they are complementary, not alternatives:**
  - **A full-window DRAG SHIELD fixes CROSSING** — an overlay above every panel and iframe for the
    duration of the gesture, carrying the resize cursor. Pointer capture does not dependably cross a
    browsing-context boundary, so this half cannot be replaced by capture. (`pointer-events: none`
    on the frames while dragging is the alternative shape of the same idea.)
  - **POINTER EVENTS fix WHO CAN DRAG** — mouse, touch and pen through one path. This half cannot be
    replaced by the shield. `pointerdown` / `pointermove` / `pointerup` / `pointercancel`, with
    `setPointerCapture` / `releasePointerCapture` on the divider and `touch-action: none` on the
    handle so the browser cannot steal the gesture for scroll or zoom.
- 🔴 **The fix must DELETE the mechanism that gets stuck, not add a fifth place that clears it.**
  With capture plus the shield there is no longer any reason to write `cursor` or `user-select` onto
  `document.body` at all — the shield carries the cursor for the duration and disappears with the
  gesture. The outcome should be **one less piece of global state**, not more cleanup paths. That is
  what closes the app-wide stuck state at the root.
- 🔴 **ONE lifecycle with an EXHAUSTIVE terminator set**, all calling the SAME teardown — not a copy
  per path, which is how this class returns: `pointerup`, `pointercancel`, `lostpointercapture`,
  window `blur`, `Escape`, and the pointer leaving the window. ⚠ With Pointer Events,
  `pointercancel` and `lostpointercapture` stop being defensive extras and become **events that
  actually fire** — the OS takes a touch gesture away when it becomes a scroll, a call arrives, or a
  palm is rejected.
- **The visual state and the drag state must not be separately terminable** — `is-dragging` and the
  drag ref end together, by construction, because they end in the same place.
- **Only the captured `pointerId` drives the drag.** A second pointer must be ignored, never read as
  a move. Multi-touch is a new bug class the mouse model could not have, and this is where it enters.
- **A 6px handle is not a touch target.** The HIT area grows via a padded transparent region; the
  VISIBLE width stays 6px — otherwise the divider that was already mistaken for a scrollbar gets
  thicker to fix a different problem. ⚠ The Designer's splitter is the precedent and already does
  this: `HIT = 10` around a `LINE = 2` (`Splitter.tsx:13-16`).
- **The keyboard path is unaffected and must stay as it is** — `role="separator"` +
  `aria-valuenow` + arrow keys with a Shift coarse step (`ShellDivider.tsx:126-152`) already works.
- **One divider component serves both axes**, so the Runtime fix lands once: `ShellDivider` is used
  for the Inspector (vertical) and the monitor strip (horizontal).
- **Tests:**
  - A test that reads **what the browser shows, not what the component thinks** — assert the
    computed `body` cursor and `user-select`, and the divider's class, after a drag that crosses the
    PVW frame. Never internal state.
  - **E2E:** a Playwright drag whose path crosses the PVW iframe, verified RED before the fix, plus
    a **touch** drag doing the same. Implementing this owes a **completed green Linux `e2e`** cited
    by run URL (a UI/render change) — not owed by this filing session.
- 🔴 **Owner question — if both apps must be fixed, does the gesture live in ONE place?** `CLAUDE.md`
  says components are app-local and `@cg/ui` is **tokens-only**, so a shared styled splitter is
  forbidden. But a **headless drag-gesture hook** is neither a token nor a component, and the rule
  was not written with one in mind. Candidates:
  1. **Allow headless hooks in `@cg/ui`** — smallest change, one implementation, no styling crosses
     the boundary. Cost: it widens a rule that has been valuable precisely because it is absolute,
     and the next thing to ask for an exception will cite this one.
  2. **A new small package** (e.g. `@cg/gesture`) — keeps `@cg/ui`'s rule intact and states the new
     concept honestly. Cost: a package for one hook, and another workspace in the gate.
  3. **Two implementations kept honest by ONE shared test suite** — respects app-locality exactly as
     written. Cost: the duplication survives; only its behaviour is pinned, and the two can still
     drift in everything the suite does not assert.

  **I would pick (2)**, because the thing being shared is behaviour with no styling and no tokens,
  which is a real third category rather than an exception to either rule — and because a package
  boundary makes the sharing visible where an `@cg/ui` hook would quietly erode "tokens-only".
  ⟨Owner to choose; the item does not decide.⟩

- **Cross-refs:** the Designer half of this one root cause is cross-referenced from
  `bugs-designer.md`; it is deliberately NOT a second item.

## [~] B-141 — the audit log records almost ONE action, and its empty state claims otherwise ⟨priority: high⟩ — COMPLETE, awaiting archive: `openspec/changes/audit-writer-forensic-lite/` — writer wired, all append sites wired structurally (9 entry points, 8 actions), the panel's empty states distinguished. ⚠ `actor` is still the constant `'operator'` — an OWNER QUESTION, see the change's tasks.md 5e

**What:** the Audit log modal is empty after a whole session of imports, takes and commands. It is
not a display bug: the bridge's audit is an **in-memory array with exactly ONE append site**, and
the `@cg/audit` package that was built to make it a real forensic record **is not imported by
anything**. The empty state then asserts a fact it cannot know.

**Repro:**

1. Start the bridge and the Runtime; import several templates; load, take and update rows.
2. Open the status bar's `LOG` button (Audit log).

**Expected:** a row per auditable action — who did what, to which template, and whether the server
accepted it.
**Actual:** the list is empty and says _"No audit entries yet."_ The only action that can ever
appear is a `reconnect`. Restarting the bridge erases even that.
**Env:** Runtime SPA + bridge, any build. Read from the code at `be2e390`.

**Why — five facts, each verified:**

1. **The store is an in-memory stub.** `#audit: AuditEntry[] = []`
   (`tools/caspar-bridge/src/caspar-runtime.ts:699`), under a section header that says so out loud:
   _"lock / templates / audit / settings / update (in-memory stubs)"_ (`:4551`). **A forensic record
   a process restart erases is not one.**
2. 🔴 **Exactly ONE append site exists in the entire bridge** — `caspar-runtime.ts:4458`, inside the
   connection-apply path, writing `action: 'reconnect'`. That is the whole of what the log can ever
   contain. The READ path is fine (`auditRecent`, `:4680`, routed from `bridge.ts:800`) — there is
   simply nothing in it.
3. **`@cg/audit` is dead code.** It ships an `AuditWriter` with `lastError` (`writer.ts:40`, `:92`)
   and a `readRecentEntries` tail reader (`reader.ts:35`), and its docstring describes the
   capability the product is supposed to have. SEARCH: `git grep -rn "@cg/audit" -- apps packages
tools` → the ONLY hit outside the package itself is
   `packages/eslint-config/src/rules/forbidden.ts:57`, which lists it in `MAIN_ONLY_PACKAGES` — a
   rule forbidding browser code from importing it. **Nothing imports it.** A package that reads as
   shipped, describing behaviour that exists nowhere, is a warning that outlives its truth.
4. 🔴 **The panel's action list and the schema's action set DISAGREE, and the panel is the wrong
   one.** `AuditEntrySchema.action` enumerates **fifteen** (`packages/shared-schema/src/runtime/audit.ts:11-28`):
   `load take update out remove failover reconnect import export stop next lock-engage lock-release
update-deferred update-installed`. `ACTION_OPTIONS` in
   `apps/runtime/src/renderer/features/audit/AuditPanel.tsx:12-25` is a hand-kept literal of eleven
   plus `all`, **missing `stop`, `next`, `update-deferred` and `update-installed`**. So four real
   actions could never be isolated by the filter even once they are written. One rule, two
   spellings, and nothing catching the disagreement.
5. 🔴 **The empty state asserts a fact it cannot know.** _"No audit entries yet."_
   (`AuditPanel.tsx:169`) cannot distinguish _nothing happened_ from _nothing is recorded_ from
   _this build has no writer_. It is **this project's own recurring error written into the
   product**: a negative observation is not a result until a positive control proves the instrument
   is live. The operator reading it concludes the session was quiet.

**Acceptance:**

- WHEN an auditable action occurs THEN a row is appended to a record ON DISK, and it is still there
  after the bridge restarts
- WHEN the Audit log is opened THEN it shows the recent tail of that record, newest first
- WHEN the panel offers its action filter THEN the options are DERIVED from the one schema action
  set, so a new action cannot be filterable in one place and invisible in the other
- WHEN no writer is configured THEN the panel says THAT, and does not say "no entries yet"
- WHEN the writer is configured but failing THEN the panel surfaces the failure (its `lastError` /
  error count), and does not say "no entries yet"
- WHEN the record is readable and genuinely empty THEN — and only then — the panel says "No audit
  entries yet."
- WHEN an audit write fails THEN the take, the update and every other on-air operation still
  proceed; the writer keeps trying and reports, and nothing goes off air

**Notes:**

- **Owner decision, recorded as DECIDED: FORENSIC-LITE.** Wire `@cg/audit` so the record is on disk
  and survives a restart. **File rotation, the UNC fallback and any retention policy are
  DEFERRED** — and the writer's docstring must be corrected where it still promises them, or it
  stays a warning that outlives its truth.
- **Rejected, with its reason:** keep it in-memory and delete the package. The station then loses
  the ability to answer _"who put what on air, and did the server accept it"_ the next day, which is
  the only reason an audit log exists.
- 🔴 **A failed audit write must NEVER take the station off air**, and the contrast with the config
  stores is deliberate: there an unusable file IS a hard boot failure, because the file is a
  precondition for correct playout. An audit write is not a precondition for anything — it is a
  record OF what happened, so its failure must degrade to "reported and retried", never to a refused
  take.
- **Where the file lives follows the existing store precedent** — a CLI flag with a default under
  `~/.cg-runtime/`, exactly as `tools/caspar-bridge/src/source-assignments-store.ts` documents
  `--source-assignments-path` → `~/.cg-runtime/bridge-source-assignments.json`. ⚠ **Not in
  `templatesDir`**: `TemplateRegistry` reads every `*.json` there as a template ([[B-116]]).
- ⚠ **Wire only actions that are real operations today.** An action in the enum with no operation
  behind it must not be invented to fill the list; name any that cannot be wired and why.
  **Resolved:** wired — `load` `take` `update` `out` `stop` `next` `remove` `import`, plus the
  pre-existing `reconnect` `failover` `lock-engage` `lock-release`. **Not wired, and why:**
  `export` happens in the Designer, and `update-deferred` / `update-installed` have no install
  path in this process. ⚠ `import` was the fifteenth action and the change's own bookkeeping had
  lost it — it appeared in neither list, so it read as accounted for while being accounted for
  nowhere.
- ✅ **RESOLVED 2026-08-18 — `actor` is now a per-console OPERATOR NAME**, implemented in
  `openspec/changes/audit-actor-console-name/`. Was: every entry carried `actor: 'operator'`, a
  constant, because the control WebSocket is unauthenticated loopback — the record answered _what_
  honestly and answered _who_ with one word, which on a shared gallery is the half a dispute turns
  on. The single `OPERATOR_ACTOR` seam did its job: exactly one place had to learn the answer.
  **Owner decision:** the name is set per console in the Runtime and sent with each control
  request. **Rejected:** a PIN-backed sign-in (the lock's PIN is a SAFETY mechanism, not an
  identity one, and a login in front of an emergency console is wrong) and a per-connection client
  id (identifies a browser; nobody disputes which browser).
  🔴 **The name is SELF-DECLARED and UNVERIFIED** — "which console, as labelled", never "which
  person, proven" — and that caveat is on the operator-facing surface, not only in the design, for
  the reason [[B-143]] records. An unconfigured console records `unattributed`, a word for a state,
  never the old `operator`, which could not be told apart from a console somebody chose to name
  that. ⚠ The control lives in the Audit panel because the Runtime has no settings shell;
  [[R-054]] records that it must move.
- **Cross-refs:** [[B-142]] (the panel's raw `<select>`, which this item must not touch),
  [[B-143]] (the same class — the system knows something and does not say it).

## [ ] B-142 — four Runtime dialogs render raw `<select>`s that sit OUTSIDE `Modal`'s focus trap ⟨priority: medium⟩

**What:** `Modal`'s focus trap enumerates focusable children with a selector that **omits `select`,
`textarea` and `a[href]`** (`apps/runtime/src/renderer/ui/Modal.tsx:48`), and four dialogs render raw
`<select>`s. A control inside a modal that the trap does not know about lets keyboard focus escape
to the page behind the scrim.

**Repro:**

1. Open Live sources (status bar → `SOURCES`).
2. Tab forward from the last trapped control.

**Expected:** focus wraps within the dialog — the trap wraps at both ends specifically so focus can
never reach an on-air control behind the scrim (`Modal.tsx:316-330`).
**Actual:** the `<select>`s are not in the trap's set, so the wrap is computed over the wrong
boundary.
**Env:** Runtime SPA, any build. Read from the code at `be2e390`.

**Why:** this is a keyboard-reachability defect on a broadcast console, where an operator may be
driving from a keyboard in a gallery — not a style nit. The four sites:

| dialog                | file:line                                          |
| --------------------- | -------------------------------------------------- |
| Live sources          | `features/sources/SourcesModal.tsx:389` and `:411` |
| Server connection     | `features/connections/ServerSettingsPanel.tsx:368` |
| Audit log             | `features/audit/AuditPanel.tsx:136`                |
| Live source for a row | `features/layers/LiveSourceSwapDialog.tsx:130`     |

🔴 **And nothing prevents the next one.** Unlike the Designer, `apps/runtime` has **no
raw-`<button>`/`<select>` lint ban and no shared `Select` primitive**, so the rule `CLAUDE.md`
states for the Designer's renderer is simply not enforced here. Every new dialog is free to add a
fifth.

**Acceptance:**

- WHEN a dialog containing a `<select>` is open and the operator tabs to the end THEN focus wraps
  inside the dialog and never reaches a control behind the scrim
- WHEN a control type is focusable THEN the trap's selector includes it, so the trap's set and the
  browser's agree
- WHEN a new dialog adds a native form control THEN the enforcement catches it ⟨subject to the owner
  question below⟩

**Notes:**

- **The fix belongs with [[R-054]]'s shell work**, which already requires bringing these dialogs onto
  shared primitives and introducing a shared `Select`. Cross-referenced rather than duplicated: this
  item exists so the KEYBOARD defect is filed as a defect and does not ride invisibly on a restyle.
- ⚠ Two fixes are possible and they are not the same: widening `Modal.tsx:48`'s `FOCUSABLE` selector
  (immediate, fixes today's four), and replacing the raw controls with a shared `Select` (structural,
  prevents the fifth). The first is a one-line correctness fix and should not wait on the second.
- 🔴 **Owner question:** should `apps/runtime` gain the Designer's lint ban and a shared `Select`?
  **Cost:** a new primitive plus a migration of at least four call sites, and an eslint rule that
  will fail existing code until they are all moved. **Benefit:** the rule stops being true of one app
  and false of the other, which is currently a difference nobody can see from either side. Posed,
  not resolved.
- **Cross-refs:** [[R-054]] (the shell work this fix belongs to), [[R-052]] (the message-region
  contract, the other half of `Modal`'s shared behaviour).

## [ ] B-143 — `resolvePlateAspect`'s `assumed` flag has no readers: the honesty half was never built ⟨priority: medium⟩

**What:** when neither the source nor the author states an aspect, `resolvePlateAspect` deliberately
does NOT refuse — it fits without cropping and returns `assumed: true`
(`tools/caspar-bridge/src/live-plate-fit.ts:169`). Its docstring says exactly what that flag is for:
_"what lets a row or a log say 'fitted unverified' instead of claiming a verified fit — the honesty
half of a decision that deliberately does not refuse."_ **That half was never built.** The flag is
set and read by nothing.

**Repro:**

1. Define a live source whose format is `AUTO` (or which states no aspect), and assign it to a plate
   whose element carries no `expectedAspect`.
2. Take the row.

**Expected:** the graphic goes to air — that is the deliberate, correct decision — **and the row or
the log says the fit is unverified.**
**Actual:** the graphic goes to air and nothing anywhere says the fit was assumed.
**Env:** Runtime + bridge, any build. Read from the code at `be2e390`.

**Why:** the non-refusal is right and well argued — refusing would outlaw `AUTO`, which is _"a
request to the hardware, not a statement about the picture"_, and would give a black box where a
guest should be. But the argument for not refusing **rests on the operator being told**, and the
telling does not exist. SEARCH: `git grep -rn "assumed" -- tools/caspar-bridge/src packages apps` →
the flag is set in `live-plate-fit.ts`, carried on `PlateAspectOutcome`, and asserted in
`tools/caspar-bridge/tests/live-plate-fit.test.ts` — **no UI, no IPC channel, no log line**. So a
plate is on air with an unverified fit and nobody is told.

**Acceptance:**

- WHEN a plate is seated with `assumed: true` THEN the row says the fit is unverified, persistently
  while it is on air — not as a toast
- WHEN a plate is seated with a verified aspect THEN nothing extra is shown, so the marker means
  something
- WHEN an operator asks why a picture looks wrong THEN the unverified fit is discoverable from the
  surface rather than only from the bridge's internals

**Notes:**

- **Same class as [[B-141]]:** the system knows something and does not say it. Both are the honesty
  half of a decision that was otherwise made correctly.
- **Distinct from [[R-053]], and the distinction is the whole point.** R-053 is the **mismatch**
  case — two facts contradict, and the take is refused. This is the **nothing-stated** case (the
  D-147 decision) — no facts contradict, nothing is refused, and the cost is a silent assumption.
  Fixing one does not fix the other, and they should share a surface rather than invent two.
- ⚠ **Whatever surface this uses, [[R-053]] will need the same one** for its "cropped by operator
  consent" indicator, and [[B-139]] governs the row's existing per-plate indicators. Three per-plate
  facts want a row-level home; the first of the three to be implemented should build it deliberately
  rather than adding a private badge.
- **Cross-refs:** [[R-053]], [[B-141]], [[B-139]].

## [ ] B-144 — a failed CLEAR leaves a graphic ON AIR while its row vanishes from every browser: `remove()` cannot report its own failure to the UI ⟨priority: high — the operator loses the handle to something that is on air⟩

**What:** `CasparRuntime.remove()` answers `{ accepted: true }` **unconditionally**
(`tools/caspar-bridge/src/caspar-runtime.ts`, `#removeImpl`). The row is dropped from the stack
before the wire is touched, and the `CG CLEAR` that follows is best-effort. When that CLEAR fails,
the response still says `accepted`, so **every browser removes the row while the graphic is still
on air.**

**Repro:**

1. Load and take an item so a graphic is on air.
2. Make the primary's AMCP unreachable (pull the link, or kill the server) so the urgent `CLEAR`
   cannot land.
3. Press REMOVE on the row.

**Expected:** the graphic is off air; or, if it could not be, the row stays visible carrying its
true state and the operator is told the CLEAR failed.
**Actual:** the row disappears from every connected browser and the graphic stays on air. The UI
shows a state that is not true, and the only handle to the thing on air is gone.
**Env:** Runtime + bridge, any build. Read from the code at `50fe15be`.

**Why this outranks a cosmetic defect:** the operator's remaining options are the orphan sweep
(which only surfaces once the primary is observable again) or a hand-typed AMCP command. In the
meantime a graphic nobody can see a row for is on air, which is the state a broadcast console exists
to prevent.

🔴 **The failure IS recorded — and a log entry is not an operator surface.** Session D routed the
wire failure to the audit wrapper via `AuditDetail.wireFailure`, so the NDJSON row for that `remove`
now carries the real `errorCode` instead of `ok`. That fixed the FORENSIC half: the next day, the
question "did that CLEAR land" has an answer. It does not fix this one. **Nobody is watching the
audit log at the moment a graphic fails to leave air** — the Audit panel is a modal opened for
review, and the row it would explain has already vanished from the surface the operator IS watching.
Recording a fact and surfacing it are different jobs, and this item is only the second.

**⚠ THE CENTRAL COST — changing the response shape touches the SPA CONTRACT**, and that is
precisely why session D did not do it. `remove` is consumed by `StackRemoveChannel`, the
`RuntimeBridge` surface, `MockRuntime`, the mock↔bridge parity guard and every renderer call site.
`{ accepted: true }` is also **right for the caller** in one real sense: the row IS off the stack
and the layer IS deallocated whatever the wire did, so a naive `accepted: false` would be a
different lie — it would suggest the removal did not happen.

**The options, posed rather than chosen:**

| shape                                                                                         | what it costs                                                                                                                                                                                                                                                          | what it leaves unsolved                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — a response that can express failure** (e.g. `{ accepted: true, clearFailed?: string }`) | one schema change, rippling to the channel, the bridge surface, the mock, the parity guard and every call site. Additive and optional, so old readers keep working — but every reader that should react has to be found and changed, and the ones missed fail silently | nothing on RECONNECT: a browser that was not the one pressing REMOVE never sees the response at all                                                                                                            |
| **B — a separate error channel / publish**                                                    | no change to `remove`'s response; reaches EVERY connected browser, which A does not                                                                                                                                                                                    | a second way for one action to report itself, which is the two-spellings shape this repo keeps paying for. Ordering against the stack publish must be defined or the row can vanish before the warning arrives |
| **C — a reconciliation pass that re-derives the row from the server**                         | no contract change at all, and it fixes the whole CLASS rather than this verb — any divergence between believed and actual state is caught                                                                                                                             | the largest by far, and it only helps once the primary is observable again, which is exactly when it is NOT during this failure. Slowest to tell the operator                                                  |

⚠ **B and C are not exclusive, and the honest reading is that C is the real cure while B is what
makes the failure visible today.** Whichever is chosen, `wireFailure`'s single sanctioned use must
stay single: it exists so the AUDIT can contradict a response, and it must not quietly become the
general mechanism for the UI to do so.

**Acceptance:**

- WHEN a `remove`'s CLEAR fails THEN the row remains visible, carrying its true state — still on air
  — rather than disappearing
- WHEN a `remove`'s CLEAR fails THEN the operator is TOLD, on the surface they are already looking
  at, persistently while the condition lasts; an audit row does not satisfy this
- WHEN a `remove`'s CLEAR succeeds THEN behaviour is exactly as today — the row goes, nothing extra
  is shown, so the warning means something
- WHEN a second browser did not issue the `remove` THEN it sees the same truth as the one that did
- WHEN the layer is later observed clear (by the orphan sweep or a reconnect resync) THEN the
  warning resolves on its own rather than needing a dismissal

**Notes:**

- **The deallocation is correct and must not be reverted.** `#removeImpl` frees the slot and
  resolves the owned-occupancy warning BEFORE the CLEAR deliberately (B-056): the layer is unowned
  from that point, and whatever survives on the primary is the R-009 sweep's to surface as an
  ordinary clearable orphan. This item is about telling the operator NOW, not about changing who
  owns the layer.
- **Same class as [[B-141]] and [[B-143]]:** the system knows something and does not say it. Here
  the system now RECORDS it too, which makes the gap sharper rather than smaller.
- **Cross-refs:** [[B-141]] (the audit wrapper that made the failure visible in the log),
  [[B-143]] (the honesty half never built), [[B-139]] / [[R-053]] (the row-level home three
  per-plate facts already want — a per-row warning surface should be built once, not four times).

## [x] B-145 — the bridge's live-layer ledger does not survive a restart: seated producers are stranded on air, unreachable by any code path — **DONE: persistence (sessions AS + AT) and the DISPLAY half of acceptance 1 (session BG, 2026-08-20)** ⟨priority: high — a live face on air with no handle to it⟩

**What:** `#liveLayers` is a `Map` in the bridge process (`tools/caspar-bridge/src/caspar-runtime.ts`,
`readonly #liveLayers: LiveLayerLedger = new Map()`). It is the only record of which band layers
carry which item's plates. Release happens on `stopItem` / `out` / `remove` **and on no other path**
— not on disconnect, not on bridge restart. So a restart loses the ledger while the CasparCG
producers keep running: the layers stay lit and **nothing in the product can name them, clear them
or re-adopt them.**

**Repro:**

1. Take a row whose template declares Live Source plates, so band layers are seated.
2. Restart the bridge (or let it crash and come back).
3. Look at the layer list, and try to clear or repoint those plates.

**Expected:** the seated layers still appear and are controllable — the console can see what is on
air and act on it.
**Actual:** the ledger is empty. The producers are still on air. `layers.clear` refuses them as
`foreign` at best; nothing re-associates them with the row they belong to.
**Env:** Runtime + bridge, any build. Read from the code at `056ffdd5`.

**Why it is filed now, and separately.** It is **pre-existing** and is not caused by the multi-box
arrangement switch, so folding it into that change would misattribute it. But the switch **seats and
releases plates continuously** rather than once per take, so it multiplies the ledger's write rate —
and under it a stranded producer is a live guest on air that no code path can reach.
🔴 **It must land BEFORE the arrangement switch ships** (`openspec/changes/multibox-layout-switch/`
`tasks.md` 1.11 / 4.7, `design.md` §12.7 — the owner's decision, 2026-08-18).

**The two mechanisms are NOT equivalent, and that is the design question:**

| shape                                                 | what it buys                                                                    | what it leaves                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — PERSIST the ledger**                            | cheap, and exact for the case where only we changed anything                    | records what we BELIEVE. A producer can also vanish from the server's side (a channel reset, a hand-issued `CLEAR`) and the persisted ledger is none the wiser — it then asserts a layer that is not there |
| **B — RECONCILE against the server's `INFO` at boot** | reads what the server ACTUALLY has, so it is self-correcting in both directions | must re-derive the plate↔layer↔item mapping from what `INFO` exposes, which may not be enough on its own                                                                                                   |

**Recommendation, not a decision: B, with A only if `INFO` proves insufficient** to re-derive the
mapping. A second consumer wants the same truth — `multibox-layout-switch` `design.md` §12.6's
refusal predicate has to know what is on air after a restore — and two mechanisms answering "what is
seated" is the two-spellings shape this repo keeps paying for.

### RESOLVED 2026-08-18 — `INFO` was measured, and the answer is **A + B**

**`INFO` is NOT sufficient on its own, and what it lacks is exactly the part the server was never
told.** Measured on the plant (`2.5.0 69e8ad5`) with controls in both directions — an empty channel
returns no `<stage>` at all; two seated producers are both listed; **clearing one removes it from the
reply**:

| `INFO <channel>` exposes                                                                       | `INFO` does NOT expose                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every occupied layer number (`<layer_10>`)                                                     | the **`itemId`** — CasparCG has no concept of our stack items                                                                                                                                                                                            |
| the producer KIND (`route`, `color`, `html`, …)                                                | the symbolic **`sourceId`** (`guest-1`). Only the RESOLVED producer is on the wire, and reverse-mapping it through the catalog is not injective — two plates may resolve to one producer, and the mapping can have been edited while the bridge was down |
| that producer's own parameters (`<route><channel>1</channel><layer>11</layer></route>`)        | the fill/key **`role`**                                                                                                                                                                                                                                  |
| `<paused>`, and the foreground/background split                                                |                                                                                                                                                                                                                                                          |
| …and `MIXER … FILL` / `CLIP` / `VOLUME` read back exactly, so the geometry half IS recoverable |                                                                                                                                                                                                                                                          |

**The named fallback: PERSIST (A) plus a boot RECONCILE against the server (B).** The file knows the
NAMES, the server knows the TRUTH, and **the reconciliation of the two IS the ledger** — one
authority, with the file an input to it rather than a second answer consulted later.

**The three-valued rule, and why `unknown` adopts.** `occupied` → adopt; `empty` → **drop** (the
self-correcting direction acceptance 3 asks for); `unknown` → **adopt and mark unverified**, because
absence of knowledge is not knowledge of absence (R-015, and the B-101 lesson about reading silence
on one channel as death on another). Dropping an unverifiable record would strand exactly the
producer this item exists to stop stranding — the same failure, reached from the other side.

**A stale claim was found and corrected on the way.** `packages/caspar-client/src/osc/occupancy-tap.ts`
asserted that _"`INFO <channel>` returns no per-layer data on the 2.3+ lineage"_, citing a live
capture on this exact build. It is false there, and it is the kind of false that costs: it says AMCP
cannot answer a question AMCP answers, and this item's boot adoption is precisely the one-shot
occupancy reading that would have gone without. The tap's own justification (passive, costs no
commands) is unaffected and is now what the comment says.

### ✅ CLOSED 2026-08-20 (session BG) — the DISPLAY half landed, and acceptance 1 is met in full

Acceptance 1 reads _"those layers **appear in the layer list** and are controllable"_. The control
half had held since persistence landed; the display half did not exist, and that is what closed.

**The surface.** A third tab — **`LIVE SOURCES`**, beside `LAYERS` and `STATION LAYERS`
(`apps/runtime/src/renderer/features/layers/LiveSourcesPanel.tsx`) — listing every seated layer with
its coordinate, its symbolic plate, the producer actually sent, and **the row that owns it**.

**Why a third tab and not a widened `playoutLayersState()`**, which is the obvious-looking fix and is
wrong: the Live Source band's exclusion from `#reservedLayers` is LOAD-BEARING, not an oversight.
`reservedLayers` is a fence AWAY from a foreign owner, so a band inside it becomes unplaceable
(`allocate()` skips reserved layers), unreservable (`reserve()` refuses them) and unclearable
(`clearLayer` refuses them as `reserved`) — the bridge would fence off the very layers it is about to
composite a guest onto. The bridge already enumerates THREE declared ownership classes in one place
(`#declaredLayerClass`); the console had a surface for two of them. This is the third.

**The wire.** `packages/shared-ipc/src/channels/liveLayers.ts` — `liveLayers.state` plus
`liveLayers.state-changed`, pushed from the `liveLayersChanged` emitter this item already fires from
the ledger's ONE write path, so a seat, a release, a hold and the boot adoption reach a browser by
the same call that persists them. One projection (`projectLiveLayers`) serves both the pull and the
push, so the two cannot disagree about a row's shape or the list's order.

**`liveLayers()` has a production caller now**, which is the point rather than a detail:
`LiveSourcesPanel` → `useLiveLayers` → `liveLayers.state` → `bridge.ts` → `liveLayersState()` →
`liveLayers()`. Its doc comment used to say _"for tests and for phase 6's re-emission"_ and that was
true for long enough to be the defect — the written-but-unreachable class filed here four times.

**ADOPTED vs STRANDED**, which is what task 2.8's "done when" actually asked for:

- a layer whose owning item the stack still carries is shown, named with its template, and offers
  `OPEN ROW` — but **no destructive control**. Its verbs are its row's, and `layers.clear` refuses a
  live-source coordinate BY NAME after explicitly weighing and rejecting an exemption; a clear here
  would re-open that door from a second surface.
- a layer whose owner is GONE reads **Stranded**, raises the tab's dot, is the only row on the
  surface that wears a colour (amber = ATTENTION; green stays the layer table's ON AIR mark), and
  offers `RELEASE` — which calls the EXISTING `stack.remove`. Its `teardownLiveLayers` is documented
  as unconditional on `slot` precisely for this case: _"an item whose slot was already released can
  still own live layers, and those are precisely the ones nothing else would ever reach."_ The door
  already worked; what was missing was a surface that knew the `itemId` to hand it. **No new
  coordinate-addressed clear was added.**

With the link down every row reads `Unknown` and offers nothing: the ledger and the stack are then
both frozen snapshots ([[B-087]]), and a stranded verdict computed from two stale facts would present
a guess as an alarm.

**Tests:** `tools/caspar-bridge/tests/live-layers-wire.test.ts` (17, including an end-to-end boot that
adopts a persisted ledger and serves it over the WebSocket, and the acceptance-3 drop) and
`apps/runtime/tests/liveSourcesPanel.dom.test.ts` (18). E2E:
`apps/runtime/tests/e2e/live-source-layers.spec.ts`. Six mutations were checked and each reddens the
tests that name it.

🔴 **One defect was found in this very work by its own review, and it is worth recording because it
is this repo’s most-repeated class.** The first cut decided STRANDED from the stack items alone,
ignoring `stackReady`. The ledger and the stack are two INDEPENDENT snapshots that land separately,
so at mount and on every reconnect the ledger can arrive first — and every seated layer would have
read _"Stranded"_ with a RELEASE button, inviting the operator to cut a guest owned by a row that had
simply not been delivered yet. `useBridgeSnapshot` already names three victims of the same mistake
(the b2 density bug, PVW’s white page, `pruneDrafts` deleting every staged edit on remount) and
states the rule this violated: _"any consumer that ACTS on the absence of an item must read this form
and do nothing while `ready` is false."_ Fixed at the cause — blindness is now a first-class state
with ONE precedence helper, and reverting it reddens three tests.

🔴 **Four MORE were found by a second review pass, and they are one pattern, not four bugs.** Every
one is a fact the console did not have, presented as a fact it did — which is the same class as
the defect this item is about:

1. **The reconnect window** — reading `stackReady` was not enough, because that flag _"latches on
   the FIRST arrival and never clears"_. After any reconnect it stays true while the stack is
   empty, and a restarted bridge serves its FULL adopted ledger first. Every layer would have read
   STRANDED with RELEASE armed, in exactly this item’s own scenario. An EMPTY stack is now its own
   blind state: it cannot tell "not delivered yet" from "nothing here".
2. **The empty list** asserted "no live sources seated" with no readiness or link input, so a
   console with a dead bridge denied, definitely, that any guest was composited ([[B-094]]).
3. **RELEASE was item-scoped while its wording was coordinate-scoped** — `teardownLiveLayers`
   loops over every record the item owns, so releasing `1-10` also cut `1-11` with no warning. The
   verdict is also re-read after the confirm, so one that expired while the operator was reading
   cannot authorise a teardown.
4. **No `unverified` arm.** The channel argued its shape from "the ledger is resolved at boot
   against the server’s `INFO`" — false in the shipped bridge, which adopts with occupancy
   hard-coded to `unknown`. Nothing is ever dropped and every adopted record is unconfirmed, so
   the omission was the one distinction that is ALWAYS true after a restart, and the surface
   stated a file claim in the present tense. The wire now carries it and the row reads _"Adopted —
   not confirmed"_. Same demotion rule as [[B-086]]’s `unverified` stack status.

**[[R-057]] Stage E (the operator surface) is UNBLOCKED** — 2.8 was its last blocker.

### 🔴 RE-OPENED 2026-08-19 (session AU) — it was ticked with half of acceptance 1 unmet

**What is DONE:** the ledger is persisted, adopted at boot against the server, and persistence is ON
by default (sessions AS and AT). An adopted layer IS controllable — the row's existing verbs reach
it, because the browser re-delivers the stack intent on connect ([[B-092]]), the ledger is keyed by
`itemId`, and every teardown/repoint door reads it by that key.

**What REMAINS — and it is the first half of acceptance 1, not a nicety.** Acceptance 1 reads _"those
layers **appear in the layer list** and are controllable"_. They do not appear. Nothing displays the
seated layers AS layers: `CasparRuntime.liveLayers()` has no production caller, no `@cg/shared-ipc`
channel carries the ledger, and the only panel that lists station layers enumerates `#reservedLayers`
only — a band the Live Source layers are deliberately kept OUT of.

🔴 **Tracked as task 2.8 in `openspec/changes/multibox-layout-switch/tasks.md`, and NOT split into a
second number.** The blocking relation to [[R-057]] is already recorded here, and splitting one
acceptance list across two items is exactly the churn `docs/prd/b-number-registry.md` exists to
avoid. This item was `[~]`, not `[x]`, until 2.8 landed — see the CLOSED section below.

⏱ **WHEN it must land: before STAGE E**, the operator surface (`tasks.md` section 6). Not before
that, and the reason is specific rather than a preference — Stage E is where the band's state becomes
something the operator is EXPECTED to read, so an invisible seated layer stops being a diagnostic gap
and becomes a lie on the surface they act from. Stages C and D touch neither the list nor the band's
visibility, so they are not blocked on it.

### 🔴 COMPLETED 2026-08-19 (session AT) — the default was OFF, and the display half is still owed

Two things the first cut left open, both now settled rather than assumed:

1. **Persistence now defaults ON.** It shipped behind a `liveLayersPath` option that nothing
   defaulted, so a station that never configured it still lost its ledger — and every test passed
   either way, so nothing would have caught the default drifting back. `resolveLiveLayersPath`
   (`tools/caspar-bridge/src/live-layers-store.ts`) makes saying nothing resolve to
   `~/.cg-runtime/bridge-live-layers.json`, the same convention as every sibling store, and OFF is
   reachable only by typing `--no-live-layers`. The resolution is applied by
   `bin/caspar-bridge.mjs`, not by `createBridge`, per this repo's own ruling that
   _"`createBridge({})` is not a station"_ (`tools/caspar-bridge/tests/default-bank-boot.integration.test.ts:164`)
   — defaulting it inside `createBridge` would have every unit test read, and any test seating a
   live layer WRITE, the developer's real station ledger. `live-layers-default.test.ts` spawns the
   real CLI so the WIRING is covered too; flipping the default to off reddens four of its tests.

2. 🔴 **Acceptance 1's DISPLAY half is NOT met — an adopted layer is controllable but invisible.**
   The control half holds with no further work: the browser re-delivers the stack intent on connect
   ([[B-092]]) so the row and its `itemId` survive, the ledger is keyed by `itemId`, and
   `teardownLiveLayers` (`tools/caspar-bridge/src/caspar-runtime.ts:3802`) plus the swap paths at
   `:3461`/`:3639` all read it by that key. But **nothing displays the seated layers as layers**:
   `CasparRuntime.liveLayers()` (`caspar-runtime.ts:3849`) has no production caller, no
   `@cg/shared-ipc` channel carries the ledger, and the one panel that lists station layers
   enumerates `#reservedLayers` only (`caspar-runtime.ts:4064`) — a band the Live Source layers are
   deliberately kept OUT of. Written up as task 2.8 in
   `openspec/changes/multibox-layout-switch/tasks.md`; it needs a channel and a panel decision, so
   it is not a patch to this item.

**What landed:** `tools/caspar-bridge/src/live-layers-store.ts` (atomic write; it fails **soft** where
its `reserved-layers-store` sibling fails hard — an empty ledger is the pre-B-145 status quo, so
refusing to boot over a malformed bookkeeping file would take the console off air to avoid a
degradation it lived with for months), `reconcileLiveLayers()` in `live-layers.ts`,
`CasparRuntime.adoptLiveLayers()` plus a `liveLayersChanged` emitter fired from the ONE write path,
and the `bridge.ts` wiring behind a new `liveLayersPath` option. Ten tests in
`tools/caspar-bridge/tests/live-layers-restart.test.ts`, one per acceptance line plus the store's
failure modes; the drop rule is mutation-tested (breaking it reddens three).

**Acceptance:**

- WHEN the bridge restarts while live plates are seated THEN those layers appear in the layer list
  and are controllable, rather than being invisible to every code path
- WHEN the ledger is rebuilt at boot THEN it is rebuilt from ONE authority, and a plate that the
  server no longer carries is not asserted as seated
- WHEN a producer disappeared from the server's side while the bridge was down THEN the rebuilt
  ledger reflects the server, not a stale belief

- **Cross-refs:** [[B-144]] (the same shape one layer up — a graphic on air whose row the operator
  can no longer reach), [[R-057]] / [[D-152]] (the arrangement switch this must land before),
  [[C-015]] (the Live Source seating and the band).

## [ ] B-146 — the Inspector's source assignment silently reaches nothing on air, and its picker is blind to an active override ⟨priority: high — the operator believes they repointed a live box⟩

**What:** two halves of one confusion — the Inspector confidently shows, and appears to change, a
source that is not what is on air.

1. **The edit reaches nothing.** The Inspector writes the **template-scoped** assignment.
   `setSourceAssignments` (`tools/caspar-bridge/src/caspar-runtime.ts:5219-5229`) validates, assigns,
   emits and returns — it **is not `async`**, so it is structurally incapable of sending an AMCP
   command. The spec says so too (`openspec/specs/runtime-live-source-routing/spec.md`: _"an
   assignment is read at the TAKE and never re-composites the graphic already on the channel"_), and
   so does the code (`apps/runtime/src/renderer/features/inspector/applyDraft.ts:36-38`). **Nothing
   tells the operator.**
2. **The picker is override-blind.** `appliedPlateSources`
   (`apps/runtime/src/renderer/features/inspector/livePlates.ts:19-29`) resolves via the TEMPLATE
   assignment, and `effectivePlateSource` (`.../draftStore.ts:177-184`) returns
   `staged ?? applied ?? ''`. Neither consults `item.sourceOverride`.
   `SEARCH:` `git grep -rn "sourceOverride" -- apps/runtime/src/renderer` → **exactly one hit**,
   `features/layers/LiveSourceSwapDialog.tsx:80`. An active override is invisible everywhere except
   the dialog that set it.

**Repro:** take a row carrying a template with Live Source plates. Open the Inspector, change a
plate's source, apply. Nothing on air changes and nothing says so. Separately, swap a source via the
row's SOURCE verb, then open the Inspector: it shows the OLD source as current.

**Expected:** the surface says the edit takes effect at the next take and names the live path; and
the picker shows what is actually on air.
**Actual:** silence, and a confident wrong reading.
**Env:** Runtime, any build. Read from the code at `056ffdd5`.

🔴 **The defect is a MISSING REFUSAL/SURFACE, not a missing mutator.** R-048's row SOURCE swap is
shipped and already does the live thing — `swapLiveSource` re-issues as a producer replace through
the same resolver a take uses and re-derives the fit. And the assignment is shared by **every row
carrying that template** (`resolvePlateAssignments` filters `a.templateId === input.templateId`,
`live-plate-assignment.ts:95`, with no item id anywhere), so silently re-issuing would repoint every
other row on air with nobody told. **A control that silently does nothing is the worst of the three
outcomes, and it is what ships today.**

**THE DECISION IS TAKEN** (owner, 2026-08-18, `multibox-layout-switch` `design.md` §12.5): **SURFACE
ONLY.** The edit saves; the surface says _"takes effect at the next take"_ and **names the live path
— the row's SOURCE swap**. Refusing or confirming is friction without capability, since neither can
re-issue: after any dialog is dismissed the outcome is identical in all three candidates.

⚠ **The two halves ship together, or the repair is a half-repair** — telling the operator "this takes
effect at the next take" while still showing them the wrong current source would replace one
confusion with another.

**Acceptance:**

- WHEN the operator edits a plate's source in the Inspector while any row carrying that template is
  on air THEN the surface states that it takes effect at the next take, and names the row's SOURCE
  swap as the live path
- WHEN a row carries an active `sourceOverride` THEN the Inspector shows the source that is actually
  on air, not the template assignment it overrides
- WHEN the assignment is shared by more than one row THEN that is visible at the point of edit,
  rather than discovered by its effect on another row

- **Cross-refs:** [[B-145]] (the ledger this surface will read once it survives a restart),
  [[R-057]] (the operator half of the arrangement switch — same surface, same row),
  [[C-015]] / [[D-137]] (Live Source routing and the plate model), [[B-143]] (the other
  never-built honesty half in this area).

<!--
  CROSS-REFERENCE, deliberately NOT a second item.

  The text-fit defect — three schema spellings of "make the text fit" and NO runtime
  implementation, plus a Designer control (`autoSqueeze`) that writes a field nothing
  reads — is filed ONCE, as [[B-147]] in `bugs-designer.md`. It belongs there because the
  schema field, the control that writes it and the renderer that ignores it are all
  Designer-side.

  It is noted here because a RUNTIME reader meets it from the other direction: [[R-057]]'s
  arrangement switch needs a per-box title to fit a wide 1-box cell AND a narrow 4-box
  cell, and the first long Persian guest name overflows the narrow one ON AIR. So the
  operator-side symptom is a broadcast defect while the cause and the fix are both in the
  Designer.

  One root cause with two spellings must not get two fixes — the same discipline the
  B-140 / Splitter cross-reference in `bugs-designer.md` records, in the other direction.
-->

## [x] B-150 — a look that is not on screen keeps decoding, crawling and rotating: nothing stops the content inside a hidden look ⟨priority: medium — a frame budget spent on pictures nobody can see; the AUDIO half of the original report is NOT reachable, see below⟩ — FIXED 2026-08-21 (session BI)

**What.** `applyLook` shows exactly one look's composition instance and hides the rest with
`display: none`. Hiding a node does not stop what is inside it, and nothing else did: a hidden
look's `<video>` went on decoding, its Lottie went on computing a frame per tick and pushing
`goToAndStop`, its crawl went on crawling and its sequence went on advancing past items nobody
saw. Under LOOKS this is not an exotic case — every look a template authors is built and running,
and only one of them is visible — while `design.md` §9.6f measured the frame budget as the tight
resource (−4 % for interpolating holes, −10 % for a backdrop crossfade). A four-look template
therefore paid for four pictures to put one on air.

🔴 **The AUDIO half of the original report is NOT reachable, and this correction matters more
than the fix.** `tasks.md` 9.3 raised this as _"a hidden look's `<video>` keeps PLAYING ITS
AUDIO… the audio half is the severe part"_, and briefly made it a candidate for the owner's
unexplained on-air "2×" report. It cannot happen, on two independent grounds, both verified by
sweep rather than assumed:

1. **Every imported video has its audio track STRIPPED at conversion** — `-an`, decision (h), in
   `apps/designer/src/renderer/features/assets/video-convert-args.ts`.
2. **Every `<video>` the scene builder creates is muted** (`scene-builder.ts`, `el.muted = true`)
   and **nothing in the tree ever unmutes one**: `git grep "\.muted"` over `packages`, `apps` and
   `tools` returns writes of `true` and nothing else, and there is no `.volume =` write at all.

So the severity of this bug is a FRAME BUDGET one, not a sound-on-air one. 9.3's audio claim is
superseded by this entry. The unexplained "2×" remains unexplained and this was never its cause.

**Why it was worth fixing anyway.** The decode half is real and measurable on the plant, and it
scales with the number of looks an author writes — the one axis this feature exists to let them
increase.

**Fixed by** `packages/template-runtime/src/look-media.ts` — one seam (`LookMediaPark`), which
learns which look instances are hidden from the same `visibility` map the mask punch is computed
from, and per member SILENCES it (unconditionally) and PAUSES it (the policy half). Membership is
asked of the DOM (`Element.contains`), because `display: none` is a fact about the DOM and a
parallel table could disagree with what is on screen. Revive uses each driver's own `resume()`,
which for `VideoDriver` re-anchors its clock to the media's actual position without seeking — so a
switch back is seamless rather than a jump to the top of the clip.

**Two things are deliberately NOT parked, and both are load-bearing:**

- **Content that gates a HOLD.** A paused driver never completes, and a content-driven hold waits
  for completion — so parking a hold-gating driver inside a hidden look would keep the graphic on
  air forever, which is far worse than a decoding video. The rule reads the same `drivesHold` the
  hold arrays are built from. ⚠ Its bound: `D-112` lets a parent instance re-filter a child's hold
  participation, so a member registered parkable can still be pulled into a parent's aggregation.
  🔴 **And the practical consequence, because the rule above flatters itself:** video and Lottie
  have an OPT-IN `drivesHold`, so they are parked by DEFAULT and the media half of this bug is
  fully covered. Ticker and sequence have the INVERSE default (absent ⇒ they gate the hold), so an
  ORDINARY CRAWL IN A HIDDEN LOOK IS STILL CRAWLING — only one the author explicitly excluded from
  the hold is frozen. Closing that means making hold membership follow visibility at RUNTIME, which
  changes when a graphic comes off air; it is deliberately not folded in here.
- **Clocks, at all.** `ClockDriver.resume()` accrues the paused interval into `pausedAccumMs`,
  which `activeElapsedMs()` subtracts — a parked duration countdown would come back claiming the
  hidden interval as time it still has, and (a countdown being an opt-OUT hold driver) would
  extend the graphic's life by the time it spent hidden. A clock tracks time that passes whether
  or not anyone is looking.

**Acceptance**

- WHEN a look is not on screen THEN its `<video>` is paused and silent, and its crawl and sequence
  are frozen
- WHEN the operator switches back to a look THEN its clip continues from where it was rather than
  restarting
- WHEN a run's `play()`, a hold entry or a loop-cycle boundary restarts every driver THEN the park
  still holds — those paths know nothing about looks
- WHEN content inside a hidden look gates the hold THEN it is silenced but left running, so the
  graphic still comes off air
- WHEN a clock sits inside a hidden look THEN it keeps tracking the real time

**What the tests do NOT cover.** happy-dom has no decoder, so the decode LOAD — the thing that
makes this worth fixing — is unmeasurable in the suite and is not measured. The tests assert the
API facts the claim rests on (`paused`, `muted`, `currentTime` not rewound); the step from "the
element is paused" to "the decoder stopped spending frames" is the browser's contract. A real
number belongs on the plant's CEF beside §9.6f's own.

- **Cross-refs:** [[R-057]] (the arrangement/look switch this arises in — the operator half),
  [[B-149]] (the other on-air defect the same feature introduced, and the same lesson: the thing
  that hides a box must also govern what is behind it), [[D-128]] (the video lifecycle and its
  pause/resume contract), [[D-125]] (the Lottie driver, the same duck-typed seam). Supersedes the
  audio half of `multibox-layout-switch` `tasks.md` 9.3 and closes its decode half; the operator
  toggle over the pause policy is recorded as that change's task 7.10.

## [x] B-151 — PVW drew EVERY look's plates at once while air drew one: the preview overlay never learned that looks exist ⟨priority: high — the operator's last chance to catch a mistake was manufacturing one⟩ — FIXED 2026-08-21 (session BL)

**What the owner saw.** A template with a 1-box look (`l-1`) and a 2-box look (`l-1`, `l-2`), a row
in REHEARSE: **PVW drew both looks' plates simultaneously, overlapping.** On air, only the active
look rendered — correctly. So the preview and the output disagreed about what was on screen.

🔴 **The reading it was reported under was HALF WRONG, and the correction matters.** The relayed
diagnosis was "the page renders in three places and the look state reaches only two — PVW's page was
never wired". The second half is true and is fixed here. But it is **not what the owner saw**: the
page inside the PVW frame enters the AUTHORED DEFAULT look at build, synchronously, and hides the
other looks' instances — so the page was showing ONE look all along. **The overlapping boxes were the
placeholder OVERLAY**, Runtime-side chrome drawn on top of the frame, which had nothing to do with
the page's look state.

**The overlay's two errors, compounding** (`livePlateGeometry.ts`, `platePlacements`):

1. **MEMBERSHIP** — it mapped `live.sources`, which under LOOKS is the source-keyed UNION of every
   look's members. So every plate of every look got a box.
2. **GEOMETRY** — a declaration's `rect` is that plate's rect **in the default look only**, so even
   the plates that did belong were placed by the wrong look after a switch.

**Fixed by giving the resolution ONE owner.** `activeLookOf` + `lookPlateRects` now live on the
CARRIER in `@cg/shared-ipc`, beside `TemplateLiveSources`. The bridge's `#activeLookOf` /
`#desiredPlateRects` delegate to them and the overlay calls the same functions, so the boxes PVW
draws and the producers CasparCG seats resolve from one rule. PVW could not have called a private
method on a process it does not run in — which is exactly how it came to have its own idea of the
layout.

**And the page half, which WAS missing.** `RehearsalFrame` now carries the look on the reserved
`__cg` key of its `play`/`update` payloads — the same transport `CG ADD`/`CG UPDATE` use — so the
page in the preview follows a switch instead of sitting on the authored default forever.

**Switching looks in PVW** (owner, same day): _"you must also be able to switch between looks in
PVW."_ A look control was built on the PVW panel and then **REMOVED on the owner's correction**:
_"the same LOOK buttons on the row already worked for PVW too."_ He is right — the row's picker
drives `stack.set-active-look`, whose published `activeLookId` is what both halves of the preview
read. Two controls for one operation is this repo's two-spellings defect; the seam survived the
control's removal untouched.

🔴 **One control, two targets, and the row's state decides which.** A REHEARSING row is off air by
the R-022 interlock (rehearse is refused for an on-air row; a take is refused for a rehearsing one),
so `setActiveLook` records the look and **sends no AMCP** — asserted on the wire, not reasoned
about. An on-air row gets the cut. The picker names its own target (`PVW LOOK` vs `LOOK`, plus the
accessible name and `data-look-target`), because a control whose effect depends on state is only
safe if the operator can read that state at the point of action.

**What a take then does: what you rehearsed is what you take.** The recorded look is what
`#activeLookOf` resolves at the take and what rides the `CG ADD` payload unconditionally. No new
mechanism — it is what the shipped take path already does with a recorded look.

**Acceptance**

- WHEN a row is on a look THEN PVW draws exactly that look's plates, at that look's rects
- WHEN the operator switches look THEN PVW's overlay AND the page inside the frame both follow
- WHEN a look hides a plate THEN that plate has NO placement in PVW — not a zero-area one
- WHEN a rehearsing row's look is switched THEN nothing reaches CasparCG
- WHEN a template predates LOOKS THEN nothing about it changes

- **Cross-refs:** [[R-049]] (the placeholder overlay), [[R-022]] (rehearse and its interlock),
  [[B-146]] (the same class — a surface showing something air does not).

## [x] B-152 — a wire identifier reached a broadcast surface: `unknown channel: stack.set-active-look` in a red toast, mid-show ⟨priority: high — the operator can do nothing with it, and it names an internal id⟩ — FIXED 2026-08-21 (session BL)

**What.** Pressing a LOOK button during a live show produced a toast reading exactly
`unknown channel: stack.set-active-look`. That string is the BRIDGE's frame router
(`bridge.ts`: `unknown channel: ${frame.channel}`). A developer string must never appear on a
broadcast surface.

🔴 **One instance is a bug; this was a PATTERN, and that is the finding.** The sweep: **fourteen**
places in `apps/runtime/src/renderer` pass a caught `err.message` straight to a toast, and exactly
**two** translated these shapes — `sourcesTransportMessage` and `delimiterStore`'s
`describeCommitFailure`, each carrying its own copy of the regex. So the rule existed twice, was
applied twice, and every other channel leaked. Worse, the two copies **disagreed**: the delimiter one
tested only `unknown channel`, so a bridge that knew the channel and disagreed about its payload
answered `invalid request for delimiters.set` and that fell through to the operator verbatim.

**Fixed at the transport, not at the toast.** `shared/bridgeSkew.ts` owns the shape test and the
sentence; `WebSocketRuntime.#onMessage` — the ONE line where every bridge error response becomes an
`Error` — throws a `BridgeSkewError` whose message is already operator-legible. Every call site,
including ones not yet written, is covered without knowing the file exists. Asking each surface to
translate is the thing that just failed. The two existing translators now delegate, so the rule has
one spelling.

⚠ **A REFUSAL keeps the bridge's own sentence.** The bridge's refusals carry specifics this side
cannot know (which template is already on air, how many boxes it has); swallowing those would trade
one unhelpful message for another. Only the three TRANSPORT shapes are re-worded.

**And a second defect the fix uncovered.** `#invoke`'s `resolve` called `channel.response.parse`
inside the socket's `message` listener with no guard, so a malformed response **crashed the message
pump as an uncaught exception** instead of rejecting its caller — the caller then hung to its
timeout while the error surfaced with no connection to the command. Older than this session and true
of every channel; `B-153`'s handshake, being the first request on every connect, is what made it
reachable on every boot. It now rejects with the `invalid response for <channel>` shape, which this
same vocabulary words.

- **Cross-refs:** [[B-153]] (the connect-time guard — same incident, the other half), [[B-146]].

## [x] B-153 — nothing guarded Runtime/bridge VERSION SKEW: the mismatch was discovered by pressing a button on air ⟨priority: high — it cost a live debugging session⟩ — FIXED 2026-08-21 (session BL)

**What.** `caspar-bridge` is a separate long-lived process. A browser reload updates the SPA and NOT
the bridge, so a page routinely talks to a bridge older than itself. Nothing checked. The way an
operator found out was a LOOK button answering `unknown channel: stack.set-active-look` in the middle
of a show.

**A CAPABILITY HANDSHAKE, not a version compare — and the choice is the substance.** A version gate
answers the wrong question: two builds can differ in ways that have nothing to do with the channels
this page calls, so it either refuses working stations on any bump or needs a hand-maintained
compatibility range — a number somebody must remember to bump, which is the class of guard that is
already stale when it matters. The new `bridge.capabilities` channel reports the routes the bridge
**actually wired** (read from its own route map, so a deleted route disappears by construction), and
the SPA compares against `runtimeRequestChannelNames`, derived from what `@cg/shared-ipc` actually
exports. Neither side maintains a list by hand and it cannot false-positive on a bump that changed
nothing this page uses.

⚠ **The bootstrap case is the answer, not a hole.** A bridge too old to route the handshake replies
`unknown channel: bridge.capabilities` — which `B-152` has already classified — so it is read as the
strongest possible evidence of skew. There is no "too old to check" state that slips past.

🔴 **It REPORTS at connect; it does not REFUSE.** This is a deliberate reading of "fail at connect,
visibly": a bridge missing one new channel still plays out through the twenty it routes, and
refusing every command would convert a partial skew into a total outage — a worse failure than the
one being fixed, on the same surface. So a persistent amber `role="alert"` banner names the count and
the remedy at connect, the station keeps working, and the missing commands refuse themselves legibly.

⚠ **The route-coverage test now calls the SAME derivation.** It carried its own copy; a build-time
guard passing while the run-time one used a narrower rule would put a skew banner on every matched
pair and train operators to ignore it. A real-bridge test asserts that a matched pair reports no
skew, which is what would catch that rot.

- **Cross-refs:** [[B-152]] (the same incident's other half), [[B-074]] (the build-time route
  coverage this is the run-time counterpart to).
