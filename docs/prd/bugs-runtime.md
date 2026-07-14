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
- Sweep pass 1 (2026-07-07, local CasparCG `2.5.0 69e8ad5 Stable`, probe `--sweep`):
  all 7 pre-existing candidates FAIL — the controls reproduce the DP1/DP2 signatures
  on this build — and both two-layer-model candidates PASS every class; winner
  **`js-escape+amcp-escape`** (byte-exact: net JSON backslash → 4 wire backslashes,
  quote → backslash-quote). Status: empirically confirmed on 2.5.0 (`69e8ad5`);
  provisional for 2.3.2, supported by the source-level finding that `v2.3.x-lts`
  and `master` share byte-identical escape semantics in both layers; a 2.3.x
  hardware pass (sweep, or live special-char validation) remains the gate before
  B-041 closes. Details:
  `openspec/changes/fix-amcp-escaping-v2/design.md` → "Hardware sweep results".
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
