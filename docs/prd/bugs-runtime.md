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
fields already work, the correctness check is missing. Implementation happens in the `cg-runtime`
worktree in its own chat — this entry is the filing only.

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

## [ ] B-107 — an errored stack row flips to READY when the BRIDGE PROCESS dies: the browser's retained-intent projection reduces every non-played status (including `error`) to `loaded`, so a load that never got a layer presents as playable ⟨priority: high⟩

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

## [ ] B-108 — a bridge restart silently DROPS stack rows it cannot re-seat: `restore()` skips them and returns a `skipped` count no UI surface consumes ⟨priority: medium⟩

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
