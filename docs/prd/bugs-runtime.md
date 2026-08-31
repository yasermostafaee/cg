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

- **Cross-refs:** [[R-049]] (the placeholder overlay), [[R-048]] (the emergency patch this
  overlay must also honour), [[R-022]] (rehearse and its interlock), [[B-146]] (the same class — a
  surface showing something air does not), and 🔴 **[[B-157]] — THIS EXACT SHAPE, ONE FIELD OVER.**
  This item taught the overlay that looks exist for its **RECTS**; its NAMES were never taught, and
  the same operator met the same class of wrongness on the same surface a week later. The warning
  that closed this session's handoff — _"one surface learning a state and its neighbour not is a
  recurring shape in this feature, not a one-off"_ — was right, and `B-157` is the proof.

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

🔴 **A COVERAGE GAP IN THIS GUARD, FILED 2026-08-21 (session BP). It does NOT reopen the design
decision — read the second paragraph before proposing a version compare.**

The handshake compares **the ROUTES the bridge wired**. So it catches the skew that MOTIVATED it —
a Runtime calling a route the bridge does not serve — and it cannot see the skew where **the route
set is identical and the PAYLOAD SHAPE is not**. A Runtime bundle that is stale but calls the same
routes produces **no banner at all**, while its own zod parse silently strips a field the bridge is
sending. The operator sees a value that will not stick, with every surface reporting normal.

That is not hypothetical: it is the one axis session BO could not rule out behind the `§3c` report
(`tasks.md` 7.19 — _"UPDATE sends the values back to template default"_, not reproduced on either
backend, and indistinguishable from this at the console). **The guard cannot see the skew that
would cause the report it was built after.**

⚠ **The version compare stays rejected.** BL ruled it out for reasons that still hold, and this is a
statement about what the route comparison COVERS, not an argument for replacing it. The cheap
candidate is additive: **a BUILD STAMP reported alongside the route set**, compared only for
equality and surfaced as information rather than as a refusal — the bridge already answers a
handshake, so the field costs one string. Not built here; recorded so the next reader is choosing
rather than rediscovering.

- **Cross-refs:** [[B-152]] (the same incident's other half), [[B-074]] (the build-time route
  coverage this is the run-time counterpart to), [[B-155]] (whose sibling report `§3c` is the shape
  this gap would explain).

## [x] B-154 — a HELD live plate kept rendering: five feeds from the look you LEFT, tiled inside the look you switched TO ⟨priority: high — the wrong guests on air, from a switch that reported success⟩ — FIXED 2026-08-21 (session BM)

**What.** A 6-box debate is on air. The operator switches to the SOLO look. §12.4 holds the five
plates solo does not show — seated, muted, not punching — and the switch reports `ok`. **The five
held feeds appear inside the solo box**, each in the cell it occupied a moment ago, on top of the
picture the operator actually wanted.

**Why, and it is one sentence.** The hold muted the plate and stopped there. Its producer kept the
`MIXER FILL`/`CLIP` it was given for the look it left, so it went on rendering into that cell — and
a page's punched hole is transparent to the **whole band**, not to one layer. CasparCG composites
the band bottom-up; the solo hole is the full raster; every held cell lies inside it.

🔴 **THE PREMISE THAT WAS WRONG IS A SENTENCE, AND IT IS WHY THREE TEST SUITES MISSED THIS.**
`live-plate-release.ts`'s header read _"the plate stops being VISIBLE because the page stops punching
its hole; that is a different mutation on a different machine, and this module is deliberately about
the seat alone."_ That is **true about the plate's own cell and false about the frame**. Because the
sentence was believed, the phase-3 tests asserted the three axes it implies — a held plate keeps its
LAYER, keeps its PRODUCER, loses its VOLUME — and **nobody ever asked what it RENDERS**. One
regression test even pinned the defect in place, asserting that no `MIXER … FILL` is emitted for a
held plate on the way back.

⚠ **The predicate that would have caught it already existed and was never called.** `@cg/amcp-mock`
exposes `layerRenderedRect(slot)` — the intersection of `FILL` and `CLIP`, or `null` when the layer
renders nothing — and its own doc says why it exists: _"a test asserting only on `layerState().fill`
cannot catch it."_ Every look test asserted on `clip`. The regression test now asks the mock's
predicate instead of re-deriving one, which is golden rule 6 applied to a test.

**Fixed by giving the HOLD a geometry.** A held seat's fill is PARKED — moved off the raster, its
size kept — and the record stores what was sent, so the return trip's ordinary delta finds the
geometry moved and re-emits the real fit. Recording the real fit while sending the parked one would
have made coming back a silent no-op and left the box empty for good.

🔴 **THE FILL IS THE HALF THAT MOVES, AND THAT IS THE DESIGN, NOT A COIN TOSS.** `mixerFit` emits
`FILL` then `CLIP` on one connection and either can be refused. An off-raster fill renders nothing on
`FILL` alone, so a refused `CLIP` after an acked `FILL` still renders nothing — **the partial send is
safe by construction.** The mirror spelling (leave the fill, move the clip away) fails twice: a
refused `CLIP` leaves the defect exactly as it was, and no in-raster rectangle is disjoint from a
FULL-FRAME fill at all, so a plate held after a solo look would have nowhere to put the mask.

⚠ **What is measured and what is not.** That a fill box moved out from under its clip window renders
nothing at all IS measured (`design.md` §3's last row, on 2.5.0 and re-confirmed on the plant's
2.3.2). That `MIXER FILL` accepts an origin outside `0..1` — an ordinary transform, and the basis of
every animate-in — is **not separately measured on this plant**, and is filed for the hardware
session rather than assumed silently.

**Acceptance**

- WHEN a look switch holds a plate THEN that layer renders NOTHING, not its previous cell
- WHEN the look being entered punches a hole over a held plate's old cell THEN nothing of the held
  feed appears in it
- WHEN the look switches BACK THEN the plate's real geometry is re-emitted and it is on screen again
- WHEN a held plate is held across a second switch THEN the park is not re-sent
- WHEN a `MIXER` of the park is refused THEN the record does not claim it and the next reconcile
  re-sends

- **Cross-refs:** [[B-126]] (a replace is never a CLEAR-then-ADD — the sibling rule about what a
  seat change may emit), [[B-145]] (the ledger records what was SENT, which is what makes the return
  trip work), [[B-151]] (the other half of "a surface disagreed with air", from the preview side).

## [ ] B-155 — a source change LURKS until the next LOOK press, which then applies it mid-switch and flashes the PREVIOUS GUEST on air ⟨priority: high — the wrong face, on air, from a button that was supposed to be a cut⟩ — OPEN. The CAUSE was removed 2026-08-21 (session BP: the row freezes its assignment at take); the PLANT MEASUREMENT is still owed and nothing here is verified on air

**What the owner saw, on air.**

> _"If I change the sources and press UPDATE, nothing happens — but pressing the LOOK buttons performs
> a take again. If I'm on 2-box, change `l-1`'s source and press look-1, then when we go to solo **it
> shows the OLD source for a moment and then switches to the new one.**"_

### 2026-08-24 — QUALITATIVE CONFIRMATION FROM THE TWO-SERVER PLANT RUN: the flash is VISIBLE TO THE NAKED EYE

On the owner's first real two-server plant run, the switch flash was **visible to the naked eye**.

🔴 **This changes exactly one thing and it is worth being precise about which.** It confirms that the
PHENOMENON IS REAL ON AIR — which was not previously established, since every assertion behind this
item runs against `@cg/amcp-mock` and the sections below say at length why a green suite is not
evidence. **It does NOT discharge the plant measurement, and it does not let anyone tick this box.**
What is still owed is unchanged and is the whole remaining deliverable: `6.9a`, `§3b`, and **the
frame count at 25 fps, reproduced twice, with the channel read EMPTY before and after.**

⚠ **A naked-eye sighting is not a frame count, and the difference is the entire point of this item.**
_"Visible"_ says the window is at least one frame; it does not say whether it is one frame or six,
and it cannot say whether session BP's cause-removal shortened it. Recording the sighting here is so
that the next session knows the phenomenon survives — not so that it can skip the measurement.

⚠ **And note what was ALSO visible in the same run: the PAGE/MIXER SKEW, filed as [[B-174]].** That
is a DIFFERENT artefact in the SAME window and the two must not be conflated when the recording is
finally made. They are separable in the trace: this item's flash requires a `PLAY` inside the
switch; B-174's skew is the gap between `MIXER FILL` and the following `CG UPDATE` in a switch with
no `PLAY` at all. **One plant session with one recording can settle both, and should.**

🔴 **TWO COMPLAINTS, ONE DEFECT, AND THAT IS THE FINDING.** They read as separate bugs — a dead
button and a video glitch — and they are the same mechanism seen from each end.

**The mechanism, established from the code and pinned on the wire**
(`live-look-reconcile.integration.test.ts`, _"an assignment change LURKS…"_):

1. `setSourceAssignments` writes the map and emits. **It does not reconcile.** So an assignment
   change reaches nothing at the moment it is made — the operator's _"nothing happens"_ is the
   product working as built.
2. It then lands at the **next reconcile from ANY cause**, and a look press is one. That is the
   second apply path: **the LOOK button performs an apply nobody designed it to do.** Two live paths
   to one operation is the defect this project keeps paying for — `patch-BL-01` removed exactly this
   shape from the PVW panel one session earlier.
3. And because the change lands **during** the switch, the seat's producer changes **inside** it: a
   `PLAY` (a replace, `B-126`) on a layer whose hole the page is moving on top of. **That is the
   flash.** An ordinary (B′) switch is pure `MIXER FILL` and cannot flash — the flash REQUIRES a
   producer change in the same action, and the lurking assignment is what puts one there.

⚠ **`STAGED` was never the leak, and the distinction matters.** A staged Inspector edit lives in the
renderer's draft store and has never been sent; the bridge cannot apply what it was not told. What
lurks is an **APPLIED** assignment. Both are asserted, because _"the look button applied my edit"_ is
true of one and false of the other.

**What session BM-2 did: narrowed ONE path, and verified NOTHING on the plant.** The Inspector's
per-look binding is applied by `UPDATE` in one atomic call that reconciles immediately, so THAT change
lands where the operator pressed it and the switch that follows has no producer to replace. Asserted
as that property, not as an absence.

🔴 **THIS IS NOT A FIX, AND A GREEN SUITE IS NOT EVIDENCE THAT IT IS.** Every assertion behind it runs
against `@cg/amcp-mock`, and the mock is precisely the thing that models the behaviour in question:

- **`PLAY` on an occupied layer as an in-place replace** — which `caspar-runtime.ts`'s own
  `swapLiveSource` doc already marks **UNVERIFIED on the production 2.5.0 (task 6.9a)** (corrected
  2026-08-22 — this said "the plant's 2.3.2", which is retired and must never be probed): _"the mock
  models `PLAY` on an occupied layer as a replace, so the tests prove this code is self-consistent
  and prove NOTHING about the server."_ The flash IS the replace's timing, so the mock cannot see it
  by construction.
- **Whether `FILL` and `CLIP` land on the SAME FRAME** — an open question (`design.md` §3b:
  `MIXER … DEFER` + a channel-scoped `COMMIT`, forbidden here until the COMMIT-scope question is
  answered). A hole that opens a frame before its mask is another way to reveal the wrong picture.

**So the probes this waits on are named: `6.9a` and `§3b`.** Until both are answered on the plant,
neither the narrowing above nor any candidate below may be reported as having removed the flash.

⭐ **THE OTHER HALF IS NOW DONE — THE CAUSE IS REMOVED (2026-08-21, session BP) — AND THIS ITEM
STAYS OPEN, DELIBERATELY.** Read both halves of that sentence before ticking anything.

**What changed.** A row now **FREEZES its template assignment (level 2) at TAKE**: it captures the
`{plate → catalog entry}` in force and every later resolution on that row — a look switch, an
`R-048` swap, an UPDATE, a reconcile after a bridge restart — reads that snapshot. `setActiveLook`
therefore cannot apply a lurking assignment, because there is no longer anything for it to pick up:
the wire assertion in `live-look-reconcile.integration.test.ts` is **inverted** and now demands the
switch issue no `PLAY` at all. It thaws at a landed `out`/`stop`, dies at `remove`, and a re-take
re-captures — which is how an operator adopts an edited default.

⚠ **Two narrower fixes were considered and rejected, and the reasons are worth keeping.** Disabling
the Inspector's editor on an on-air row narrows WHO can reach the mechanism and leaves it intact:
the assignment is template-wide and installation-wide, so another row on the same template — or
**another station's Runtime against the same bridge** — can write it while this row is live.
Reconciling inside `setSourceAssignments` removes the lurk by applying a template-wide edit to every
row on air, which is the same accident arriving on time.

🔴 **WHY THIS ITEM IS STILL OPEN.** What is closed is the CAUSE, asserted on the AMCP wire. What was
never in question on the wire, and is still owed, is the **plant measurement**: `6.9a`, `§3b`, and
the frame count at 25 fps reproduced twice with the channel read EMPTY before and after. The
paragraphs above say a green suite is not evidence that the flash is gone; that remains true of THIS
change too, and it is exactly the mistake ticking this box would make. **Nobody may report the plant
as fixed until it has been watched.**

🔴 **WHAT IS STILL OPEN — the general gap (patch A6).** Any action that changes a seat's producer
while its hole moves reaches the same window: a re-point landing in the same action as a switch, or a
look whose preset was never seated. The repair removes the path the owner walked, **not the gap**.

### 🔴 THE RULE FOR THE GENERAL FIX, decided so the next session does not re-litigate it

**The new look's hole must NEVER show the previous source. If the incoming producer is not ready,
BLACK is acceptable and the previous guest is not.** An ugly frame is a blemish; the wrong face under
a caption is a broadcast error.

⚠ **This does NOT contradict `B-126`, and the difference is the situation, not the principle.**
`B-126` forbids a `CLEAR` before a `PLAY` on the EMERGENCY REPAIR of a dead feed, where the choice is
between a merely-dead picture and black, and black is worse. Here the choice is between the WRONG
GUEST and black. Same reasoning, opposite answer, because the alternative to black is different.

### The candidates, priced — and the measurement that decides

| Candidate                                 | Cost                          | Why not yet                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⭐ `LOADBG` then `PLAY`                   | one extra command per re-seat | AMCP's own answer to exactly this; **`LOADBG` is not in this bridge's vocabulary and is unmeasured for LIVE producers on the production 2.5.0** (its HTML pre-warm IS measured there, design.md §9.6c) |
| Hold at `MIXER OPACITY 0` until confirmed | needs a readiness signal      | `OPACITY` unmeasured here, and "confirmed" has no source yet                                                                                                                                           |
| Targeted `INFO` before punching           | a round-trip per switch       | turns a cut into a round-trip; likely worse than the flash                                                                                                                                             |
| Bounded frame deferral                    | none on the wire              | a guess dressed as a fix, and it must never expire into "show the old one"                                                                                                                             |

🔴 **What is OWED and cannot be done from a dev machine: the frame count.** Patch A1 asks for a
reading at 25 fps, reproduced twice, with the channel read EMPTY before and after. **This session had
no plant access, so the number is not in this entry.** The MECHANISM needed no hardware and is
established; the CHOICE between the candidates needs the measurement, because it decides whether the
gap is one frame or twelve.

### ⭐ MEASURED LOCALLY 2026-08-31 (`SKEW-COUNT-01`) — the window recorded on the owner's machine, with the PLAY inside it; the PLANT measurement above stays owed

Ran on the owner's dev machine against the real 2.5.0 `69e8ad5` at `1080i5000`, with
[[B-174]]'s harness (`tools/skew-harness`, `--with-play-switch`) — the channel recorded to a
file, the switch driven through `setActiveLook`, the verbs read off a wire tap. **This is a
LOCAL reading of the window's shape and does not discharge the plant measurement above** — no
DeckLink, no genlock, and the flash the owner saw was on plant hardware.

🔴 **How a `PLAY` gets into a switch TODAY, post-freeze — the general gap has a concrete
door, and it is LEVEL 1.** Session BP froze the ASSIGNMENT (level 2) at take, but the CATALOG
is deliberately not frozen (_"if the installation re-points that entry, the row follows"_) —
and `setSourceCatalog` validates, applies and emits **without reconciling**. So a catalog
re-point LURKS exactly the way the assignment used to, and the next look press applies it
mid-switch: measured on the wire as `PLAY` → `MIXER VOLUME 0` → `MIXER FILL`/`CLIP` ×4 →
`CG UPDATE`, all inside one `setActiveLook`. This is the mechanism at the top of this item,
alive one precedence level down; it is within patch A6's already-recorded scope ("a re-point
landing in the same action as a switch"), so it takes no new number.

**The window, in recorded fields (20 ms each), four runs, all four carrying the `PLAY`:**

| event                                | field offset, relative to the fills |
| ------------------------------------ | ----------------------------------- |
| `MIXER FILL` lands (geometry moves)  | 0                                   |
| page repunches (holes move)          | +1 … +3 (the [[B-174]] skew)        |
| the replacing producer's FIRST frame | **+4, every run (80 ms)**           |

So locally the wrong-content exposure is bounded by the REPLACE, not by the skew: the `PLAY`
is issued first on the wire but its first frame lands last, ~2 fields after the holes — the
old source sits inside the moving window for ~4 fields (~80 ms) end to end. A media producer
opens faster than a DeckLink input initialises (see [[B-177]]), so **treat 80 ms as a floor,
not an estimate, for the plant**.

**Acceptance**

- WHEN a source is changed and applied THEN it reaches the wire at that moment, not at the next
  unrelated action
- WHEN a look is pressed THEN it moves geometry, and applies nothing
- WHEN a seat's producer must change while its hole moves THEN the hole never reveals the previous
  producer — black is the permitted worst case
- WHEN a bounded wait expires THEN it does not resolve to showing the old source

- **Cross-refs:** [[B-126]] (a replace is never a CLEAR-then-ADD — the rule this one bounds rather
  than breaks), [[B-154]] (the other half of "a seat shows something it should not"), [[R-048]] (the
  emergency whose trade-off is the inverse of this one).

## [x] B-156 — the Inspector's LOOK INPUTS badge said `ON AIR NOW` for a row the layer table called `READY` ⟨priority: medium — a surface claiming air for a graphic that is not on it⟩ — FIXED 2026-08-21 (session BO)

**What the owner saw**, with a screenshot: in LOOK INPUTS, `look-2` badged **`ON AIR NOW`** while
the same row's state in the layer table read **`READY`**. The row was loaded and selected; **nothing
was on air.**

**Why.** The badge was gated on `activeLookOf(carrier, item.activeLookId)`, which answers _which
look this ROW is set to_ — and says nothing whatever about whether the row is PLAYING. So it was
true the moment a row was loaded, and the words claimed air.

🔴 **THE FILE'S OWN COMMENT ALREADY DREW THE DISTINCTION THE LABEL THEN IGNORED**, which is what
makes this worth a number rather than a tidy-up. On the badge's colour:

> _"NOT GREEN. Green is the layer table's ON AIR mark and means **"this row is playing"**; this says
> **"of this row's looks, THIS is the one composited"**."_

The COLOUR was chosen carefully to keep the two meanings apart — and then the TEXT asserted the
very meaning the comment says the badge does not have. **Golden rule 6, on a label:** the words
state a condition, so something must test THAT condition, and it must reuse the ONE canonical
predicate rather than re-derive it locally. Nothing tested it at all.

**Fixed as three states, both predicates IMPORTED:**

| row state     | badge                            |
| ------------- | -------------------------------- |
| on air        | `ON AIR NOW` — true before, kept |
| rehearsing    | `SHOWING IN PVW`                 |
| loaded / idle | `SELECTED — A TAKE SHOWS THIS`   |

- `isOnAir` is the layer table's own predicate (the LIVE PLATES section above already called it).
- `isRehearsing` is `@cg/shared-ipc`'s — the one `LayersPanel` reads for the row picker's
  `PVW LOOK` / `LOOK` label. It arrives as a **PROP** rather than a second subscription: the caller
  already derives it for the row, so the Inspector's badge and the row's picker answer to ONE
  derivation instead of two that agree until they do not. (Subscribing inside the section was
  tried first and rejected — it coupled a presentational component to the bridge and broke every
  test that renders it without one, which is its own argument.)

⚠ **THE REHEARSING CASE IS THE `B-151` SHAPE AGAIN, and that is the finding worth carrying.**
Session BL shipped the PVW-vs-air distinction on the row's own picker one session earlier; **this
section never learned it.** One surface acquiring a state while its neighbour does not is now a
recurring shape in this feature rather than an incident — `B-151` was PVW's overlay not knowing
looks existed while air did.

⚠ REHEARSING is checked before ON AIR. The order is safe rather than lucky: `R-022`'s interlock
makes the pair unreachable (a rehearse is refused for an on-air row, a take for a rehearsing one),
and that interlock is asserted on the WIRE in `live-look-reconcile.integration.test.ts` rather than
assumed here.

**Acceptance**

- WHEN a row is loaded but not playing THEN the badge does not contain "ON AIR"
- WHEN a row is on air THEN it says so
- WHEN a row is rehearsing THEN it names PVW, not air
- WHEN the on-air question is asked THEN it is asked of the same predicate the layer table uses

- **Cross-refs:** [[B-151]] (the same shape one layer out — a surface that had not learned a state
  its neighbour had), [[R-022]] (the interlock the three-state order rests on), [[R-048]].

## [x] B-157 — PVW named the WRONG SOURCE: the overlay learned about looks for its RECTS and never for its NAMES ⟨priority: high — the preview, whose whole job is naming the source, named one air would not show⟩ — FIXED 2026-08-22 (session BQ)

**What the owner saw**, with a screenshot. A row is **ON PVW** (rehearsing), PVW LOOK = `look-1`.
In LOOK INPUTS he sets `look-1` → plate `11` → **studio 3** and presses UPDATE. **The PVW
placeholder still reads "studio 1"** — the template's default for that plate. The binding is
applied everywhere else; the preview names the old source.

🔴 **This strikes at [[R-049]]'s stated reason for existing.** Its own text: _"⭐ It does what the
PAGE never could: show the ASSIGNED SOURCE'S NAME… The Runtime knows the join."_ **The join it drew
was the wrong one** — which is worse than drawing none, because an operator checks PVW precisely to
avoid putting the wrong face up.

## The cause was visible in a type signature

`livePlateGeometry.ts`:

```ts
export function platePlacements(
  …,
  sourceNameOf: (plateId: string) => string | null,   // ← keyed by PLATE ALONE
  activeLookId: string | undefined,                   // ← passed, and used only for the RECTS
)
```

**A map keyed by plate id with no look in it makes a per-look binding UNREPRESENTABLE** — the same
plate in two looks can only ever yield one name. The active look was sitting in the very same
argument list, driving the geometry and ignored by the naming. The caller
(`PreviewPanel.tsx`) built that map from `appliedPlateSources`, which is **level 2 only**, so
level 3 (the per-look composition) and level 4 (`R-048`'s emergency patch) were both invisible to
the preview.

🔴 **THIS IS [[B-151]] AGAIN, ONE FIELD OVER**, and that is the finding rather than the bug. `B-151`
was _"PVW's overlay never learned that looks exist"_ — about RECTS. Session BL's handoff closed by
warning that _"one surface learning a state and its neighbour not is a recurring shape in this
feature, not a one-off."_ It was right, and this is the second instance on the same component.

## Fixed by moving the resolver, the way `B-151` was fixed — not by patching the call site

The four-level precedence lived bridge-side only (`live-look-bindings.ts`), which is exactly why
the renderer could not perform it. `lookPlateRects` already carries the argument in its own doc:
_"PVW could not have called a private method on a process it does not run in — which is precisely
how it came to have its own idea of the layout."_

So `effectiveOverridesForLook` **moved to `@cg/shared-ipc`**, beside `activeLookOf` /
`lookPlateRects`, joined by `assignmentInForce` (level 2, honouring session BP's frozen snapshot)
and `resolvePlateSourcesForLook` (the whole answer for one look). **The bridge delegates to them**
— `resolveLookBindings` no longer composes the levels itself.

And the SHAPE changed so a caller cannot drop the look again: `platePlacements` takes the
resolution INPUTS (`PlateSourceLookup`) and calls the shared resolver **with the look it already
holds**. A plate-keyed callback would have fixed the symptom and left the next caller free to pass
a look-blind map.

**The rule, which settles every case in one sentence:** _the PVW overlay names exactly what a TAKE
of THIS row, in THIS look, would put on air._

**Acceptance**

- WHEN a per-look binding is applied for the look PVW is showing THEN the placeholder names the
  BOUND source, not the template default
- WHEN the same plate is bound differently in two looks THEN switching the PVW look changes the
  NAME as well as the rect
- WHEN an `R-048` emergency patch is in force THEN the placeholder names the patched source in
  EVERY look
- WHEN no per-look binding exists THEN the template default is named, as before
- WHEN the bridge and the overlay are asked the same question THEN they answer from the SAME
  function, asserted at that function rather than once per surface

⚠ **Session BP's frozen level 2 is honoured too**, though a rehearsing row is off air by `R-022`'s
interlock so nothing is frozen for it today. It is threaded and tested anyway: a preview resolving
the LIVE assignment while air resolved the FROZEN one would be a second answer to the same
question, and the rule above has to stay true if that interlock ever changes.

⚠ **A gap found on the way, filed rather than fixed here:** `apps/runtime/tsconfig.json` includes
`src/**/*` only, so **the runtime's `typecheck` never sees `tests/`** — a fixture kept a field this
change REMOVED and omitted the one it ADDED, and nothing caught it (vitest transpiles without
checking). Turning it on is its own piece of work: **113 pre-existing errors, measured**.

> ✅ **CLOSED 2026-08-22 (session BR).** The count was re-measured independently rather than
> trusted, and matched at **113**. The typecheck now includes `tests/`, and the sweep found
> **four tests that were not asserting what they looked like** — a shape test that never made
> its claim about a row with live plates, a harness that could not render a rehearsing row at
> all, a panel spec three APIs out of date, and a mock-parity guard blind to two whole groups.
> **No product defect: every one was a hole in a guard.** See
> `docs/handoff/2026-08-22-session-br.md` §2.

- **Cross-refs:** [[B-151]] (the same shape one field over — RECTS, where this is NAMES; read them
  as a pair), [[R-049]] (the overlay whose purpose this defeats), [[R-048]] (level 4, which the
  overlay now honours), [[B-146]] (the class: a surface showing what air does not).

## [ ] B-158 — a look switch is not visually ATOMIC: the pictures move first and the page's chrome follows, so the OLD look's outlines are briefly drawn around the NEW look's picture ⟨priority: medium — cosmetic, but it is on air and it is every switch⟩ — OPEN. Mechanism established from the code; the FRAME COUNT is a plant reading nothing in this repo can take

**Observed 2026-08-22, by the owner, on air.** Switching between looks, the two halves of one
switch land at different times: **the pictures move first, the background and the strokes around
the boxes follow.** Going from a 2-box look to a solo look he sees the big solo picture **while
the 2-box outlines are still drawn**. Brief, but visible. In his words:

> _"if it happened at the same time it would be better."_

🔴 **CLASS: COSMETIC-ON-AIR. This is NOT a wrong-source defect, and it does not reopen
[[B-155]].** `B-155`'s decided rule — _the new look's hole must NEVER show the previous source; if
the incoming producer is not ready, BLACK is acceptable and the previous guest is not_ — is
**untouched by this item and is not in question here**. What is briefly wrong here is the
**chrome**: the background and the box strokes belonging to the look being LEFT, drawn for a few
frames around plates that have already moved to the look being ENTERED. Nobody's face is in the
wrong hole. An item about decoration must never be read as reopening an item about sources, so
this paragraph is placed before the mechanism rather than after it.

### The mechanism, established from the code

> ⭐ **2026-08-31 (`SKEW-HOLD-01`) — the DOCTRINE THIS SECTION DOCUMENTS IS GONE for the look
> switch, and this item's "option (b)" direction is what replaced it.** `B-174`'s fix reordered
> `setActiveLook` to page-first + a one-channel-frame mixer hold, so the answer to the 🔴 question
> below ("does anything tell the page BEFORE the fills move? NO") is now **YES — the switch
> does, by design**, and the fills follow one held frame later. The line anchors in this table are
> the 2026-08-24 tree's. The CHROME question this item is actually about — whether a leaving
> look's decoration is briefly drawn around moved plates — should be RE-JUDGED against the new
> order: the page now paints FIRST, so the chrome and the holes move together and the fills catch
> up, which is the opposite lag and likely smaller than what the owner saw. Re-observe before
> spending on this item.

The ordering was exactly the _"fills first, page last, only on success"_ doctrine, deliberate at
every step:

| half                          | where                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| the switch entry              | `tools/caspar-bridge/src/caspar-runtime.ts:4596` — `setActiveLook`, whole on-air branch under `#withLiveSeatLock` (`B-155` §B)            |
| **1. the MIXER commands**     | `caspar-runtime.ts:4702` — `reconcileLivePlates(itemId, { mode: 'live', lookId })`, which issues the per-plate `MIXER FILL`/`CLIP`        |
| **2. the PAGE update**        | `caspar-runtime.ts:4744` — `#tellPageLook(...)` → `caspar-runtime.ts:4561` — `#send(this.#builder.updateLook(slot, lookId), …, 'urgent')` |
| the command itself            | `tools/caspar-bridge/src/command-builder.ts:87` — `updateLook`, the reserved `__cg` key on a `CG UPDATE`                                  |
| **3. where the page redraws** | `packages/template-runtime/src/runtime.ts:2399` `setActiveLook` → `:557` `enterLook` → `:534` `applyLook` → `:476` `repunch`              |

**The page CUTS; it does not animate.** `runtime.ts:517-519` states it as a design decision:

> _"Exactly ONE look's instance is visible; a switch is a VISIBILITY FLIP plus a re-punch, and
> deliberately nothing else — no geometry override machinery, because under LOOKS the geometry is
> authored inside each look's own sub-scene."_

So the chrome the owner is describing — background, box strokes, frame decoration — is authored
**inside each look's own sub-scene instance** and changes when `applyLook` (`runtime.ts:534`)
rewrites the `visibility` map and `repunch` (`runtime.ts:476`) re-applies it. There is no
transition, no fade and no easing anywhere on that path: the chrome is correct on the frame the
page paints, and wrong on every frame before it.

🔴 **Does anything today tell the page the target look BEFORE the fills move? NO — verified.**
`updateLook` has exactly **one** production caller, `#tellPageLook` at `caspar-runtime.ts:4562`,
and it is reached only after `reconciled.ok` at `:4702`. `setActiveLook` deliberately records
nothing up front (the long `tasks.md` 7.9 note at `caspar-runtime.ts:4613-4643`), and
`caspar-runtime.ts:5714` says in terms: **_"Do not add an `updateLook` here."_** The page learns
the target look strictly after the fills have moved, by design.

### ⚠ The existing note bounds the TRANSPORT, not the RENDER — read this before concluding the gap is sub-frame

`caspar-runtime.ts:4723-4731` argues the window is small, and its numbers are real:

> _"`CG UPDATE` → `window.update` was measured at 2.2–8.3 ms (median ≈5 ms, §9.2) — under a
> quarter of a 20 ms frame at 50i — and both commands go out back-to-back on ONE connection in the
> urgent lane, so nothing queues between them."_

**That measurement ends where this defect begins.** It is command-out → JS-handler-entry. It does
NOT include what happens after `window.update` returns control to the page:
`applyLook` → `repunch` → `applyArrangementToNodes` → **`liveArrangementView`, which reads the
page's layout BACK out of the DOM** (`runtime.ts:480-483`, a forced synchronous layout by
construction — the comment calls the read-back load-bearing) → `repunchLiveSourceHoles` → the
browser's own layout and paint → the CEF texture → the server's composite of that texture.

Meanwhile the `MIXER FILL` half needs none of that: it is server-side compositing and lands on the
server's next frame.

**So the two halves are not racing over the transport — they are racing a transport against a
browser render, and only the transport has ever been measured.** Anyone reading the `:4723` note
alone would reasonably conclude the gap is a quarter of a frame and that the owner cannot be
seeing this. That conclusion does not follow, and this paragraph exists so the next reader does not
draw it.

### 🔴 THE UNKNOWN: `k`, how many frames the page trails the mixer

**`k` is not known, and it cannot be obtained in this repo.** `@cg/amcp-mock` has no notion of
producer acquisition, no CEF, and no frames at all — it models a `MIXER` change as an instantaneous
state write and cannot see a rendered pixel. **No test anywhere in this repository can measure
`k`**: not a unit test, not an integration test, not a Playwright E2E, because every one of them
observes either the wire or a browser, never the server's composited output. The suites can prove
the ORDER (and do — `live-look-reconcile.integration.test.ts:1813` asserted `fills first, page
last` at the wire; since `B-174` the same pin asserts the inverted order). Order is not the
question here; **the question is how many frames sit between the two, and that is a PLANT
READING** — one that `SKEW-COUNT-01` then took with `tools/skew-harness`, which is how `B-174`
came to be fixed at all. See the dated note at the top of this section.

Everything about the remedy depends on `k`. At `k = 1` this is arguably not worth changing; at
`k = 5` at 25 fps it is a fifth of a second of visibly wrong decoration on every switch. **Measure
before choosing** — the walk step below rides the same plant visit as `B-155`'s.

### Repro

1. A template with at least a 2-box look and a solo look, on air on an off-air-safe channel.
2. Take the row into the 2-box look.
3. Press the solo look in the look picker.
4. Watch the boundary between the two looks in slow motion.

**Expected:** the plates' geometry and the page's chrome (background, box strokes) change on the
SAME frame — the switch is one visual event.

**Actual:** the plates move first; the previous look's chrome is still drawn for `k` frames
afterwards. Going 2-box → solo, the solo picture appears while the 2-box outlines are still around
it.

**Env:** production CasparCG **2.5.0** (`69e8ad5`); bridge on `dev` at or after 2026-08-22. Not
reproducible against `@cg/amcp-mock` — see the unknown above.

**Regression-test note:** 🔴 **a regression test for the visible symptom cannot exist here**, for
the reason given above. What CAN be tested, and already is, is the ORDER
(`live-look-reconcile.integration.test.ts:1813`). If an option below is implemented, its testable
surface is the WIRE — that a `MIXER FILL` carries the chosen duration and tween, and that the page
payload carries the matching duration — never the pixels. Any test claiming to prove the frames
match is claiming something the mock cannot know.

### The options — RECORDED, NOT CHOSEN

Each states what happens to **_"page last, ONLY ON SUCCESS"_** — the guarantee
(`caspar-runtime.ts:4719-4726`) that a page never shows a look whose holes did not move.

**(a) Synchronized short tween.** Give the `MIXER FILL` a duration and tell the page to animate its
own chrome over the SAME duration, so both move together instead of cutting `k` frames apart.
The facts are already measured in `design.md` §9.2/§9.6f:

- `MIXER <ch>-<layer> FILL x y sx sy <frames> <tween>` is **accepted on 2.5.0**, 20 Penner easings.
- **`ease`, `ease-in-out` and `cubic-bezier` are rejected `403`.** The CasparCG and CSS vocabularies
  share no name, and **`linear` is the only exactly-matchable pair (0.0 px** vs CSS `linear`;
  `ease-in-out` diverges 232.8 px, `ease` 580.6 px).
- **Interpolating three plate holes costs ≈ 4 % of the frame budget** (§9.6f). ⚠ For contrast and
  as a warning about scope: **crossfading two full-frame backdrops cost −10 % with a 120 ms worst
  gap — the background transition is the expensive half**, so "animate the chrome" must be scoped
  to the strokes and boxes, not turned into a backdrop crossfade.
- **Cost: the switch stops being a cut.** That is an editorial change to what the switch IS, and
  the owner has to want it. It also makes the two sides' clocks a real contract — `design.md:276`
  already warns about _"two independent timelines, no shared origin, no shared clock"_.
- **_"Page last, only on success"_: KEPT, unchanged.** The order does not move; both commands
  simply carry a duration. The page is still told after the fills, still only on success, and a
  refused reconcile still leaves the old look intact.

**(b) Page pre-arm, then reveal.** The page renders the target look's chrome hidden and reveals it
on the switch, so the render cost is paid before the switch rather than inside it.

- Keeps the cut, which is its main attraction.
- **Cost:** an extra round trip before every switch, and a NEW FAILURE MODE — a page that has been
  pre-armed but not revealed, or revealed for a switch that then failed.
- 🔴 **_"Page last, only on success"_: AT RISK, and this is the option's central question.** The
  arm message reaches the page BEFORE the fills move, which is precisely what the current design
  forbids. It survives only if the ARM is provably invisible — rendering hidden chrome must change
  no pixel — and the REVEAL stays after the reconcile and only on success. **If the arm can be seen
  at all, this option forfeits the guarantee** and must be marked as such rather than argued around.
  Note also that pre-arming re-introduces the state `tasks.md` 7.9 removed: a page holding a look
  it has not entered.

**(c) Suppress the chrome during the transition.** Hide background and strokes for the `k` frames,
so nothing wrong is drawn — only nothing at all.

- **Cheapest and ugliest, and it should be recorded as ugly.** It replaces briefly-wrong decoration
  with a brief hole in the design, which on a full-frame background may read as a flash. It also
  still needs `k`, to know how long to suppress — so it does not escape the measurement.
- **_"Page last, only on success"_: KEPT** if the suppression is driven by the same page update
  that switches the look, i.e. the page suppresses on entry and restores when it has painted.
  **FORFEITED** if the suppression is sent as a separate earlier command, which makes it (b) with
  worse aesthetics.

**(d) Accept it,** with the reason written down. Defensible if `k` measures at 1–2 frames: the
current design buys **_"a refused switch leaves the old look intact"_** with this window, the cut
is otherwise ~0.20 frames (§9.3/§9.4), and no option above is free. **_"Page last, only on
success"_: KEPT trivially.** If this is chosen, the reason belongs in this item so the next person
to see it on air does not re-file it.

### ⚠ §3b (`MIXER … DEFER` + `COMMIT`) is NOT the cure — stated so the next reader does not assume it is

`design.md` §3b's `MIXER … DEFER` + a channel-scoped `COMMIT` is still open and still **banned**
(`design.md:560` — `COMMIT` is CHANNEL-scoped, so on this shared plant it could apply another
controller's deferred changes; recorded as _"a refusal to measure, not an absence of data"_).

**Even fully available it would not fix this.** It makes several **MIXER** changes land on ONE
frame — it is about the plates agreeing with EACH OTHER. **It does nothing whatsoever about the
PAGE**, which is not a MIXER client at all. The residual it addresses is already measured as
invisible: `design.md:556` — _"`DEFER`/`COMMIT` being unusable costs nothing visible"_, worst case
one frame of partially-applied geometry at ≈20 % probability.

**Would it help option (a)?** Marginally and only there: if a tween is adopted, `DEFER`/`COMMIT`
would make all N plates START their tween on the same frame instead of within the 0.20-frame span.
That is a second-order tidy-up of an already-invisible span, not a reason to lift the ban.

- **Cross-refs:** [[B-155]] (the switch flash — the WRONG-SOURCE item; this one is cosmetic and
  does not touch its rule), `openspec/changes/multibox-layout-switch/tasks.md` 7.14/7.15 (where
  this is cross-referenced), `design.md` §9.2/§9.3/§9.6f (the measured tween and cut numbers),
  `design.md` §3b (the DEFER/COMMIT ban), [[B-154]] (the other "a switch reported success and the
  picture disagreed" item, fixed).

## [ ] B-159 — a media file missing on the BACKUP costs that server the whole look, and NOTHING tells anyone: the backup's divergence is emitted into a void ⟨priority: high — a backup that silently differs from the main is not a backup⟩ — OPEN. Mechanism established from the code, and §1's shape did NOT survive contact with it — read "What the code actually does" before designing anything

**Observed 2026-08-22, by the owner.** With a backup server configured, a media item exists on
server **A** and not on server **B**. Switching to the look that uses it: **A switches, B does
not** — B stays on the PREVIOUS look. The two servers then differ in **LAYOUT**, not merely in one
box's content.

### 🔴 2026-08-24 — THE SYMPTOM ABOVE FAILED TO REPRODUCE ON THE PLANT. RE-SCOPE THIS BEFORE IMPLEMENTING ANYTHING.

On the owner's first real TWO-SERVER plant run (2026-08-24, after [[B-162]] landed), **B's template
switches with the look.** The reported symptom — _"A switches, B does not"_ — did not happen.

⚠ **Read what that does and does not mean, because both halves matter:**

- **What it suggests.** [[B-162]] (the backup was never served the template at all, because template
  hosting was derived from the PRIMARY alone) very likely accounts for **all** of the 2026-08-22
  sighting. A backup with no page cannot switch a look, and that is indistinguishable at the SDI
  seam from the per-input-failure-becomes-per-look-failure mechanism this item was written around.
- **What it does NOT mean.** This item is **NOT disproven and is NOT closed.** The specific
  condition — a media file present on A and absent on B — was **not re-created** in the 2026-08-24
  run, so the mechanism §"What the code actually does" describes has been neither confirmed nor
  ruled out. **Nobody may close this on the strength of a non-reproduction of an untested
  condition.**
- 🔴 **What the next session owes, before writing any code:** re-run the ORIGINAL condition — a
  media input that resolves on A and fails on B — on the post-B-162 tree, and report what each
  server does. If the layouts still diverge, this item stands as written. If they do not, its §1
  shape needs rewriting around whatever remains, and THE RULE below (which is a decided rule about
  what the product should do, not a claim about what it does) survives either way.

**Status note:** the ⟨priority: high⟩ and the OPEN state are deliberately unchanged — the rule this
item records is still the rule, and re-scoping is a design act, not a triage one.

### 🔴 THE RULE, recorded as DECIDED — not as a proposal

**A per-INPUT failure must never become a per-LOOK failure, and must never become a per-SERVER
divergence.** The switch happens on **every** server, the box COUNT and geometry are identical
everywhere, and **only the hole whose input failed is BLACK.**

Three things follow, and the third is the one that gets forgotten:

1. **Black, not the previous content.** Inherited unchanged from [[B-155]]: _the new look's hole
   must NEVER show the previous source; if the incoming producer is not ready, BLACK is acceptable
   and the previous guest is not._ This item does not touch that rule; it extends its reach to the
   backup.
2. **Divergence is the WORST of the three outcomes** — worse than a black box, worse than a refused
   switch. A backup whose layout differs from the main **is not a backup**. The failure stays
   invisible until someone cuts to it, which is the moment they least want to discover it, and a
   confidently-wrong surface is this product's worst defect class.
3. ⚠ **This does NOT overturn _"only on success"_, and here is how the two coexist.**
   That rule is about **ordering within one server**: a page must never END on a look whose holes
   did not move. (Its _"page last"_ half was reversed on 2026-08-31 by [[B-174]] — the page is now
   told FIRST and the mixer held one channel frame, and a refused switch is answered by re-telling
   the previous look. The guarantee survives the reversal; only the route to it changed.) This item
   is about **which servers the decision applies to**. They meet cleanly because they answer
   different questions:
   - _"Did the LAYOUT apply?"_ decides whether the page is told — **and it must be decided the
     same way on every server**, so a switch is refused everywhere or applied everywhere.
   - _"Did this one INPUT arrive?"_ must NOT feed that decision at all. A missing producer in one
     hole does not mean the holes failed to move; it means one hole is empty.

   So _"only on success"_ keeps its meaning, with **success redefined as structural**: the fills
   moved. That is exactly the STRUCTURAL-vs-CONTENT split below, and it is why the two rules do not
   collide — today the code does not make that distinction anywhere, which is the defect.

### 🔴 WHAT THE CODE ACTUALLY DOES — §1's shape did not survive, and this is the headline

Answering the six mechanism questions with anchors. **Default strategy is `mirror-sync`**
(`tools/caspar-bridge/src/bridge.ts:342`).

**1. Which layer refuses? NONE OF THEM — nothing refuses.** In `mirror-sync`
(`packages/caspar-client/src/redundancy/redundancy-adapter.ts:244`) both sessions are enqueued
under one `Promise.allSettled`. A missing media file makes B's `PLAY` answer a non-`2xx`, and
**`enqueue` RESOLVES on a non-`2xx`** — it rejects only on timeout / abort / disconnect
(`packages/caspar-client/src/queue/command-queue.ts:138-139`). So `bRes.status === 'fulfilled'`
with `code = 404`, the **first** branch is taken (`redundancy-adapter.ts:254`), and it:

- journals the send as `'ok'` **with the PRIMARY's code** (`:255`),
- calls `reportDivergence(seq, primaryCode, backupCode)` (`:257`),
- and **returns `{ ...pRes.value, winner: this.primary }`** (`:260`) — the primary's result.

**2. What the failure actually is:** a `PLAY` returning a non-`2xx` from B. Not a preflight (there
is none — see [[B-160]]), not a timeout (a timeout would REJECT and take a different branch).

**3. What the ledger records for B: NOTHING, because the ledger has no server dimension at all.**
`registerLiveLayers` / `live-layers-store.ts` carry no server label — the store is **server-blind**
by construction. It records what the BRIDGE believes is seated, which is the primary's truth
written once and assumed true of both. **B is not marked degraded anywhere**, because there is no
per-server place to mark.

**4. What the operator sees today: nothing about this.** `#send`
(`tools/caspar-bridge/src/caspar-runtime.ts`, the `#adapter.send` wrapper) computes
`const ok = result.response.kind !== 'err'` — and `result` is the adapter's return, i.e. **the
PRIMARY's response**. **The backup's `404` is therefore structurally invisible to the bridge**:
`ok` is `true`, `applyAck` records success, the reconcile continues, and the operator gets a
successful switch. The connection-health surface reports whether B is REACHABLE; it has no notion
of whether B is CORRECT.

**5. Does `journal-replay` retry forever, and what does it cost?** The relevant loop is not
`journal-replay` but the **corrective resend**
(`redundancy-adapter.ts` `triggerCorrectiveResend`), fired from `reportDivergence` once the
divergence budget trips (3 in 30 s). It replays **every `'ok'` journal entry** to B, `await`ed
one at a time, each failure swallowed by a bare `catch {}`.

⚠ **CORRECTED 2026-08-24 (session MIRROR-SILENT-01) — the self-refilling loop this paragraph
described does NOT exist, and it was asserted here as established fact.** The original read: _"the
replayed `PLAY` 404s again, which is a fresh divergence, which refills the budget, which fires
another full replay."_ It does not. The resend calls `queue.enqueue` **directly**
(`redundancy-adapter.ts:427`), bypassing `send()`, and `reportDivergence` is reached ONLY from
`sendMirrorSync` (`:257`, `:267`) and `sendMirrorAsync` (`:294`, `:298`). A replayed `PLAY` that
404s therefore RESOLVES (`enqueue` resolves on a non-`2xx`), is compared against nothing, emits no
`mirror-divergence`, and never touches `divergenceTimestamps`. **The replay cannot re-arm itself.**

What is true, and is all that is true: **retry cannot create a missing file**, so the resend can
never repair this cause; and every fresh burst of REAL traffic that diverges re-fires a full
ok-journal replay to B, re-`PLAY`ing producers that were already correct there. The journal is
bounded (500 entries / 5 min, the B-044 fix recorded above in this file) and so is each burst — the
re-firing is driven by new sends, not by the replay. **The churn is real; the runaway is not.**

**6. 🔴 DOES ANYTHING DETECT THAT THE TWO SERVERS ARE IN DIFFERENT STATES TODAY?**
**Detected — yes, at the adapter. Surfaced — NO, to nobody.** `reportDivergence`
(`redundancy-adapter.ts`) emits `mirror-divergence`, and every 3rd in 30 s emits
`split-brain-persistent`. **Nothing on the PRODUCTION path subscribes.** `CasparRuntime` wires
exactly two adapter events — `#adapter.on('health', …)`
(`tools/caspar-bridge/src/caspar-runtime.ts:1332`) and `#adapter.on('failover-complete', …)`
(`:1333`). There is no third, and neither app subscribes either, because the browser only ever sees
what the bridge publishes. (Instrument checked: the same sweep for the sibling concept `failover`
finds it wired through `intent.ts`, `audit.ts`, `tally.ts` and `caspar-runtime.ts:7104`, so the
grep is live and the absence is real.)

⚠ **CORRECTED 2026-08-24 (session MIRROR-SILENT-01).** This paragraph used to claim that a repo-wide
sweep found NO listener in the `tools` or `apps` trees, every other hit being a doc, a living spec,
an archived change or a test. **That is false.** `tools/soak-runner/src/harness.ts` holds three real
subscriptions (`:241`, `:244`, `:247`) that count these events into the soak report (`B-046`) — it
is under `tools`, it is `src`, and it is not a test. The FINDING survives, because a soak harness
driving mock servers is a measurement instrument rather than an operator surface and is not running
when the plant is on air; the EVIDENCE as recorded did not. The silence is filed as [[B-165]], which
owns it for every cause rather than for this one.

⚠ **So §1's shape is NOT what this path produces, and the difference matters for the fix.** Under
`mirror-sync` B receives **every** `MIXER FILL`/`CLIP` and the `CG UPDATE` — they are separate
commands and they do not fail just because a `PLAY` did. **B's page should switch.** What the code
predicts is a **per-PLATE** failure on B, not a per-look one: the layer whose `PLAY` 404'd gets no
new producer.

🔴 **And the predicted per-plate outcome is WORSE than the reported one, which is why this item is
`high`.** If that `PLAY` was aimed at an **occupied** layer, the PREVIOUS producer is still seated
— so the backup shows **the previous guest in the new look's hole**, which is precisely the outcome
[[B-155]]'s rule exists to forbid, on the server nobody is looking at, reported to nobody. Whether
a 404'd `PLAY` leaves the old producer or clears the layer is a **CasparCG behaviour this repo
cannot answer** (see the mock note below).

**Two readings of the discrepancy, both recorded, neither chosen:** either the owner saw one box on
B still showing old content and read it as "B did not switch" — the layouts differing in one hole
rather than wholly — or there is a second path not exercised here. **This must be settled before
anything is implemented**, and settling it needs a second real server; see the shape below.

### 🔴 THE DISTINCTION THE WHOLE IMPLEMENTATION TURNS ON

| failure kind   | meaning                                         | required behaviour                                                          |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| **STRUCTURAL** | the LAYOUT itself cannot be applied             | **REFUSE** — keep the previous look, on **every** server, page not told     |
| **CONTENT**    | one INPUT failed; the layout is fine without it | **APPLY** the layout **everywhere**, **BLACK** that hole, and **REPORT** it |

**Where the distinction would have to be made: it does not exist today, at either of the two
places it could live.**

- At the adapter (`redundancy-adapter.ts:254-261`), which today collapses a two-server outcome to
  the primary's response before the bridge sees it. Any per-server decision needs the backup's code
  to survive that collapse — the return would have to carry both outcomes, not one.
- At the reconcile (`caspar-runtime.ts:4702` `reconcileLivePlates`, whose result gates
  `#tellPageLook` at `:4744`), which today asks one question — _"did the send come back ok?"_ —
  and would have to ask two: _"did the LAYOUT apply?"_ (gates the page, must agree across servers)
  and _"did this INPUT arrive?"_ (blacks one hole, never gates the page).

`#send`'s `ok = result.response.kind !== 'err'` is the exact line where a per-input failure and a
per-layout failure become the same boolean. **Golden rule 7's shape, one level up:** one boolean is
being asked to carry two different questions about two different machines.

### 🔴 THE SURFACE — an operator must see B is degraded WITHOUT cutting to it

**A silent black box on the backup is the same defect wearing a different mask.** If the fix blacks
the hole and says nothing, the failure is still invisible until the cut — it has only moved from
"wrong layout, silent" to "right layout, wrong content, silent".

What must be visible, and it is three facts, not one: **WHICH SERVER · WHICH PLATE · WHY.** "B is
degraded" is not enough to act on; "B: plate 3 (`live-2`), media `intro.mp4` not found (404)" is.

Where it lives — recorded as the shape, not as a decision:

- The **Runtime's per-plate row** already names each plate and already carries per-plate state
  (`apps/runtime/src/renderer/features/inspector/livePlates.ts` — whose own comment at `:120` is
  about exactly this class: _"a divergence the operator needs told about"_). A per-server degraded
  marker belongs beside the plate it concerns, because that is where the operator is already
  looking when they think about that box.
- The **connection-health surface** is the wrong home alone: it answers "is B reachable", and B is
  perfectly reachable here. A green health light beside a diverged backup is worse than no light.
- **The `mirror-divergence` / `split-brain-persistent` events already exist and already carry the
  seq and both codes.** The missing half is entirely on the consuming side — nothing listens. That
  is the cheapest true statement in this item: **the detector is built; the wire to the operator
  is not.**

### The state question

**No — the model carries no per-plate, per-server degraded state today.** The ledger is
server-blind (see mechanism 3), and `ConnectionHealth` is per-server but not per-plate. What would
have to be added is a per-(server, plate) state carrying at least: the server label, the plate /
source id, the AMCP code, and when it was last observed.

🔴 **What it must NOT be: `#multiBoxCount` must never become a layer-demand or a health proxy.**
`caspar-runtime.ts:3705` returns `template.liveSources?.sources.length` for a `declared` carrier —
it counts **DECLARATIONS**, and its own header says so: _"…on the channel, which is its
declaration, and a look switch must never change the answer."_ A degraded plate is still a declared
plate. Feeding health into that count would make the declaration move when a file goes missing,
which is the one thing it is documented never to do.

### One alternative, RECORDED and NOT chosen

**A station slate instead of pure black** for the failed hole — a caption, a logo, a "SOURCE
UNAVAILABLE" card. It has a real argument: black reads as "the graphic is broken", a slate reads as
"this one input is missing", and on a backup that someone has just cut to, the second is far more
actionable. **The owner's default is BLACK** and this item does not change it; the slate is
recorded so the choice stays his, later, on evidence.

### An implementation SHAPE — not a design

- **Which layer decides:** the RECONCILE, on a per-plate result the ADAPTER must first stop
  discarding. The adapter's job is to report both servers' outcomes; the policy (structural vs
  content) is the bridge's.
- **What state is added:** per-(server, plate) degraded, as above — additive, never folded into an
  existing count.
- **What the surface says:** server, plate, reason — beside the plate.
- **What the tests would assert, at the WIRE level:** that a non-`2xx` `PLAY` on B alone still
  produces the full `MIXER FILL`/`CLIP` set and the `CG UPDATE` on **both** servers; that the
  failed hole receives no producer and is not left holding the previous one; that the switch is
  NOT refused; and that a STRUCTURAL failure (the fills themselves refused) IS refused on both.
- 🔴 **What the mock cannot prove — say it plainly: the redundancy path is where `@cg/amcp-mock`'s
  fidelity is weakest.** It can be told to answer 404 (the archived redundancy change's soak used
  exactly that, its `diverging` backup mode), so ORDER and WIRE CONTENT are testable. What it
  cannot answer is the question this item turns on: **what a real CasparCG 2.5.0 does to an
  OCCUPIED layer when a `PLAY` fails** — leave the old producer, or clear it. The mock models
  `PLAY` on an occupied layer as an instantaneous in-place replace and has no failure semantics for
  it at all. **That needs a SECOND REAL SERVER**, deliberately missing one file, and it decides
  whether this is a cosmetic black-box item or a `B-155`-class wrong-source item on the backup.

- **Cross-refs:** [[B-155]] (the rule this inherits — black, never the previous guest),
  [[B-160]] (the companion: find it at assign/preflight, not at the take),
  `openspec/changes/multibox-layout-switch/tasks.md` 7.14c (the cross-reference),
  `openspec/specs/runtime-caspar-bridge/spec.md` (the LIVING home of the split-brain requirements —
  the only `design.md` that owns redundancy is ARCHIVED and was deliberately not edited),
  [[C-013]] (the redundancy family), [[R-048]] (the swap family).

## [ ] B-160 — nothing checks whether a media file EXISTS on each server, so a missing file is discovered at the TAKE ⟨priority: medium — prevention for [[B-159]]; the take is the worst possible moment to find out⟩ — OPEN

**The companion to [[B-159]], filed with it.** A file missing on one server should be found **when
the media is assigned, or at preflight — not at the take**, on air, with the divergence already on
the backup.

**What exists today to check a media's presence per server: NOTHING. Measured, not assumed.**
`tools/caspar-bridge/src/command-builder.ts` emits `CG ADD`, `CG INVOKE`, `CG NEXT`, `CG PLAY`,
`CG REMOVE`, `CG UPDATE`, `CLEAR`, `MIXER` and `PLAY`. **It emits no `CLS` and no `INFO`**, and a
repo-wide `git grep` for a `CLS` send finds none (control: the same sweep finds 21 hits for the
verbs that do exist, so the grep is live). There is no media catalog check per server, and no
preflight that touches the servers at all. The first thing that ever asks a server about a file is
the `PLAY` at the take.

**Roughly what a check would cost.** `CLS` returns the server's whole media library in one reply,
so the natural shape is **one `CLS` per server, cached**, not one probe per file: a set membership
test after that is free. `INFO` per file would be N round trips and is the wrong shape. The cost is
therefore one command per server per refresh, plus whatever staleness window is chosen — a
missing-file check is only as fresh as its last `CLS`, and a file deleted after the cache was
filled is still a take-time surprise. That residual is why this item is **prevention, not a
replacement for `B-159`**: `B-159` must still behave correctly when the check passes and the file
is gone anyway.

**Where it would live:** beside the media assignment in the Runtime (so the operator learns at the
moment they choose the file, which is when it is cheapest to fix) and in the existing preflight
path that already refuses an export/take for other reasons. The bridge would own the `CLS` cache,
because it is the only thing holding both server sessions.

**Acceptance:**

- WHEN a media input is assigned to a plate THEN each configured server is checked for that file
  and the operator is told, at assign time, if any server lacks it — naming the SERVER
- WHEN a take or a look switch is preflighted THEN a file missing on ANY configured server is
  reported before the take, naming the server and the plate
- WHEN only one server is declared THEN the check runs against that one server and adds no
  backup-related surface (the declared-single-server rule the `B-044` fix established)
- WHEN the check passes and the file is nonetheless missing at the take THEN [[B-159]]'s behaviour
  governs — this item never becomes the reason a take-time failure is handled badly

**Notes:** small item, no design work requested or done. The `CLS` cache's staleness policy is the
only real decision in it.

- **Cross-refs:** [[B-159]] (the defect this prevents), [[B-155]] (the black-not-previous rule both
  inherit).

## [x] B-161 — 🔴 UPDATE put VIDEO ON AIR with no template above it: a configuration verb was acting as a playout verb ⟨priority: HIGHEST — bare video on air from a button that was never supposed to reach the wire⟩ — FIXED 2026-08-23, RED-then-GREEN at the wire, with both neighbours proven

**Observed 2026-08-22, by the owner, on the plant.** He **stopped** several plates, **swapped their
inputs**, and pressed **UPDATE only — no play, no take.** The boxes went to AIR: **the videos
played, with no template above them** — no background, no strokes, none of the page's chrome.

There was no chrome because **no page had been taken.** `UPDATE` seated the producers; nothing had
ever seated a template above them.

### 🔴 THE RULE, decided

**A configuration verb is NEVER a playout verb.** `UPDATE` puts values **IN FORCE**; only a **take**
puts content **ON AIR**. A row that does not already own live layers must produce **no `PLAY`, no
un-mute and no fill on any live layer** — the binding lands in STATE, and the next take seats it.
This is the missing complement of BM's **_STAGED ≠ IN FORCE_**, and it is now `CLAUDE.md` golden
rule 10.

⚠ **Applying changed inputs to AIR on an UPDATE is the FEATURE** (BM-2 §4 step 4 — _"change solo's
input → changes quickly"_). The defect was only that it was **not conditioned on the row being on
air**. The gate is the whole fix; the feature is untouched.

### Repro / Expected / Actual

**Repro:**

1. Load a row with a multi-box template. **Do not take it.** (Or take it and take it out again —
   either way the row is not on air.)
2. Change the row's per-look source bindings.
3. Press **UPDATE**. Nothing else — no play, no take.

**Expected:** the new bindings are in force for the next take. **Nothing reaches a live layer.**

**Actual (measured at the wire, on a `loaded` row that had never been taken):**

```
PLAY 1-30 "route://2"      MIXER 1-30 VOLUME 0    MIXER 1-30 FILL 0 0 0.25 0.25    MIXER 1-30 CLIP …
PLAY 1-33 "route://5"      MIXER 1-33 VOLUME 0    MIXER 1-33 FILL 0.25 0 0.25 0.25 MIXER 1-33 CLIP …
PLAY 1-31 "route://3"      MIXER 1-31 VOLUME 0    MIXER 1-31 FILL 2 2 0.25 0.25    MIXER 1-31 CLIP …
PLAY 1-32 "route://4"      MIXER 1-32 VOLUME 0    MIXER 1-32 FILL 2 2 0.25 0.25    MIXER 1-32 CLIP …
```

Four producers created, sized into the look's geometry, and written into the ledger
(`seats: [30, 31, 32, 33]`). Pictures on air, no page.

**Env:** reproduced against `@cg/amcp-mock` at the wire level — this one needs no plant, which is
why it could be fixed the same day.

🔴 **THE AUDIO HALF, asked explicitly and MEASURED rather than assumed: it did NOT un-mute.** All
four seats carried `MIXER … VOLUME 0`, because a plate with no recorded intent is born muted
(`intendedVolume: intent[plateId] ?? CREATED_MUTED_VOLUME`, `caspar-runtime.ts:5088`). So this
reproduction put **silent** video on air. ⚠ **But that is a property of the fixture, not of the
defect:** the seat is written at `record.intendedVolume`
(`caspar-runtime.ts:5128-5131`), so **any plate the operator had deliberately raised in an earlier
show would have been seated AUDIBLE** by the same press. Bare video was the observed harm; bare
video with sound was one raised fader away.

### The mechanism, with anchors

| step                               | anchor                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| the verb                           | `tools/caspar-bridge/src/caspar-runtime.ts:2979` `update()` → `:3010` `#updateImpl`                  |
| the binding half                   | `:3043` → `#applyBindingTransaction` at `:4298`, under the `B-155` seat lock                         |
| **the call that reached the wire** | `:4313` — `reconcileLivePlates(itemId, { mode: 'live' })`, issued **unconditionally**                |
| what it emits per seat             | `PLAY` → `MIXER VOLUME` → `MIXER FILL`+`CLIP` (`:4935` `#applyLivePlates`, contract at `:4924-4938`) |

**Where the row's playout state was consulted on this path: NOWHERE.** The call site's own comment
said _"The row **may be** ON AIR"_ — it allowed for either and reconciled regardless.

🔴 **A canonical predicate DID already exist, and this path simply never asked it.**
`isOnAirStatus` (`caspar-runtime.ts:450`) is documented as _"THE on-air predicate for a stack item —
the ONE definition"_, and its header explicitly invokes golden rule 6: _"a fourth inline copy of
this status list is exactly how one of them comes to disagree."_ It had five consumers —
`:2778`, `:2946`, `:3666`, `:4676` (`setActiveLook`, which **does** ask), `:7052`. **`#applyBindingTransaction`
was not among them.** So the finding is not a missing predicate; it is **one path that did not
consult the predicate the rest of the file already shares**.

**Is this the same shape as `B-154`?** Related but not the same, and the `B-154` fix could not have
covered it. `B-154` was a HELD plate still rendering — a plate that should have been torn down
inside a switch on a row that WAS on air. Its fix corrected what the switch does to plates. This one
is a row that was never on air at all, reached by a different verb: **no amount of correctness
inside the seating plan helps when the question "should we be seating anything?" is never asked.**

### The fix

**One gate, at the one path the verbs share** — not two paths made to agree, which is this
project's recurring defect.

`#applyBindingTransaction` (`caspar-runtime.ts:4298`) now applies the binding maps, and then, if the
row owns no live seats, **publishes the state and returns** before `reconcileLivePlates` is reached.
The new predicate is `#ownsLiveSeats(itemId)`, placed immediately above it:

- **on air** — `isOnAirStatus`, **reused, never re-derived** (golden rule 6);
- **or rehearsing** — `#rehearsing.has(itemId)`, because a rehearsing row is deliberately NOT on air
  (`enterRehearse` refuses an on-air row, so the two states are disjoint by construction) yet owns
  its plates on **PVW**. 🔴 **A gate built on `isOnAirStatus` alone would have silently broken
  rehearse without failing any test that existed before this item.**

⚠ **The gate is at the ROW, never at the look or the visible hole.** On a live row it returns early
for nothing and the reconcile runs exactly as before — **UNION pre-seat intact**, every look's
inputs still seated including the looks not punched. That pre-seating is what makes a switch pure
`MIXER FILL`; narrowing it would push a `PLAY` back inside a switch and reintroduce `B-155` case 3,
which session BT closed on `4777b724`.

### Regression tests — RED-then-GREEN at the wire, plus both neighbours

All four in `tools/caspar-bridge/tests/live-look-reconcile.integration.test.ts`:

| test                       | asserts                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **the defect**             | an off-air row's UPDATE puts **no `PLAY`, no `VOLUME`, no `FILL`/`CLIP`** on the wire and claims **no seats** |
| **the state half**         | the next TAKE comes up with the off-air UPDATE's binding **in force** (`route://5` seated)                    |
| **neighbour 1 (LIVE)**     | an on-air row **still re-points**, and the **UNION pre-seat never narrows** (asserted as a superset)          |
| **neighbour 2 (REHEARSE)** | a rehearsing row **still seats** — the test that would have caught an `isOnAirStatus`-only gate               |

**RED before the gate:** the defect test failed with the four `PLAY`s, four `VOLUME`s and eight
`FILL`/`CLIP`s quoted above; the other three already passed. **GREEN after:** all four.
**Whole suite: 612 passed / 78 files, no regressions.** The chain was rebuilt before both readings
(a stale `dist` has faked red and green in this repo before).

The defect test asserts all four facts in **one** object comparison rather than four `expect`s,
deliberately: separate assertions stop at the first, which would have hidden whether the audio and
geometry halves also fired — and the audio question could not have been answered at all.

### §B.5 — can the operator get them off air? YES, and that is a real answer, not an assumption

The producers were **written into the ledger** (`seats: [30,31,32,33]`, measured), so the bridge
**owns** them and knows their coordinates. They are **not orphans** in the R-009 sense — the orphan
sweep is for layers the bridge does not own. Therefore both ordinary escapes reach them:

- **OUT on the row** — `#outImpl` is not gated on `isOnAirStatus` (it refuses only `unknown-item`
  and `disconnected`) and its teardown clears the plates before the frame;
- **CLEAR ALL** — the bigger hammer, ledger-driven.

**No second defect, and nothing urgent is owed here.** Had the seats gone unrecorded this would have
been a second, worse item; they did not.

### What is owed on the plant

**The fix needs no plant reading to be correct** — it is asserted at the wire and the mock is
faithful for it. What the owner should do to SEE it fixed is in the item's Repro: **stop the plates,
swap the inputs, press UPDATE, and nothing must appear on air.** Then take the row and confirm the
new inputs are the ones that come up — that second half is the one that proves the edit was not
merely discarded.

- ✅ **Linux `e2e` DISCHARGED** — <https://github.com/yasermostafaee/cg/actions/runs/32633887346>
  — head `6f6eb690` (the tip carrying the gate, its four tests and this record), `completed` +
  `success`, with the **`E2E (Playwright)` job RUN, not skipped**. Classifier scored the diff
  `kind=code needsE2e=true`. The local Windows run is not what discharges it.
- **Cross-refs:** [[B-155]] (case 3 — the union pre-seat this gate must not narrow), [[B-154]] (the
  related-but-different held-plate shape), `CLAUDE.md` golden rule 10 (the invariant),
  `openspec/changes/multibox-layout-switch/tasks.md` 7.14d.

## [x] B-162 — 🔴 the BACKUP server got no template, because template hosting was derived from the PRIMARY alone ⟨priority: high — a backup showing live sources with no graphic over them, reported as success by every surface⟩ — FIXED 2026-08-23

**What:** `deriveServeOptions` decided BOTH the template HTTP server's bind interface and the host
it advertises in the `CG ADD` URL from **one** CasparCG host, and both call sites passed
`servers.A.host`. `servers.B.host` was read **nowhere** in that decision. One URL is handed to every
server, so the backup had no dimension in a decision that concerns it.

**The owner's reproduction (2026-08-23), two CasparCG installs — his own machine and a server at
`192.168.21.50`:**

| primary (A)  | backup (B)   | result                                                                                               |
| ------------ | ------------ | ---------------------------------------------------------------------------------------------------- |
| server `.50` | own machine  | both fine                                                                                            |
| own machine  | server `.50` | own machine fine; **on the server the BOXES appear, the TEMPLATE does not** — no background, no text |

**Why the table reads that way — TWO STACKED FAILURES, either one fatal:**

1. **The socket was unreachable.** A loopback primary made `bindHost` `127.0.0.1`, so the template
   HTTP server was not on the LAN at all.
2. **The URL pointed at the wrong machine.** `serveHost` was `127.0.0.1` too, so the remote backup
   fetched **ITSELF** — its own CasparCG box, where nothing serves `/template/<id>`.

The reverse row worked for the same reason inverted: a remote PRIMARY sent the derivation down the
routable branch, and a LAN address is reachable from the bridge's own machine as well as from the
plant — so the loopback backup was served correctly by accident.

⚠ **Why the BOXES survived and only the TEMPLATE died.** Live plates never touch this server:
`producerArgument` (`command-builder.ts`) emits `route://`, `DECKLINK DEVICE`, `NDI NAME`, a media
path or a stream URL — every one of them resolved by CasparCG from its OWN resources. The template
is the only asset fetched over HTTP from the bridge, so it is the only thing an unreachable serve
address can cost. The symptom is therefore maximally confusing: the row looks half-alive.

🔴 **AND IT PRODUCED NO ERROR ANYWHERE — this is the half that matters.** `CG ADD` returns **200**:
CasparCG accepted the command, and the PAGE's later fetch failing is not an AMCP outcome. So a
perfectly-journaled backup reports success, health stays green, the audit log records a completed
load, and the only evidence is a human looking at that server's output. [[B-159]]/[[B-160]] are the
same family — the backup silently differing from the main — but **neither covers this**: they are
about a media file missing on one server, discovered through the AMCP result. This arrives through a
door **AMCP cannot see**, which is why nothing in that pair would have caught it.

### The fix

- **`deriveServeOptions(casparHosts: readonly string[], override?)`** — the argument is a LIST, and
  the signature change is deliberate: it makes the old mistake unspellable. **If ANY configured
  server is non-loopback the bind is routable and the advertised host is one that server can
  reach**; only an all-loopback configuration stays on `127.0.0.1`. The rule is written at the
  function: **one string goes to every server, so it must satisfy the STRICTEST reader — the remote
  one.**
- **`configuredCasparHosts(config)`** (`caspar-runtime.ts`) is the one place the set is assembled,
  and BOTH call sites feed from it — the constructor (`:1162`) and the `setConfig` apply
  (`:7339`). The apply path was the door nobody was watching: a bridge booted all-loopback and then
  given a remote backup through the settings dialog reaches the broken state with no restart.
  ⚠ OSC never had this defect because each session binds its own ingest (`deriveOscBindHost(ep.host)`,
  one derivation PER server). The template server is a single shared socket handing out a single
  shared URL, so it had no per-server seam — `configuredCasparHosts` is that seam.
- **An explicitly configured serve host is now the ANSWER, not a better guess** —
  `--template-serve-host` (and `--template-serve-port`) wire the long-existing
  `TemplateServeOverride` to the CLI. Before this the ONLY way to change the advertised host was to
  edit the source, which is why [[C-024]]'s uncommitted hack existed. The boot line now names the
  host AND where it came from, per the provenance rule the fixed bank and source catalog follow.
- **The CORRECTNESS warning** — `hostsUnableToFetchTemplates(hosts, options)`, ONE predicate used by
  every surface. The pre-existing warning was the SECURITY direction ("this is LAN-EXPOSED, did you
  mean that?"); its complement was silent. Now a loopback bind **or** a loopback advertised host
  while a remote server is configured names that server at boot (stderr + the boot line) and on
  every apply (the `connections.set-config` response carries `templateServe.unreachable`).
- **The operator surface** — the settings dialog previously printed _"Applied. All listeners remain
  loopback-only."_ on exactly the configuration that had just cost the backup its template. It now
  reads the bridge's verdict FIRST and, when non-empty, replaces that reassurance with a refusal-role
  message naming the servers, what they will show, and the flag that fixes it. **The verdict is the
  bridge's, never re-derived in the panel** (golden rule 6).

### Tests — RED first, chain rebuilt before each reading

- `tests/template-http-server.test.ts` — loopback A + remote B ⇒ routable bind, advertised host
  equal to the remote-primary answer; remote A + loopback B unchanged; all-loopback still fully
  loopback; the empty set; and five cases pinning `hostsUnableToFetchTemplates`, including each half
  (loopback bind with routable host, routable bind with loopback host) on its own.
- `tests/reconfigure.integration.test.ts` — the apply path re-derives over the whole set, the
  working combination does not regress, an all-loopback PAIR stays loopback, and the unreachable
  verdict fires at boot AND on apply while staying silent for all-loopback.
- `apps/runtime/tests/serverSettingsPanel.dom.test.ts` — the false reassurance is GONE, not merely
  accompanied.

⚠ **The assertions are deliberately environment-independent.** `guessLanHost()` enumerates real
interfaces, so its VALUE differs between the owner's machine, a CI container and a network-less
sandbox; asserting "not loopback" would be asserting a property of the test host. What is invariant
is that **which** server is remote cannot matter, and that the bind is routable. The advertised-host
half is pinned with an explicit override instead.

**RED measured:** with the pre-fix decision restored (primary only, same signature) the unit case
failed `expected '127.0.0.1' to be '0.0.0.0'` and the apply case failed `expected false to be true`;
23 other tests passed. **GREEN after the revert: 25/25.**

**Notes:**

- **What the owner can do to see it fixed:** configure his own machine as primary and `192.168.21.50`
  as backup, press Apply, and take a row — the template must now appear on the server. If it does
  not, the dialog will say which server cannot reach the bridge and he sets
  `--template-serve-host <the address that server can reach>` rather than editing source.
- 🔴 **The warning is about the CONFIGURATION and is NOT evidence that any page loaded.** Positive
  verification is [[B-163]], filed rather than implied.
- **`deriveServeOptions`' signature changed** — it is exported from `@cg/caspar-bridge`'s index.
  Every in-repo caller was updated; an out-of-repo embedder passing a bare string would now be a
  type error, which is the intended loud failure.
- ✅ **Linux `e2e` DISCHARGED** — <https://github.com/yasermostafaee/cg/actions/runs/32658676558> —
  head `7a8eda09` (the tip carrying this fix, its mock correction and [[B-164]]), `completed` +
  `success`, with the **`E2E (Playwright)` job RUN, not skipped** (`Lint • Typecheck • Test • Build`
  ran and passed too). Both heavy jobs are whole-tree, so that run verifies every commit in the
  span. The local Windows `gate:e2e` was green first and is NOT what discharges it.
- **Cross-refs:** [[B-159]]/[[B-160]] (same family — a backup silently wrong — but reached through
  AMCP, which this is not), [[C-024]] (the advertise-host-from-configuration item this discharges
  the CLI half of), [[B-038]] (the template HTTP server), [[B-163]] (positive verification).

## [ ] B-163 — nothing positively confirms a CasparCG server actually FETCHED the template ⟨priority: medium — prevention for [[B-162]]; a configuration warning is not a measurement⟩ — OPEN

**What:** the bridge should be able to say _"server B fetched `/template/<id>` at 12:04:07"_ rather
than only _"server B is configured remote and my serve address is loopback, which looks wrong"_.

**Why:** [[B-162]] added a warning about the CONFIGURATION. That warning fires on the shape it can
see and is silent on every other way the fetch can fail — a firewall on the CasparCG box, a subnet
with no route back, a VPN adapter chosen by `guessLanHost()`, an operator's `--template-serve-host`
typo that happens to be a routable address belonging to something else. In all of those the bridge
advertises a perfectly plausible URL and the server still gets nothing, with `CG ADD` returning 200.
**A configuration check cannot become a measurement by being made stricter.**

**What was considered, and why it is not being done inside [[B-162]]:**

- ❌ **The bridge fetching the URL itself** proves only that the BRIDGE can reach it — the axis that
  was never in doubt. Reading one channel's success as another's is the [[B-101]] mistake.
- ⚠ **Attributing the incoming `GET` by source address** is genuinely implementable and is the
  strongest candidate — the bridge's own HTTP server already SEES each fetch, so no page change is
  needed for the positive half. Its problems are all in the negative half and in the matching:
  CEF **caches**, so a second `CG ADD` of the same template may legitimately never re-fetch; the
  source address is the server's address as the bridge sees it, which NAT, multiple interfaces or a
  hostname-vs-IP config makes a heuristic match rather than an identity; and "no GET within N ms" is
  exactly the silence-as-evidence reading that cost this project [[B-101]].
- ⚠ **A beacon in the served page** (the page `POST`s back on load) is stronger still — it reports
  that the page RAN, not merely that bytes were fetched — but it changes what is served, so it needs
  a decision about templates that must stay byte-identical to what the Designer exported.

**Acceptance (sketch — refine when scheduled):**

- WHEN a template is loaded on a server THEN the bridge records whether that server fetched it, with
  a timestamp, per server
- WHEN a server has never fetched a template the bridge served it THEN that is surfaced as a
  distinct state from "not configured" and from "configuration looks wrong" — three states, never
  two
- WHEN the fetch cannot be attributed to a specific server THEN it is reported as unattributed
  rather than assigned to a guess, and silence is NEVER reported as failure without a positive
  control that the instrument is live

**Notes:**

- **Number verified free** immediately before filing: the registry's duplicate audit printed exactly
  `B-056` and `B-080`, the highest `B-` heading was `B-161`, and `git grep "B-163"` returned no hits
  anywhere in the tree.
- **Cross-refs:** [[B-162]] (the defect this is prevention for), [[B-101]] (probe the axis you
  intend to judge — the rule that shapes every option above), [[B-160]] (the same
  defect-then-prevention split, for media files).

## [x] B-164 — the row's audio chip counted the wrong things TWICE: seats for a denominator and intent for a numerator ⟨priority: medium — a console stating who can be heard, wrongly, about a property the operator cannot see⟩ — FIXED 2026-08-23

**What:** the layer row's `audio N/M` chip derived its own answer to "has this plate got sound"
instead of asking the one the strips and the audio dialog ask. Both numbers were on the wrong axis.

**The owner's measurement — ONE row, ONE template declaring three plates, three looks:**

| look   | boxes on screen | the chip read |
| ------ | --------------- | ------------- |
| ghab-1 | 1               | `audio 1/2`   |
| ghab-2 | 2               | `audio 1/3`   |
| ghab-3 | 3               | `audio 1/3`   |

He also reported it is hard to see at all.

**Why — TWO DEFINITIONS OF "HAS SOUND" ON ONE SCREEN:**

- The strips and the dialog read `plateAudioPill(volume, held)`, which honours §12.4's HOLD.
- `audioSummary` counted `plateIntent > 0` across every SEATED plate id, which honours neither.

Both consequences follow from that one split:

1. **The DENOMINATOR counted SEATS, not what the ACTIVE LOOK SHOWS.** The bridge pre-seats the
   UNION of every look, so a held plate is seated, invisible, and still inflated the total —
   exactly `1 box → /2` and `2 boxes → /3`.
2. **The NUMERATOR counted INTENT, not audibility.** A held plate armed at 100% — which the audio
   dialog EXISTS to permit, so an operator can arm a box BEFORE switching to its look — read as
   raised while it was silent on air. Measured in the RED run: `audio 2/2` with one plate making
   sound. **This half is worse than the wrong denominator and the owner had not hit it yet.**

⚠ **The wrong axis is seated vs SHOWN, NOT seated vs DECLARED.** `LayerRow.tsx`'s prop already
argued why seated beats declared — a declared plate with no producer cannot be audible — and that
argument is untouched. Both numbers are still drawn from the seated set; the fraction is narrowed
to the shown part of it.

### The fix

- **`plateAudioVerdict(volume, held) → { state, audible, armed }`** in
  `apps/runtime/src/renderer/features/layers/plateAudio.ts` — the ONE answer, and now the only
  place the three facts are derived. `plateAudioPill` reads it (its `armed` was an inline local
  before, reachable by nothing else, which is half of why the summary grew its own rule) and so
  does `audioSummary`. **`audible` and `armed` are different questions and a held plate is where
  they part**; folding them is the defect.
- **`audioSummary(plates)`** takes `RowPlateAudio[]` — plate id, volume AND `held` — instead of a
  `StackItemState` plus bare ids. The old shape could not express audibility at all, because
  `held` lives on the LEDGER and not on the item.
- **`rowPlateAudioOf(rows, itemId)`** (`liveLayerRows.ts`) builds that list off the SAME
  `LiveLayerRowView`s the LIVE SOURCES tab renders. `seatedPlatesOf` is untouched and still
  correct for SOLO and PANIC, which address a SET. A row whose `audio` is `null` — BLIND or
  STRANDED — is DROPPED: those are the branches that must not make a claim, and a chip counting
  them would state a number the surface beside it has just declined to state.
- **`plateIntent` was REMOVED**, not left unused, on this module's own `panicMap` precedent: its
  only caller was the join `audioSummary` should never have been doing.
- **Legibility (§3)** — the chip takes the state colour the pills already use: SKY when a shown
  plate is asking for sound, muted grey otherwise. The CSS's earlier all-muted argument ("a second
  coloured mark would compete with the row's STATE cell") does not survive the specific hue: the
  STATE cell owns GREEN, the sacred ON AIR mark, and sky is not a state hue on this surface —
  which is exactly why `plateAudio.ts` chose it for AUDIBLE. 🔴 **Still a PILL**: two flat states,
  no track, no fill, no bar, no ramp. `VERB_COUNT` stays 6 and no column was added.

**2c — the wording, decided:** `audio 1/2 · 1 armed`, and the armed count is emitted ONLY when
non-zero. It is **outside** the fraction because folding it in would claim sound the hold is
preventing, and dropping it would silently lose the one thing the pre-arm affordance exists to
make visible. The word is `armed` rather than a synonym on §3's own instruction — one word means
one thing here and in LIVE SOURCES, where the pill reads `ARMED · HIDDEN BY THIS LOOK` — and the
`·` separator mirrors that pill's own construction. The full sentence lives in the tooltip and the
accessible name, which is where the ambiguity a two-word chip cannot avoid is resolved.

**2d — the tooltip no longer says "raised".** It was _"N of this row's M live plates are raised"_ —
an INTENT word sitting where a reader takes it as a report about air. It now reads _"Sound is asked
for on N of the M live plates this look shows … Nothing here measures the output — this is what the
console asked for."_ Nothing in this console can know a sample reached the output: CasparCG's
programme channel reports ONE peak pair for the whole channel, so a per-input level does not exist
to be read (`add-multibox-audio` design.md §6).

### Tests — RED first, chain rebuilt before each reading

`apps/runtime/tests/layerRow.dom.test.ts`. **RED measured** with the pre-fix rule restored behind
the new signature: the owner's table failed `expected 'audio 1/3' to be 'audio 1/1'`; the
held-armed case failed `expected 'audio 2/2' to be 'audio 1/1 · 1 armed'`; the tooltip and the two
colour cases failed with it — **6 failed, 54 passed. GREEN after: 60/60.**

Covered: the owner's three-look table driven end to end; a HELD plate armed at 100% not counted
audible and reported separately; the armed clause absent at zero; an all-HELD row that still
summarises because something is waiting; a SHOWN plate whose volume assert FAILED reading silent
(the bridge leaves the intent ABSENT on `!ack.ok` rather than optimistically raised); explicit `0`
and absent-key both not audible and not merged; the state class present/absent; `VERB_COUNT` still
6; and the no-meter assertions still green.

**Notes:**

- **What the owner can click:** the LAYERS tab, on a row with a multi-box template taken to air.
  Switch looks and the chip's denominator now tracks the boxes on screen. Arm a plate in a look
  that does not show it and the chip says `· 1 armed` without moving the fraction.
- ⚠ **A KNOWN LIMIT, stated rather than implied:** `volume` here is the INTENT recorded on the
  stack item, so the chip is exactly as honest as the strips beside it and no more. A plate whose
  volume was successfully asserted and then lost some other way would still read as asking for
  sound. That is a property of the shared verdict, which is the point of the fix; a per-input
  MEASUREMENT does not exist to be read (see [[C-026]]).
- **Number verified free** immediately before filing: `git grep "B-164"` across `docs/`,
  `openspec/`, `packages/`, `tools/` and `apps/` returned only this session's own code comments
  and the registry's forward-reference "Next free" line — no heading anywhere.
- ✅ **Linux `e2e` DISCHARGED** — <https://github.com/yasermostafaee/cg/actions/runs/32658676558> —
  head `7a8eda09`, `completed` + `success`, with the **`E2E (Playwright)` job RUN, not skipped**.
  This is the run that matters most for this item: the fix CHANGED two assertions in
  `live-source-layers.spec.ts` that had the defect written down as expected behaviour, and
  `pnpm gate` does not run Playwright (`P-028`), so only a Linux `e2e` can show they were corrected
  rather than merely edited.
- **Cross-refs:** [[C-026]] (multi-box audio: the monitor/VU work that would make a MEASUREMENT
  possible), [[B-154]]/[[B-155]] (the HELD plate's other consequences), `CLAUDE.md` golden rule 6
  (one predicate, reused — the rule this restores).

## [ ] B-165 — every divergence event the adapter emits reaches NOBODY on the production path: the only subscriber in the tree is a soak counter ⟨priority: high — a backup that is silently wrong, from ANY cause, and every surface reports success⟩ — OPEN

**Filed 2026-08-24 (session MIRROR-SILENT-01), from [[B-159]]'s §6.** Established from the code
before filing, and **§6's stated evidence did NOT survive that check** — see "What BV got wrong"
below. The FINDING holds; the sentence recording it does not, and it is corrected in place.

### The mechanism, anchored

The redundancy adapter detects divergence and announces it four ways:

| Event                    | Emitted at                                                        | Meaning                                             |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------- |
| `mirror-divergence`      | `packages/caspar-client/src/redundancy/redundancy-adapter.ts:384` | this one command got different codes from A and B   |
| `split-brain-persistent` | `redundancy-adapter.ts:391` (budget: 3 in 30 s)                   | the divergence is not a blip                        |
| `corrective-resend`      | `redundancy-adapter.ts:425`, once per replayed line               | the adapter is re-sending the whole ok-journal to B |
| `split-brain`            | `redundancy-adapter.ts:231`                                       | the two slot views differ by N slots                |

**Nothing on the production path subscribes to any of the four.** `CasparRuntime` wires exactly two
adapter events — `#adapter.on('health', …)` (`tools/caspar-bridge/src/caspar-runtime.ts:1332`) and
`#adapter.on('failover-complete', …)` (`:1333`). There is no third. Neither runtime app subscribes
either: the browser only ever sees what the bridge publishes, and the bridge publishes nothing about
divergence.

The **only** subscriber anywhere outside tests is `tools/soak-runner/src/harness.ts:241`, `:244`,
`:247` — three counters incrementing a `SoakEventCounts` record for the soak report (`B-046`). That
harness runs against mock servers inside a synthetic soak. **It is a measurement instrument, not an
operator surface**, and it is not running when the plant is on air.

### What it produces ON AIR

A media file missing on B, a template B cannot fetch, a layer occupied on B, an AMCP build that
answers one command differently — any of these leave **B structurally different from A** while:

- `#send` computes `ok` from the adapter's return, which is the **primary's** response
  (`redundancy-adapter.ts:260` returns `{ ...pRes.value, winner: this.primary }`), so `applyAck`
  records success and the reconcile continues;
- the connection-health surface reports whether B is **REACHABLE**, never whether B is **CORRECT** —
  a live, healthy, answering backup that is wrong reads exactly like a live, healthy, correct one
  (the `degraded`-is-reachable axis of [[B-100]]/[[B-101]], one layer up);
- the operator gets a successful switch, a green server, and no toast.

**The failure is discovered by cutting to the backup** — the moment they least want to discover it.
A confidently-wrong surface is this product's worst defect class, and here the surface is not merely
silent: it is actively affirming.

⚠ **The corrective resend is silent too, and that is the sharpest edge.** Once the budget trips, the
adapter replays **every retained `'ok'` journal entry** to B (`redundancy-adapter.ts:423-427`,
bounded at 500 entries / 5 min by [[B-044]]) — including `PLAY`s for producers that were already
correct on B, which a replay restarts. So the bridge can be re-seating every producer on the backup,
repeatedly, and **no surface anywhere says it is happening.**

### Reachable INDEPENDENTLY of [[B-159]]/[[B-160]] — schedule it apart

**Yes, and this is the reason it is its own number.** [[B-159]] is one _cause_ of divergence (a
missing media file) and [[B-160]] is that cause's _prevention_. This item is the **silence**, which
applies to every cause equally:

- Shipping [[B-160]] (preflight the file per server) removes one cause and leaves this untouched for
  the other causes — a template the backup cannot fetch ([[B-162]]'s family), a channel configured
  differently, a layer occupied by something else, a different CasparCG build.
- Shipping [[B-159]] (behave correctly when a file is missing at the take) is about the per-input /
  per-look blast radius on the server that failed. It does not make the divergence visible.
- Conversely this item shipping alone is worth having: it converts every existing silent divergence
  into a reported one, with no change to any playout path.

**It is also the cheaper half.** The events already exist and already carry the payload
(`seq`, `primaryCode`, `backupCode`, `primary`, `backup`, `divergencesInWindow`). What is missing is
a subscriber in `CasparRuntime` beside the two at `:1332-1333`, a publish channel, and a surface.

### What BV got wrong, recorded so it is not re-derived

[[B-159]] §6 claimed that a repo-wide sweep for both event names found NO listener in the `tools`
or `apps` trees, every other hit being a doc, a living spec, an archived change or a test. **That
is false.** `tools/soak-runner/src/harness.ts` is `tools/**`, is `src`,
is not a test, and holds three real `.on(…)` subscriptions. The finding survives because the soak
harness is not an operator surface; the _evidence as recorded_ does not, and §6 is corrected in
place. Instrument check for THIS sweep: the same `git grep` over `.on(` in `tools/caspar-bridge/src`
returns the two `#adapter.on` lines at `:1332-1333`, so the tool sees adapter subscriptions where
they exist and the absence of a divergence one is real, not a blind spot.

### Acceptance

- WHEN A and B answer the same command with different codes THEN the bridge learns of it (a
  subscriber exists beside the two at `caspar-runtime.ts:1332-1333`) and the operator is told which
  server diverged, on which command.
- WHEN the divergence budget trips and a corrective resend fires THEN that fact is surfaced too — a
  full-journal replay against a live plant is an event an operator must be able to see.
- WHEN the backup is merely UNREACHABLE THEN this surface must not double-report it: reachability
  already has an owner, and divergence is the CORRECTNESS axis (golden rule 8 — probe the axis you
  intend to judge).
- ⚠ WHEN the surface reports "no divergence" THEN that must not be read as proof the two servers
  agree. It means no command answered differently; it is not a comparison of what is on air. The
  wording must say so, on [[B-163]]'s precedent.

- **Cross-refs:** [[B-159]] (one cause of the divergence this hides; its §6 is where this was found),
  [[B-160]] (that cause's prevention), [[B-162]]/[[B-163]] (another cause, and the
  a-warning-is-not-a-measurement rule this item's wording inherits), [[B-044]] (the journal bound
  that keeps each resend burst finite), [[B-046]] (the soak counters — the only existing consumer),
  [[B-100]]/[[B-101]] (reachable ≠ correct; the axis this surface must not confuse).

<!--
  ── THE 2026-08-24 TWO-SERVER PLANT TEST (session PLANT-FINDINGS-01) ────────────────────

  B-166 … B-174 below were all filed from the owner's FIRST real two-server plant run. They are
  filed SEPARATELY on purpose: they share a session, not a cause, and rolling them together is how
  one fix comes to claim credit for eight symptoms.

  Two results from that run are SETTLED and are not re-opened by any item here:
    · B-161's fix HOLDS on the plant — UPDATE alone put nothing on air.
    · B-162's fix HOLDS on the plant — the backup's template now switches with the look.

  🔴 EVIDENCE DISCIPLINE FOR THIS BATCH. Every item below states, in its own words, what was
  MEASURED and what was READ FROM THE CODE. Nothing here was measured on the SDI seam: the owner's
  report is the only air-side evidence, and where an item's mechanism is a deduction from the source
  it says so rather than borrowing the owner's sighting as proof of the mechanism. Two premises
  handed to the session did NOT survive contact with the code and were filed as nothing at all —
  they are recorded in B-167's §"What this is NOT" so the next reader does not re-derive them.
-->

## [~] B-166 — 🔴 a REFUSED look switch has ALREADY MOVED live plates on the wire, and every surface says it did not happen ⟨priority: high — a mixed geometry on air, from a button that reported failure⟩ — FIXED 2026-08-25 together with [[B-167]]; ONE fix, proven by a one-line revert. Linux e2e DISCHARGED: https://github.com/yasermostafaee/cg/actions/runs/32829920791 (commit `a80c2a9f`; `e2e` job conclusion `success`, and the step RAN rather than skipped)

<!--
  🔴 FIXED 2026-08-25 — and read this before touching either item, because the SHAPE of the fix
  is not the shape the brief predicted.

  THE §0 VERDICT: B-166 and B-167 are TWO FACES OF ONE DEFECT. One fix closes both, and that is
  not an argument — it is measured. Reverting a SINGLE LINE (`mode: 'switch'` back to
  `mode: 'live'` at `setActiveLook`'s reconcile) turns BOTH items' tests red together.

  ⚠ THE BRIEF'S DIAGNOSIS WAS WRONG, AND CORRECTING IT CHANGED THE FIX. It read: "the verb
  mutates before it decides". It does not. `setActiveLook` → `reconcileLivePlates` →
  `#planLiveSeating` is pure and refuses BEFORE anything is written or sent — the same
  plan/decide/apply shape `take` uses, already in place on this path. What a plan cannot decide
  is a WIRE outcome: a source that resolves fine and that CasparCG then refuses to open. The
  owner's plant case is exactly that (a box that renders black is one whose command was
  attempted), so "plan before apply" was never the missing piece.

  THE FIX IS ALL-OR-NOTHING APPLY: a refused switch puts the geometry back. `#applyLivePlates`
  gained a third mode, `'switch'`, which PLANS byte-identically to `'live'` (same
  `already-live` scope, same `pinned` level 2, same UNION pre-seat — §3's constraint held and
  asserted) and differs only in what a failure MEANS.

  🔴 WHY THAT IS SAFE HERE AND NOT FOR A SWAP, which is the reason `'live'` is right to refuse
  a rollback: a plain switch issues NO `PLAY` at all. Every punched plate is already seated by
  the union pre-seat, so the only traffic is `MIXER FILL`/`CLIP` (plus a `MIXER VOLUME` leaving
  HELD). Undoing that is re-emitting the PRIOR fit — no `out`, no `MIXER CLEAR`, no producer
  destroyed, nothing taken off air. `B-126`'s never-CLEAR-before-a-repair rule is not engaged.
  A plate this action genuinely `PLAY`ed is deliberately NOT rolled back.
-->

**What the owner saw, on the plant.**

> _"With one source of a 3-box look faulty, pressing the 3-box button shows an error and the button
> does not activate — but the boxes switch to 3-box anyway, and the faulty box renders black."_

🔴 **THIS IS `B-161`'s FAMILY: A VERB THAT REFUSES AND ACTS.** `B-161` was a configuration verb
reaching the wire; this is a playout verb that reaches the wire, fails partway, and then reports
that it did nothing. The refusal is not a lie about the FAILURE — it is a lie about the SCOPE.

### The mechanism — read from the code, not measured on air

`setActiveLook` ([`caspar-runtime.ts:4704`](../../tools/caspar-bridge/src/caspar-runtime.ts)) runs
its on-air branch as `reconcileLivePlates(mode: 'live')` → then `#tellPageLook`. The refusal path is
where the damage is, and it has three steps:

1. **`#applyLivePlates` BREAKS AT THE FIRST REFUSED PLATE** (`caspar-runtime.ts:5285`,
   `if (failure !== undefined) break;`). Plates iterated BEFORE the faulty one have already had
   their `MIXER FILL`/`CLIP` sent at the NEW look's geometry, and those sends LANDED. Plates AFTER
   it are never processed at all and stay at the OLD geometry.
2. **`'live'` mode deliberately does NOT roll back** (`reconcileLivePlates`'s own mode note:
   _"Undoes only the plate that failed … blacking working boxes to punish a failing one is the
   opposite of what the operator needs in that minute"_). That judgement is defensible for a SOURCE
   SWAP, where one plate is the whole action. For a LOOK SWITCH the action is a single geometry
   change across every plate, so "undo only the failed one" leaves a geometry that belongs to no
   look at all.
3. **The page is then never told** — `#tellPageLook` runs only on `reconciled.ok`, so the holes stay
   on the OLD look, `#recordActiveLook` never fires, the picker does not move, and no `stackChanged`
   is published.

**The state on air after the refusal, stated exactly:** some fills at the NEW look's rects, some at
the OLD look's, every hole at the OLD look, the faulty plate torn down to black
(`out` + `MIXER CLEAR`, `caspar-runtime.ts:5362-5364`), and a picker plus a published stack that
both say the row is still on the OLD look. **Every readout the operator has says the switch did not
happen. Three of the four things on air moved.**

**Repro:** two-server plant, a 3-box look, one of its three sources faulty (absent input / dead
route). Row on air on a different look. Press the 3-box segment.
**Expected:** either the switch happens completely, or nothing on the wire moves and the refusal is
true.
**Actual:** an error toast, an unmoved picker, and a partially-switched picture on air.
**Env:** owner's two-server plant, 2026-08-24. Mechanism read from `caspar-runtime.ts`; NOT measured
on the SDI seam and NOT reproduced against the AMCP mock in this session.

### 🔴 What the fix must decide — and what it must NOT do

- **The `'live'` no-rollback rule is not simply wrong, and must not simply be inverted.** It exists
  because a swap must not black working plates. The question this item opens is narrower: **is a
  LOOK SWITCH one action or N?** It is one — it is a single geometry, and a partial one is not a
  smaller version of it. So the switch needs an outcome the swap does not: either all fills move or
  none do.
- ⚠ **A rollback here is a DESTRUCTIVE step on live layers, so `B-126`'s rule governs it.** Moving a
  landed `MIXER FILL` back is not a `CLEAR` and does not destroy a producer, which is what makes
  this tractable — the repair is re-fitting to the OLD look's rects, not tearing down. **Any
  candidate that reaches for `out`/`MIXER CLEAR` on a working plate is the wrong candidate.**
- ⚠ **Golden rule 7 applies to the refusal itself.** The message must be computed from what actually
  landed, exactly as `#applyLivePlates`'s `playLanded` bookkeeping already does for the single-plate
  case — not from the intent. A refusal that says "the look was not changed" while three fills moved
  is the half-state the 7.9 work removed from ONE path and left in this one.

**Regression test:** `tools/caspar-bridge/tests/live-look-reconcile.integration.test.ts`, asserting
on the mock's NDJSON trace: with plate 2 of 3 refused, the wire after the refusal must contain no
`MIXER FILL` at the new look's rects for plate 1 — or, if the chosen fix is a re-fit rollback, must
contain plate 1's fill back at the OLD look's rect. `setHandler('MIXER', …)` is the injection hook.

- **Cross-refs:** [[B-161]] (the same shape, one verb over — refuse and act), [[B-167]] (what the
  operator hits NEXT, when they take this item's own advice and re-press), [[B-126]] (the rule any
  rollback candidate must not break), [[B-155]] (the other defect living in this switch's window).

## [~] B-167 — 🔴 the RE-PRESS the product prescribes as the repair is a guaranteed NO-OP for a mis-fit plate, and it then reports SUCCESS ⟨priority: high — the holes move, one box does not, and the switch goes green⟩ — FIXED 2026-08-25 by [[B-166]]'s fix; NOT a second change. Linux e2e DISCHARGED on the same run: https://github.com/yasermostafaee/cg/actions/runs/32829920791

<!--
  🔴 FIXED 2026-08-25, and NOT by a fix of its own — read this before writing one.

  The lying ledger record this item is built on — the ATTEMPTED geometry kept for a plate whose
  `MIXER FILL` was refused — is not an independent defect. It is the RESIDUE of a partial apply
  that was never undone. Once a refused switch puts the geometry back and writes the previous
  ledger back verbatim ([[B-166]]), the next press computes a real delta against the truth
  instead of `same() === true`, so it either works or refuses again for the same reason.

  A guaranteed no-op that answers `ok` stops being REPRESENTABLE rather than being defended
  against — which is why there is no second guard anywhere for it.

  ⚠ MEASURED, not argued: reverting the one line that makes a switch all-or-nothing turns THIS
  item's test red alongside B-166's. If a future change makes them fail independently, the two
  have come apart and this item needs its own fix again.
-->

**What the owner saw, on the plant.**

> _"The holes switch but the boxes stay put, so pictures come out corrupted."_

🔴 **THE PRODUCT NAMES ONE REMEDY FOR A HALF-APPLIED SWITCH, AND THAT REMEDY CANNOT WORK.**
`setActiveLook`'s own refusal sentence ends _"Re-issue the switch."_, and `LookPicker`'s comment
argues at length that a re-press must not be guarded because _"a re-press is not a redundant
re-assert. It is the repair"_. For the plate whose `MIXER FILL` or `CLIP` was the thing refused, the
re-press emits nothing at all.

### The mechanism — read from the code, in three lines that have to be read together

1. **A refused RE-FIT keeps the ATTEMPTED geometry in the ledger.**
   `caspar-runtime.ts:5389-5397`: `revertToPrior` requires `failed.reseat`, and a re-fit has
   `seatUnchanged === true`, so `reseat` is false. `tornDown` requires `!replacedInPlace`, and a
   re-fit is on its own slot, so that is false too. Therefore `settledFailed = [failed.record]` —
   and `record.fill` is the NEW look's rect, **for a `MIXER FILL` that was refused and never
   landed.**
2. **The delta guard then reads that record as truth.** `caspar-runtime.ts:5217`:
   `if (!same(prior.fill, record.fill) || !same(prior.clip, record.clip))`. On a re-press of the
   SAME look, `prior` is the lying record (NEW) and `record` is the freshly planned rect (NEW), so
   `same()` is TRUE on both axes and **no `mixerFit` is pushed. The plate's `lines` array is
   empty.**
3. **So the reconcile succeeds** — nothing was sent, so nothing could fail — **and `#tellPageLook`
   then runs and succeeds.** The holes move to the new look, `#recordActiveLook` fires, the picker
   goes green, and no toast appears.

**Result: the holes switch, that box stays where it was, and every surface reports success.** The
first attempt at least had an error on it; the re-press removes the last thing that said anything
was wrong.

### 🔴 The comment at `caspar-runtime.ts:5382-5387` argues for this branch, and its reasoning is INVERTED

It reads: _"The ATTEMPTED record is kept so that re-issuing the same switch computes a real delta
and REPAIRS it — reverting to the prior geometry made the retry a no-op and left the plate black."_

Both halves are backwards, and the arithmetic is one line each:

| ledger keeps…                       | re-press: `prior.fill` vs `record.fill` | `same()` | `MIXER FILL` emitted? |
| ----------------------------------- | --------------------------------------- | -------- | --------------------- |
| the ATTEMPTED record (what it does) | NEW vs NEW                              | **true** | **no — the no-op**    |
| the PRIOR record (what it rejected) | OLD vs NEW                              | false    | **yes — the repair**  |

⚠ **This is worth stating plainly because the comment will be read as a reason not to touch the
branch.** It is not a case of a comment drifting from its code; the comment describes the OPPOSITE
behaviour to the one the code produces, and it is the more persuasive of the two. **Replace it, do
not merely override it** — this repo has been bitten before by a warning that outlived its premise
(see the `LooksBindingsSection` badge note for the same correction applied properly).

**Repro:** as [[B-166]], then press the same look segment a second time.
**Expected:** the re-press repairs the mis-fit plate, or refuses again.
**Actual:** the holes move, the mis-fit plate does not, the picker goes green and nothing is
reported.
**Env:** owner's two-server plant, 2026-08-24. The three-step mechanism is READ FROM THE CODE and is
deterministic; it was NOT measured on the wire in this session, and the measurement is what the fix
owes.

### What this is NOT — two premises that did not survive the code

- ❌ **It is NOT [[B-149]]** (the mask hole taking the cell's POSITION and the AUTHORED SIZE because
  `liveArrangementView` read back only `left`/`top`). **B-149 is `[x]` FIXED, 2026-08-19** —
  `packages/template-runtime/src/arrangement-view.ts` now reads `width`/`height` back alongside
  `left`/`top` and compares SIZE as well as position in the "only when it actually differs" guard.
  The premise was checked in the file and does not hold.
- ❌ **It is NOT simply [[B-166]]'s consequence.** B-166's refusal leaves fills at the NEW geometry
  behind holes at the OLD look — the OPPOSITE direction to what the owner reports here. This item is
  the direction the owner actually named, and it is reached FROM B-166 (a refused re-fit is what
  plants the lying ledger record) without being the same defect. **Fixing B-166 does not fix this**:
  any refused `MIXER FILL`/`CLIP` plants the same record, and the `mixerFit` pair is sent as two
  lines on one connection (`command-builder.ts:269`), so a half-landed pair is an ordinary outcome.

**Regression test:** `live-look-reconcile.integration.test.ts` — refuse `MIXER` once via
`setHandler`, then re-issue the SAME look, and assert the trace CONTAINS a `MIXER FILL` for that
plate. Assert the plate's rendered rect via `layerRenderedRect()`, not just `layerState().fill`:
`FILL` and `CLIP` can be half-applied and only the intersection says what is on screen.

- **Cross-refs:** [[B-166]] (the refusal that plants the record), [[B-155]] (the same switch window,
  the other defect), [[B-149]] (the disproven premise, kept here so it is not re-derived),
  [[B-126]] (why the failure path is this careful in the first place).

## [~] B-168 — the LOOK PICKER does not SAY it commits immediately, on a surface where everything beside it waits for UPDATE ⟨priority: medium — the operator cannot tell which control has already changed air⟩ — RE-SCOPED and DECIDED 2026-08-25 (owner: option b); shipped `2b91f13f`. Linux e2e DISCHARGED: https://github.com/yasermostafaee/cg/actions/runs/32834755257 (`e2e` job `success`, step RAN)

<!--
  🔴 THE HEADING WAS RE-SCOPED IN PLACE ON 2026-08-25, AND THE OLD ONE IS QUOTED HERE BECAUSE
  DELETING IT WOULD HIDE THE CORRECTION.

  It read: *"the LOOK PICK is not part of UPDATE's transaction and is not staged, on a surface
  that teaches STAGED ≠ IN FORCE"*.

  That wording says something is DROPPED. Nothing is dropped — **nothing is ever held**.
  `stack.update` has no look field, `draftStore` has no look staging, and `LookPicker.onPick`
  calls `stack.set-active-look` immediately. An item describing a missing transaction sends the
  next reader to build one, which is the opposite of what was decided.

  ⚠ This project has corrected a false record three times now (`B-159`'s disproven claims,
  `B-175`'s AspectRow claim, `D-155`'s jump claim). Leaving the old wording standing while the
  decision went the other way would have been the fourth.
-->

**Owner's decision, 2026-08-25 — option (b): the look pick STAYS IMMEDIATE.** It is not staged,
and `UPDATE` is not touched. The reasons, in the owner's order of weight:

1. 🔴 **A staged look is the confidently-wrong-surface class this product fears most.** The
   operator stages a look, forgets UPDATE, and the row SHOWS one look while the picker CLAIMS
   another. Immediacy makes that disagreement **unrepresentable**. This argument outranks the
   rest.
2. **The picker on an on-air row IS a cut**, already decided at [[B-151]] — _"an on-air row gets
   the cut"_. Staging would turn a live cut control into a two-press control at exactly the
   moment speed matters.
3. **The complaint's cause was a LYING REFUSAL, not immediacy.** [[B-166]] closed it: the owner
   reached for UPDATE because the refused switch had left him no honest route, and it now
   refuses cleanly and the re-press works. Staging would treat a symptom that no longer exists.
4. **Two commit models on one surface is a real cost — but it already exists and is
   documented.** `LooksBindingsSection`'s CLEAR PATCH sets the precedent with its reason written
   down: it applies immediately "because the patch it undoes was applied immediately too …
   making its removal wait for UPDATE would leave the two halves of one operator decision on
   different clocks." So the answer is that the surface **SAYS SO** — not that it becomes
   uniform.

**What is therefore missing, and it is the whole of the remaining work:** the picker does not
say it commits immediately. Everything beside it on that panel waits for UPDATE, so an operator
has no way to know this one control has already changed air. **A sentence on the surface, not a
behaviour change.**

<!--
  ⚠ SUPERSEDED THE SAME DAY — the owner answered (b), and the decision with its full reasoning
  is in the item body above. This note is KEPT rather than deleted because it records what was
  ASKED FOR and why it was refused, which is the part a later reader would otherwise re-derive
  from the prompt and re-implement.

  🔴 BLOCKED 2026-08-25 — STOPPED DELIBERATELY, and the reason is that the obvious fix would
  make an ON-AIR control worse.

  `LOOK-VERB-01` §2 asked for "UPDATE carries the look pick into force, and the row does not
  need the look button pressed afterwards". That cannot be implemented as written, because
  THERE IS NO STAGED LOOK PICK FOR UPDATE TO CARRY: `stack.update`'s payload has no look field,
  `draftStore` has no look staging, and `LookPicker.onPick` → `LayerRow.switchLook` calls
  `stack.set-active-look` IMMEDIATELY. Nothing is ever dropped, because nothing is ever held.

  ⚠ WHAT THE OWNER ACTUALLY HIT IS NOW GONE. His sequence was: press look → "failed" (but the
  boxes moved) → press UPDATE (nothing) → press the look button again, "the very press that had
  just failed". With [[B-166]] fixed, the first press is cleanly refused, nothing moves, and
  the message names the plate — so the re-press IS the route, and it works. He reached for
  UPDATE because the switch had left him with no honest one.

  THE DECISION THIS NEEDS, which is the owner's and not a session's:

  (a) The look pick becomes STAGED like the per-look bindings, and UPDATE commits it.
      🔴 This makes a look switch on an ON-AIR row take TWO presses. The picker is a live CUT
      control — `B-151`'s own note says an on-air row "gets the cut" — so this trades a
      one-press cut for a two-press one on the surface that most needs immediacy.

  (b) The look pick STAYS immediate, and the surface SAYS so, so the two commit models on one
      panel stop being indistinguishable. `LooksBindingsSection`'s CLEAR PATCH already sets
      this precedent and states its reason: it applies immediately "because the patch it undoes
      was applied immediately too … making its removal wait for UPDATE would leave the two
      halves of one operator decision on different clocks."

  This session recommends (b) and did NOT implement either. Implementing (a) on an on-air
  control without the owner's call is exactly the kind of unasked-for behaviour change that
  golden rule 10's neighbours exist to prevent.
-->

**What the owner saw, on the plant.**

> _"After changing look, UPDATE does not put it in force — the operator must press the look button
> on the row instead."_

**The mechanism, and it is a DESIGN fact rather than a drop — established from the code.** The look
pick is nowhere in UPDATE's transaction, and nothing loses it on the way:

- `StackUpdateChannel`'s request schema (`packages/shared-ipc/src/channels/stack.ts:76`) is
  `{ itemId, fields, mergeMode, lookBindings? }`. **There is no active-look field on the wire at
  all.**
- `applyDraft` / `sendUpdate` (`apps/runtime/src/renderer/features/inspector/applyDraft.ts`) build
  exactly those four keys.
- `draftStore.ts` has no look-pick staging — it stages fields, plate sources and per-look BINDINGS,
  and nothing else.
- The row's `LookPicker.onPick` → `LayerRow`'s `switchLook` calls `window.cg.stack.setActiveLook`
  **immediately** (`LayerRow.tsx:348`).

So the owner's observation is correct and the answer to _"not part of the transaction, or dropped
somewhere?"_ is **the former, cleanly**.

### 🔴 Why it is still a defect: ONE panel, TWO commit models, and no way to tell them apart

The Inspector's Looks & Bindings section teaches the operator that a look's INPUT is staged, wears a
`draft` chip, and lands on UPDATE. The row's LOOK segments — the control for the same feature, read
in the same glance — are an immediate write with no staging and no chip. Nothing on either control
says which model it follows.

⚠ **The repo has already made this exact call once, in the opposite direction and with its reason
written down.** `LooksBindingsSection`'s CLEAR PATCH button applies immediately, and its comment
justifies that explicitly: _"the patch it undoes was applied immediately too (R-048 is an on-air
emergency, not a draft), so making its removal wait for UPDATE would leave the two halves of one
operator decision on different clocks."_ **That is the right shape of argument and the look pick has
never had one.** The look pick is plausibly in the same class — a look switch on an on-air row is a
CUT, and staging a cut would be strange — but that has never been decided out loud, and the
operator has no way to read it off the surface.

**Repro:** on-air row, change the look with the row's LOOK segment; separately, edit a look's input
in the Inspector and press UPDATE. Note that one committed on press and the other on UPDATE, with
nothing saying so.
**Expected:** the surface makes its commit model legible, whichever way the decision goes.
**Actual:** two models, no tell.
**Env:** owner's two-server plant, 2026-08-24. Established entirely from the code; the schema, the
draft store and the call site were each read.

### The decision this item is really asking for

**Do NOT default to "add the look to UPDATE's payload".** That would make a look switch on an
on-air row wait for a second press, which is a worse cut. The likelier correct answer is the
opposite — keep the immediate write and make the picker SAY it is immediate, the way the picker
already says whether it targets `LOOK` or `PVW LOOK` (`B-151`'s precedent, on this very control).
Either way the fix is a stated decision plus a word on the control, not a payload change made
because the payload looked incomplete.

- **Cross-refs:** [[B-151]] (the precedent: this control already learned to say what its press
  changes), [[B-166]] (why an operator reaches for UPDATE here at all — a refused switch leaves them
  hunting for another way to commit it), [[B-155]] (the item where _"press UPDATE, nothing happens"_
  was a REAL defect — the two must not be confused).

## [ ] B-169 — 🔴 an explicitly configured non-loopback `templateServeHost` does NOT widen the bind, so the bridge advertises an address it refuses to answer on ⟨priority: high — B-162's exact silent failure, reached from the surface built to prevent it⟩ — OPEN, filed 2026-08-24 from the two-server plant run

**What the owner saw, on the plant.**

> _"With a SINGLE local CasparCG and an explicit `serveHost` of `192.168.21.93`, the graphics do not
> load while box videos do."_

That is [[B-162]]'s signature exactly — live plates render, `CG ADD` returns 200, health stays
green, and only the graphic is missing — arriving from the [[C-024]] panel that was built to end it.

### 🔴 MEASURED, both halves, 2026-08-24

Run against the built `tools/caspar-bridge/dist/template-http-server.js` plus a real socket on this
machine:

```
deriveServeOptions(['127.0.0.1'], { serveHost: '192.168.21.93' })
  = { bindHost: '127.0.0.1', port: 0, serveHost: '192.168.21.93' }
hostsUnableToFetchTemplates(['127.0.0.1'], <those options>) = []      ← the diagnostic is SILENT

bound 127.0.0.1:59353
  fetch http://127.0.0.1:59353   -> HTTP 200
  fetch http://172.18.0.1:59353  -> FAILED: ECONNREFUSED               ← this machine's own LAN IP
```

**The second fetch is the whole bug.** A socket bound to `127.0.0.1` refuses a connection to the
machine's own routable address, so even the LOCAL CasparCG cannot fetch the URL the bridge tells it
to fetch. `TemplateHttpServer.start` binds `options.bindHost` and `urlFor()` advertises
`options.serveHost`; nothing reconciles the two.

### The mechanism — the two halves are ONE decision, taken independently

`deriveServeOptions` (`tools/caspar-bridge/src/template-http-server.ts:78`):

```ts
const allLocal = casparHosts.every(isLoopbackHost);
return {
  bindHost:  override.bindHost  ?? (allLocal ? '127.0.0.1' : '0.0.0.0'),
  serveHost: override.serveHost ?? (allLocal ? '127.0.0.1' : guessLanHost()),
  ...
};
```

`allLocal` is computed once and then consulted TWICE, independently. An override supplies
`serveHost` and leaves `bindHost` to the derivation, so an all-loopback install keeps a loopback
BIND while advertising a LAN address. **The owner's reading of the cause was correct and is
confirmed here.**

⚠ **And `storedServeOverride` cannot rescue it** (`tools/caspar-bridge/src/serve-host-config.ts`):
it returns `{ serveHost?, port? }` only. **There is no path — flag, panel or file — by which an
operator can widen the bind.** `TemplateServeOverride` declares `bindHost`, and nothing populates
it.

### 🔴 Why the B-162 diagnostic cannot see this, which is the second half of the finding

`hostsUnableToFetchTemplates` opens with `casparHosts.filter(h => !isLoopbackHost(h))` and returns
`[]` when that is empty. Its question is **"is any configured server REMOTE?"** — and here none is.
But unreachability was not caused by a remote server; it was caused by an advertised address
**nobody** can reach, the local server included. **The predicate written to make this class of
failure loud is structurally blind to the case where the operator configures the address by hand,**
which is the case C-024 exists to support.

**Expected:** an explicitly configured non-loopback `serveHost` FORCES a routable bind — the two
halves are one decision and must be read once (golden rule 7's shape, at a pair of `??`s).
**Actual:** loopback bind, LAN advertisement, `CG ADD` 200, no graphic, and the diagnostic silent.
**Env:** owner's two-server plant, 2026-08-24, single local CasparCG + explicit `serveHost`.
Function outputs and the TCP consequence MEASURED as above; the plant sighting is the owner's.

### What the fix must cover — both directions, and the diagnostic

1. A non-loopback `serveHost` from ANY layer (flag, stored config, panel) implies a routable
   `bindHost` unless `bindHost` is itself explicitly overridden.
2. `hostsUnableToFetchTemplates` must also answer the question it is named for when the SERVE HOST
   is the unreachable half — "who cannot fetch the URL we advertise", not "is anyone remote". The
   all-loopback-config case must be able to produce a warning.
3. ⚠ **`template-http-server.ts` is in `.claude/never-stage`** while the owner's `guessLanHost()`
   plant pin sits in it uncommitted (`P-035`). C-024 already composed ABOVE that seam in
   `serve-host-config.ts` for exactly this reason, and half of this fix — the implication rule —
   can live there too. The `hostsUnableToFetchTemplates` half cannot, and needs the pin resolved
   first.

**Regression test:** `tools/caspar-bridge/tests/template-http-server.test.ts` already covers
`deriveServeOptions(['192.168.1.50'], {…})`; the missing case is
`deriveServeOptions(['127.0.0.1'], { serveHost: '<non-loopback>' })` asserting a routable
`bindHost`, plus a `hostsUnableToFetchTemplates` case with an all-loopback host list and a
non-loopback serve host.

- **Cross-refs:** [[B-162]] (the same silent failure, from the primary-only derivation), [[C-024]]
  (the panel that made this reachable — and whose own doc names the `''`-as-an-address trap, which
  is this trap's sibling), [[B-163]] (a warning is not a measurement).

## [ ] B-170 — 🔴 after a manual FAILOVER the reconciler's link-down latch is NEVER cleared, so on-air rows stay demoted and PLAY never goes green while commands keep landing ⟨priority: high — the console cannot show air that genuinely exists, indefinitely⟩ — OPEN, filed 2026-08-24 from the two-server plant run

**What the owner saw, on the plant.**

> _"After a manual failover to B, looks do not render correctly and PLAY never goes green, though
> graphics can be sent."_

**The `PLAY never goes green` half has a precise mechanism and it explains the `though graphics can
be sent` clause exactly. The `looks do not render correctly` half is NOT established — see §2.**

### §1 · The latch — read from the code, and it is a four-step deduction with no branch in it

1. `Reconciler.linkDown` is mutated by **`setLinkDown` and nothing else**
   (`packages/caspar-client/src/reconciler/reconciler.ts:521`; a `git grep` for `linkDown` in that
   file returns the declaration, that one assignment, two reads and a comment). OSC traffic does not
   clear it.
2. Its only production callers are the two `state-change` branches in `#wireAdapter`
   (`caspar-runtime.ts:1299` and `:1347`), and **both are guarded by
   `if (this.#adapter.currentPrimary !== label) return;`** — only the CURRENT primary may drive it.
3. So when A (primary) dies, `from === 'healthy'` fires on A while A is still primary →
   `setLinkDown(true)`. Correct, and this is [[B-086]] working.
4. `failover()` then flips the role and **touches the reconciler not at all.**
   `RedundancyAdapter.failover` sets `this.primary = to` and emits `failover-complete`; the bridge's
   handler (`caspar-runtime.ts:1332-1341`) records `#lastFailover` and re-emits health. **B's
   session state does not change** — it was already `healthy` and stays `healthy` — so **B never
   fires a `state-change` into `healthy` again, and the one thing that could call
   `setLinkDown(false)` can never fire.**

**The latch is therefore stuck until B itself drops and recovers.** While it is stuck,
`reconcileStatus` returns `'unverified'` for every on-air/playing row
(`reconciler.ts:764`), so the row reads WAS ON AIR and `PLAY`'s `active` fill — which requires
`status === 'on-air' || 'playing'` (`layerRowActions.ts`) — **can never light.**

**And commands still land, which is why the operator sees the contradiction.** The refusal predicate
is `#noServerReachable()` (`caspar-runtime.ts:2462`) — "no DECLARED server is reachable" — and B is
live, so every verb is accepted. The owner's _"though graphics can be sent"_ is not a puzzle; it is
the two predicates disagreeing, correctly on one side and not on the other.

⚠ **Two further consequences fall out of the same gap and should be checked by whoever fixes it,
not filed separately until they are:** `reconcileOnReconnect` and `#decidePendingRestores` are also
reached only from that `to === 'healthy'` branch, so **neither is ever run against B's occupancy** —
the console's belief about which layers are occupied is A's, from before the failover. The
`session.on('healthy')` handler that clears `#loaded` (B-054) is likewise never fired for B.

### §2 · The `looks do not render correctly` half is NOT ESTABLISHED, and is deliberately not given a mechanism here

No code path was found that would make a look render wrongly on the new primary after a failover.
Under the default `mirror-sync` strategy every `CG ADD`, `MIXER FILL` and `CG UPDATE` fanned out to
BOTH servers all along, and the owner's own run confirms B's template switches with the look (the
`B-162` fix holding). **Writing a mechanism here would be inventing one.** What the next session
owes is a measurement, not a theory: after a manual failover, capture B's wire trace for one look
switch and compare it against A's for the same switch before the failover.

**Repro:** two declared servers, both healthy, row on air. Kill A. Press FAILOVER.
**Expected:** the row's air state is re-verified against the new primary and PLAY reads normally.
**Actual:** rows stay `unverified` / WAS ON AIR and PLAY never lights, while commands still reach B.
**Env:** owner's two-server plant, 2026-08-24. §1's mechanism is READ FROM THE CODE — every hop was
followed in source and no measurement was taken on the wire.

### 🔴 What the fix must not do

**Do NOT clear the latch on `failover-complete` unconditionally.** The `restore()` path's comment
(`caspar-runtime.ts:1906-1917`) already refuses precisely that shortcut and its reasoning holds
here: clearing the flag when the NEW primary is not verified would un-demote [[B-086]]'s
`unverified` rows back to a confident red ON AIR that nothing backs. The correct move is to
**re-evaluate the new primary the way a `to === 'healthy'` transition would** — its state, its
occupancy sample, and the reconcile that follows — rather than to flip a boolean. A failover is a
change of which server answers the question, so it must re-ASK the question.

**Regression test:** a bridge-level test that drives A `healthy → disconnected`, calls `failover()`,
and asserts `reconciler.isLinkDown === false` with the on-air row published as `on-air` rather than
`unverified`, B having been healthy throughout and never transitioning.

- **Cross-refs:** [[B-086]] (the honesty demotion this latch implements — the fix must keep it),
  [[B-171]] (the other half of the failover story: what the console lets you press before you fail
  over), [[B-092]] (the restore path that already reasons about this flag), [[B-100]]/[[B-101]]
  (reachability and verifiability are different axes — this item is the verifiability one).

## [ ] B-171 — 🔴 the console DISABLES every CasparCG verb while a healthy BACKUP is reachable, because the renderer re-derives reachability from the PRIMARY alone ⟨priority: high — it denies air that exists, against an archived R-006 acceptance the bridge already honours⟩ — OPEN, filed 2026-08-24 from the two-server plant run

**What the owner saw, on the plant.**

> _"PLAY is inert, and nothing says why. With A unreachable and B healthy, every PLAY is disabled
> until FAILOVER is pressed."_

The owner filed this as an operator-trust item and allowed that the behaviour might be correct.
**It is not correct.** It contradicts an archived acceptance scenario, and the bridge on the other
side of the wire already implements the opposite.

### 🔴 R-006 decided this, in writing, and it is `[x]`

> _"WHEN a mirror pair's PRIMARY is down but a BACKUP is healthy THEN the verbs still work (the
> command reaches a real, rendering server — refusing would deny air that exists; see B-056)."_
> — [R-006](runtime.md), archived `2026-07-18-runtime-offline-safety`

### The two spellings, and which one the operator's hand touches

| layer        | predicate                                                             | answer with A down, B healthy  |
| ------------ | --------------------------------------------------------------------- | ------------------------------ |
| **bridge**   | `#noServerReachable()` — `sessions.every(s => !isLiveState(s.state))` | reachable → **verb accepted**  |
| **renderer** | `resolveCasparReach` — `isServerReachable(health.primary.state)`      | `'unreachable'` → **disabled** |

`resolveCasparReach` (`apps/runtime/src/renderer/hooks/useCasparReachable.ts`) reads
`health.primary.state` and nothing else. `health.primary` is ROLE-keyed — `health()` builds it from
`this.#adapter.currentPrimary` (`caspar-runtime.ts:7529`) — so before the failover it IS A, the dead
one. `health.backup` is published and carries B's `healthy`, and **no reachability path in the
renderer reads it**: a `git grep` for `.backup` under `apps/runtime/src/renderer` returns only
`StatusBar` pills and the FAILOVER button's own enablement.

**This is golden rule 6 exactly.** The bridge's predicate is the canonical one and its header
already names B-056 and spells out why the primary is the wrong question. The renderer keeps a
second, narrower spelling of the same question, and the second one wins because it is the one
attached to the button.

### 🔴 And the command WOULD have landed — this is the part that makes it a denial rather than a courtesy

Under the default `mirror-sync` strategy (`bridge.ts:378`, `seed.ts:69`), `sendMirrorSync` fans out
to both and explicitly handles the primary-failed case
(`packages/caspar-client/src/redundancy/redundancy-adapter.ts`):

```ts
if (bRes.status === 'fulfilled') {
  this.journal.resolve(seq, 'err');
  this.recordPrimaryFailure();
  return { ...bRes.value, winner: this.primary === 'A' ? 'B' : 'A' };
}
```

The send **succeeds on the backup and returns `winner: B`**. The console is refusing a command that
the plumbing beneath it is built to complete.

### The sentence is wrong too, and it points at the wrong remedy

The disabled control's reason is `CASPAR_UNREACHABLE_REASON`:
_"CasparCG cannot be reached — this command would not arrive. It returns as soon as the playout
server is back."_ With B healthy and a FAILOVER button on the same screen, that sentence is
confidently wrong on both clauses and **instructs the operator to WAIT when the remedy is one
press away.** The owner's instinct that the fix is a sentence is right about half of it; the other
half is the gate.

⚠ **MEASURED, and it corrects the owner's report on one point.** The reason IS reachable: the
console's delegated tooltip (`apps/runtime/src/renderer/ui/Tooltip.tsx`) listens for `pointerover`
in the capture phase, and a real Chrome mouse-move over a `disabled` `<button>` **does** dispatch
`pointerover` with the button as `e.target`, so `closest('[title]')` finds it. Measured with
Playwright against system Chrome: hovering a `disabled` button carrying a `title` resolved that
button and its text. **So "nothing says why" is not literally true — something says why after a
450 ms dwell, and what it says is wrong.**

**Repro:** two declared servers, `mirror-sync`. Take A offline, leave B healthy. Observe every
AMCP-emitting control on every row disabled, with the sentence above.
**Expected:** the verbs stay live (R-006), and any reason shown names the actual state.
**Actual:** every verb disabled; the reason blames "CasparCG" and prescribes waiting.
**Env:** owner's two-server plant, 2026-08-24. The predicate mismatch, the role-keyed `health()` and
the `mirror-sync` backup-wins branch were all read in source; the tooltip reachability was measured
in Chrome. Not measured on the plant wire.

### 🔴 The one thing the fix must not do: add a THIRD spelling

The renderer must not learn to compute `primary || backup` for itself — that is the same mistake
one adapter wider, and it is wrong under `journal-replay` and `mirror-async`, where `send` goes to
the primary only and genuinely would throw. **The answer to "can a command reach CasparCG right
now?" has exactly one owner, and it is the bridge.** The fix is for the bridge to publish that
answer (it already computes it) and for the renderer to render it — not for the renderer to derive
it better.

⚠ Note for whoever takes it: `#noServerReachable()` is itself strategy-blind, so under
`journal-replay` it can answer "reachable" for a command that will fail on the dead primary. That is
a real second question and belongs in the same fix's design, not in a separate item — but it must
not become the reason to leave the renderer's copy in place.

**Regression test:** `apps/runtime/tests/reachBootWindow.dom.test.ts` is the right neighbour — a
case with `primary: disconnected` + `backup: healthy` asserting the verbs are ENABLED, plus a
bridge-side test that a take under that health lands on the backup.

- **Cross-refs:** [[R-006]] (the archived acceptance this breaks), [[B-056]] (the bug that
  established the rule, and which the bridge's own comment cites), [[B-170]] (the other half of the
  failover story — what happens after you press it), [[B-100]]/[[B-101]] (the same
  one-predicate-one-owner rule, from the other direction).

## [ ] B-172 — the failover banner is ALARM RED for a failover that SUCCEEDED, and it is a hard-coded hex on a full-width slab ⟨priority: medium — red is this product's alarm colour and a completed manual failover is information⟩ — OPEN, filed 2026-08-24 from the two-server plant run

**What the owner saw, on the plant.**

> _"The failover banner is RED although the failover SUCCEEDED."_

**The mechanism, from the code** (`apps/runtime/src/renderer/features/connections/FailoverBanner.tsx`):
the banner has ONE style. `background: '#7F1D1D'`, `borderBottom: '1px solid #B91C1C'`,
`role="alert"`, hard-coded, painted identically for all three things it renders:

| situation                                | what it means                      | painted |
| ---------------------------------------- | ---------------------------------- | ------- |
| `lastFailover.reason === 'manual'`       | the operator did it, and it worked | red     |
| `lastFailover.reason` is an auto reason  | the system did it — worth noticing | red     |
| `primary.state` is degraded/disconnected | a genuine alarm                    | red     |

The message function already distinguishes the first two (`'Manual failover'` vs `'Auto-failover'`);
only the colour refuses to.

### ⚠ Constraints checked before proposing anything — because the owner asked, and one of them could not be found

- **`R-006` says nothing about this banner's colour.** What it constrains is the TEST MODE banner
  ("a persistent full-width TEST MODE banner states nothing is on air") and, decisively, that no
  surface may claim a healthy link or a broadcast-red ON AIR that is not real. **Nothing in R-006
  requires or forbids red here.** Its spirit points the other way: red is reserved for real air
  claims and real alarms, so spending it on a successful operator action is the dilution R-006 is
  about.
- **The `CommandToast` file records that `role="alert"` is deliberately NOT unique** — _"the
  connection banner is deliberately an alert too ('nothing can reach air' IS an alert)"_. That
  justifies `role="alert"` for the UNHEALTHY-primary case. It does not reach the completed-failover
  case.
- ❌ **The owner's cited constraints — one banner at a time, a strip rather than a slab — COULD NOT
  BE VERIFIED. They are not in this repo.** The `connection-alarm-gap` note they were attributed to
  does not exist, and a search of `docs/prd` for that wording returns nothing. They are recorded
  here as **the owner's stated constraints, on their authority**, not as something found: the
  banner is `position: fixed; top/left/right: 0` — a full-width slab — and it is one of several
  top-of-window banners (`BridgeSkewBanner`, `RasterMismatchBanner`, `OrphanLayersBanner`) with no
  arbitration between them. ⚠ **Whoever implements this must get the constraints from the owner
  before designing, not from this paragraph.**

### 🔴 And the colour must come from a TOKEN, not a hex

Three raw hexes in this file (`#7F1D1D`, `#B91C1C`, `#FEF2F2`) are exactly what
`LooksBindingsSection`'s badge note forbids in the same breath as it explains why: _"TOKENS, NEVER
THE HEX … Taking the wrong one compiles, looks identical today, and drifts the day either is
retuned."_ That note also settles the palette question this item raises, because it has already been
answered once for a state badge on the owner's call: **green for on air, violet for PVW, blue
(`colors.ready`) for the normal state** — and a completed failover is a NORMAL state with a piece of
news attached.

**Repro:** declare two servers, press FAILOVER, let it succeed.
**Expected:** an informational strip that says the failover happened and which server is primary
now.
**Actual:** the alarm palette, an `alert` role, and a full-width slab.
**Env:** owner's two-server plant, 2026-08-24. Read entirely from the component; the constraint
search was run and its negative result is reported above rather than assumed.

- **Cross-refs:** [[R-006]] (checked, and it does not constrain this — recorded so the next reader
  does not re-check), [[B-156]] (the precedent for taking a state's own colour, on the owner's
  call), [[B-173]] (the other operator-legibility item from the same run).

## [ ] B-173 — every designed refusal sentence needs 1.5×–2.9× the toast's 4-second life, there is no dismiss control, and a second refusal DESTROYS the first unread ⟨priority: medium — owner's decision: the operator dismisses them, not a timer⟩ — OPEN, filed 2026-08-24 from the two-server plant run

**What the owner saw, on the plant.**

> _"Toasts auto-dismiss while the operator is still reading them."_

**Owner's decision, recorded here as the requirement: the operator dismisses them, not a timer.**

**The mechanism** (`apps/runtime/src/renderer/features/status/CommandToast.tsx`): `DISMISS_MS = 4000`,
a fixed `setTimeout` regardless of message length; **no close button, no click-to-dismiss, no hover
pause**; and `show()` is last-write-wins — it calls `setFeedback` and `clearTimeout` on the previous
timer, so **a second refusal replaces the first message outright.** The component's own doc says
_"Last-write wins; auto-dismisses"_, which is accurate and is the defect.

### 🔴 MEASURED — the product's own sentences against its own budget

This product's error messages name the plate, both numbers and the next action, deliberately. Read
at 200 wpm:

| chars | words | ~read time | vs the 4 s budget | message                                                |
| ----- | ----- | ---------- | ----------------- | ------------------------------------------------------ |
| 207   | 38    | ~11.4 s    | **2.9×**          | `setActiveLook` — `CG UPDATE` refused                  |
| 189   | 34    | ~10.2 s    | **2.5×**          | `#applyLivePlates` — the PLAY landed, the rest did not |
| 168   | 32    | ~9.6 s     | **2.4×**          | `RESTORE_BLOCKED_REASON`                               |
| 131   | 24    | ~7.2 s     | **1.8×**          | `CASPAR_CONNECTING_REASON`                             |
| 113   | 21    | ~6.3 s     | **1.6×**          | `setActiveLook` — disconnected                         |
| 109   | 20    | ~6.0 s     | **1.5×**          | `CASPAR_UNREACHABLE_REASON`                            |

**Not one of them fits.** The shortest needs half again the budget; the one an operator most needs
to read — the half-switch message that tells them the fills moved and the holes did not, and to
re-issue — needs nearly three times it.

⚠ **The last-write-wins half is the more dangerous of the two and is easy to miss.** [[B-166]]'s
scenario produces a refusal; the operator's natural next act is to press again, which produces a
second refusal that **erases the first before it has been read.** A timer at least expires
predictably; this loses a message to the operator's own attempt to fix things.

**Repro:** trigger any refusal on a row; start reading. Trigger a second within 4 s.
**Expected:** the message stays until the operator dismisses it; a second message does not destroy
an unread first.
**Actual:** 4 s, no control, and the second replaces the first.
**Env:** owner's two-server plant, 2026-08-24. The character/word counts and the ratios above are
computed from the strings as they exist in the source; the 200 wpm figure is the assumption and is
stated so it can be argued with.

### What the fix owes beyond removing the timer

- ⚠ **A queue or a stack, not just a longer life.** Removing the timer without addressing
  last-write-wins turns a lost message into a stuck one that hides the next.
- ⚠ **`reportCommandSuccess` shares this surface.** A success toast that never leaves is noise; the
  owner's decision is about the messages an operator must act on. The split is part of the design,
  not an implementation detail.

- **Cross-refs:** [[B-166]] (the refusal whose sentence this loses, and the double-press that erases
  it), [[B-171]] (the wording item — a sentence nobody can finish reading and a sentence that is
  wrong are different defects over the same surface).

## [~] B-174 — the PAGE/MIXER skew is VISIBLE TO THE NAKED EYE on the plant, and the bench figure that made it look impossible measured a DIFFERENT QUANTITY ⟨priority: high — the page half was never measured to a painted frame, and the parts that WERE measured already predict a 1–2 frame skew⟩ — filed 2026-08-24 from the two-server plant run; **RE-SCOPED 2026-08-29 (`SKEW-MEASURE-01`)**; **`k` MEASURED 2026-08-31 (`SKEW-COUNT-01`): 1–3 fields = 20–60 ms**; **FIXED LOCALLY 2026-08-31 (`SKEW-HOLD-01`): page-first + a one-frame mixer hold, `k` re-measured at −20/0/+20 ms — the owner's naked-eye check on the plant is still OWED, see the fix section at the end**

> ⚠ **This heading first read _"against a bench figure that says it is sub-frame … a measured 2.2–8.3 ms
> is being contradicted by air"_.** That framing is a **category error and is corrected below**: the
> 2.2–8.3 ms figure ends at `window.update`, a JS entry point, and lives in **§9.4** — a section headed
> _"Demoted to optional"_ whose own first sentence is _"this decides nothing"_ — not in §9.2 as it was
> cited. **Nothing contradicts anything; the quantity this item is about was never measured.** The
> original text is kept verbatim below, because the owner's sighting and the mechanism it records are
> both sound and only the framing was wrong.

**What the owner confirmed, on the plant.** The page/mixer skew is **visible to the naked eye**.
That is qualitative confirmation that the phenomenon is real; **the frame count is still missing,
and that is the whole of what this item owes.**

### 🔴 Why this is filed as a new number rather than recorded against an existing item

The session was asked to record this against `LOOK-SYNC-01`. **No such item exists** — a `git grep`
for `LOOK-SYNC` across the whole tree returns nothing, and neither does one for `MIRROR-PAGE`. Both
are SESSION-PROMPT labels, not PRD items, and the phenomenon they name had no home in the backlog.
It has one now. **Nothing was lost and nothing was invented: the owner's confirmation is recorded
verbatim above and the mechanism below is the one already written into the source.**

### The phenomenon, and the bench figure it contradicts

A look switch is two mutations on two machines, issued in a fixed order by `setActiveLook`: the
bridge moves the producers' `MIXER FILL`/`CLIP` **first**, then tells the PAGE to move its holes via
`CG UPDATE`. Between the two commands the fills and the holes disagree, and what shows through a
mismatched hole is black.

`setActiveLook`'s own comment states the measurement that made this acceptable:

> _"`CG UPDATE` → `window.update` was measured at 2.2–8.3 ms (median ≈5 ms, §9.2) — under a quarter
> of a 20 ms frame at 50i — and both commands go out back-to-back on ONE connection in the urgent
> lane, so nothing queues between them. The cut itself is ~0.20 frames (§9.3)."_

**A ≈5 ms skew is sub-frame and must not be visible.** The owner sees it. **Either the bench figure
does not transfer to the plant, or the visible artefact is not the skew that figure measures.**
Both are worth knowing and one measurement separates them.

⚠ **Do not "fix" the ordering before measuring.** `setActiveLook` argues fills-first deliberately —
_"a lost `CG UPDATE` leaves the page on a coherent previous look rather than on a new look whose
boxes would never fill"_ — and reversing it on the strength of a naked-eye sighting would trade a
reasoned choice for a guess. **The deliverable here is a number.**

**What to measure:** a look switch at 25 fps on the plant, channel read EMPTY before and after,
reproduced twice, counting the frames in which fills and holes disagree — the same protocol
[[B-155]] already owes for the switch flash, and it can almost certainly be captured in the same
session with the same recording.

⚠ **This is NOT [[B-155]] and the two must not be merged.** B-155's flash requires a PRODUCER CHANGE
inside the switch (a `PLAY`), and an ordinary switch has none. This skew is present in an ordinary,
`PLAY`-free switch — it is the gap between two commands, not a replace. They are separable by the
trace: if the window contains a `PLAY`, it is B-155's; if it contains only `MIXER FILL` then
`CG UPDATE`, it is this one.

**Env:** owner's two-server plant, 2026-08-24 — naked-eye confirmation only. The mechanism and the
2.2–8.3 ms figure are quoted from `tools/caspar-bridge/src/caspar-runtime.ts`; nothing was measured
in this session.

- **Cross-refs:** [[B-155]] (the other artefact in the same window, and the item whose plant
  protocol this shares — read its "what a green suite is not evidence of" section first),
  [[B-167]] (a THIRD way this window goes wrong, by the fills not moving at all).

### 🔴 RE-SCOPED 2026-08-29 (`SKEW-MEASURE-01`) — the "contradiction" is a CATEGORY ERROR, and the bench figure never said what this item quoted it as saying

**Nothing about the owner's sighting is in doubt.** What is wrong is the framing: this item was filed
as _"a measured 2.2–8.3 ms is being contradicted by air"_. **There is nothing to contradict — nobody
ever measured the quantity this item is about.** Four findings, each verified in the tree:

1. 🔴 **The citation is to the wrong section.** The figure is in **§9.4**, not §9.2. §9.2 is
   _"`MIXER FILL … <duration> <tween>` on 2.5.0: ACCEPTED, and which names"_ — the tween vocabulary —
   and contains **zero** occurrences of `window.update`, `2.2` or `8.3`
   (`openspec/changes/multibox-layout-switch/design.md`, §9.2 spans 37 lines; checked by extracting
   the section and grepping it).
2. 🔴 **§9.4 disclaims itself.** Its heading is _"**Demoted to optional** — `CG ADD` → first painted
   frame"_ and its first sentence is _"Family 2 is eliminated, so **this decides nothing**. Recorded
   because it was taken"_. The `CG UPDATE` figure is an aside inside a section that says it decides
   nothing.
3. 🔴 **The endpoint is a JS entry point, not a frame.** §9.4 says `CG UPDATE` → `window.update`
   **2.2–8.3 ms (median ≈5 ms, sub-frame)**. The mixer half lands on a **channel frame**; the page
   half must still pass style, layout, paint, CEF's off-screen render and CEF's handoff. **The two
   are different quantities and were never comparable.**
   ⭐ **And the same section proves the harness COULD have measured paint**: its headline reading is
   `CG ADD` → **first painted frame**, median **70.2 ms**, using the double-`requestAnimationFrame`
   "first committed frame" definition §9.6 describes. Paint was measured for the OTHER quantity and
   not for this one.
4. ⚠ **"under a quarter of a 20 ms frame at 50i" is wrong on its own terms**, and it was added by the
   quoting comment rather than by §9.4. §9.2 establishes **25 fps** (_"Measured duration ≈ 2000 ms for
   50 frames confirms 25 fps (frames, not fields)"_), §9.3 tabulates _"in frames @ 25 fps"_, and §9.6
   names the channel `1080i5000`. At 1080i50 the **frame** period is **40 ms**; 20 ms is the **field**
   period. (This error runs in the claim's favour, which is why nobody caught it.)

⇒ **This item does not owe an explanation of a contradiction. It owes the measurement that was never
taken:** `CG UPDATE` → the page's first COMMITTED FRAME, and then to air.

### What was ruled OUT, in code rather than on the owner's scene

- **A tween on one side only: DEAD, in code.** `CommandBuilder.mixerFit`
  (`tools/caspar-bridge/src/command-builder.ts:316`) emits exactly
  `MIXER <t> FILL <rect>` and `MIXER <t> CLIP <rect>` — **no duration, no tween, ever**. The page side
  sets `mask-*` properties directly (`packages/template-runtime/src/live-source-punch.ts:26-33`) with
  **no CSS transition declared**. So neither side eases, and §9.2's 36 px / 580–835 px curve-mismatch
  trap — real, and worth keeping for the day either side animates — **cannot be this artefact.** This
  is stronger than the owner's export showed: his scene has no `tween` and all looks are `cut`, which
  rules it out _there_; the code rules it out _everywhere_.
- **"The mask rebuild is the lag": DEAD, measured.** The holes ARE computed in the browser (nothing
  mask-shaped is serialised — confirmed, `liveSourceMask` / `MaskHole[]` are declared in `scene.ts`
  and built by `sceneMaskHoles`, and the owner's export contains no `mask`). But the whole recompute
  is **sub-millisecond**. Measured on the owner's scene shape (3 looks; 1, 2 and 3 plates), jsdom,
  medians:

  | scene      | `flattenElements` | `liveArrangementView` | `sceneMaskHoles` | total       |
  | ---------- | ----------------- | --------------------- | ---------------- | ----------- |
  | +0 decor   | 0.014 ms          | 0.008 ms              | 0.011 ms         | **0.03 ms** |
  | +50 decor  | 0.013 ms          | 0.059 ms              | 0.022 ms         | **0.09 ms** |
  | +200 decor | 0.032 ms          | 0.203 ms              | 0.062 ms         | **0.30 ms** |
  | +500 decor | 0.074 ms          | 0.561 ms              | 0.117 ms         | **0.75 ms** |

  Against a 40 ms frame, **the compute is not the lag at any plausible scene size.**
  ⚠ It _does_ recompute more than it needs — `liveArrangementView` calls `flattenElements(scene)` on
  **every** repunch to build an `authored` map that depends only on the static scene
  (`packages/template-runtime/src/arrangement-view.ts:41`) — so it is a real (small) waste and the
  reason the middle column grows with scene size. **Worth tidying; not worth blaming.**
  ⚠ **A hypothesis this session raised and KILLED before publishing it:** `repunch`'s comment says it
  "reads the page's CURRENT layout back", which reads like a forced synchronous reflow between a DOM
  write and a read. It is not — `liveArrangementView` reads `node.style.*` (**inline** style), never
  `getBoundingClientRect` / `getComputedStyle`, and the runtime contains no such call on this path.
  **No forced layout occurs.**

- **"Something serialises ahead of `#tellPageLook`": the transport claim HOLDS.** Both halves send at
  priority `'urgent'` — the reconcile's `mixerFit` lines at `caspar-runtime.ts:5626` and `:5736`, and
  `#tellPageLook` at `:4943` — so nothing of lower priority queues between them.

### 🔴 What IS left, enumerated hop by hop — and it already predicts a visible skew

**MIXER path:** `MIXER FILL`/`CLIP` ACKed → applied at the next channel frame. §9.3 measured a
3→2-box cut's five commands at **median 8.16 ms, range 6.86–17.93 ms** command-side — comfortably
inside one 40 ms frame, so **the picture switches in ONE frame.**

**PAGE path**, in order, with what is known about each:

| #   | hop                                                                                           | cost                          |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| a   | the bridge AWAITS every reconcile ACK before `#tellPageLook` is called at all                 | **6.86–17.93 ms** (§9.3)      |
| b   | `CG UPDATE` on the wire → `window.update`                                                     | **2.2–8.3 ms** (§9.4)         |
| c   | JS: `applyArrangementToNodes` + `liveArrangementView` + `sceneMaskHoles` + 8–10 `setProperty` | **≈0.1 ms** (measured, above) |
| d   | style recalc + layout + paint → first COMMITTED frame                                         | see below                     |
| e   | CEF's off-screen render tick                                                                  | 🔴 **NOT MEASURED**           |
| f   | CEF → CasparCG frame handoff                                                                  | 🔴 **NOT MEASURED**           |
| g   | lands at the next channel frame boundary                                                      | quantised to 40 ms            |

**(a) + (b) alone is 9.1–26.2 ms** — between a quarter and two-thirds of a 40 ms frame — **spent
before the page has been told anything.** That is the term this item's quoted figure omitted
entirely, and it is bigger than the figure it quoted.

**(d), measured locally in the repo's Chromium** (system Chrome; the bundled build is not installed
here, the geo-block CLAUDE.md records), writing the exact `mask-*` property set the runtime writes,
on a 1920×1080 page with 120 decor nodes, endpoint = double-`requestAnimationFrame` **first committed
frame** — the same definition §9.6 used:

| plates | JS write | write → committed frame  |
| ------ | -------- | ------------------------ |
| 1      | 0.00 ms  | **26.70 ms** (p95 26.90) |
| 3      | 0.00 ms  | **26.80 ms** (p95 26.90) |
| 6      | 0.10 ms  | **26.80 ms** (p95 28.20) |

🔴 **Read this correctly: ~26.8 ms is the FRAME CADENCE, not the work.** At a 60 Hz vsync a
write-then-double-rAF lands 1–2 intervals later (16.7–33.3 ms), and the number is **flat across 1, 3
and 6 plates** — which is the proof that the style/layout/paint _work_ is small and that the wait is
quantisation. **The page's hole update is therefore quantised to the page's own frame clock**, and
that quantisation, not the compute, is the page half's dominant term.

⇒ **Predicted, from measured parts only:** mixer lands on frame N; the page is told 9–26 ms into that
frame, does ~0.1 ms of work, and then waits for its own next committed frame and CEF's handoff — so
the holes land on **frame N+1, and N+2 whenever (a)+(b) plus the page tick crosses a second
boundary.** At 1080i50 that is **40–80 ms**. **That is plainly visible, and it is consistent with
everything the owner reports.** Nothing here requires the bench figure to have been wrong — only for
it to have been about something else.

### Candidate fixes, with costs — NONE implemented, the owner chooses

| candidate                                                                                     | cost                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delay the mixer** by a fixed offset so the fills land with the holes                        | Cheapest, and it is a GUESS calibrated to one plant: the page-side term is a frame quantisation plus an unmeasured CEF handoff, so the right offset is neither constant nor knowable from the bridge. Wrong offset = skew in the other direction, which looks identical and is no better.                                                                                                                                         |
| **Page acknowledgement gating the mixer** — page confirms it has painted, then the fills move | Correct in principle and the only one that adapts. Costs a new page→bridge round trip on the switch path, ADDS its own latency to a window this item exists to shorten, and needs a defined failure mode when the ack never comes (fall back to today's order, or the switch does not happen). ⚠ Reversing the ORDER is what `setActiveLook` argues against on air-safety grounds — a gate must preserve "fills only on success". |
| **One tweened timeline driving both**                                                         | Structurally the real answer, and the most expensive: it needs a shared origin and a shared tick, which `live-source-multibox` §6 states the two sides do not have. §9.2's curve table is the prerequisite (`linear` on both sides is the only exactly-matchable pair, 0.0 px). Turns a cut into an animation, which is a product change, not a fix.                                                                              |

**Which I would pick, in two lines:** none of the three yet — **the frame count decides between them,
and it is one recording away.** If forced today: the **page acknowledgement**, because it is the only
candidate that does not encode a per-plant constant, and because its cost is a round trip on a path
that is already awaiting several.

### The ONE plant recording that closes this, `B-155` and the audio measurement together

Same visit, same capture, channel read EMPTY before and after, `2.5.0` build asserted:

1. **SDI/channel-side capture at 1080i50**, frame-stepped — this item's whole deliverable is the count
   of frames in which fills and holes disagree, reproduced twice.
2. **A `PLAY`-free look switch** — that separates this item from [[B-155]] by construction: `PLAY` in
   the window ⇒ `B-155`; only `MIXER FILL` then `CG UPDATE` ⇒ this item. Capture one of each and both
   items are answered from one recording.
3. **The AMCP trace alongside**, timestamped on one clock (the committed harness already does this),
   so each visible frame can be attributed to a command.
4. ⚠ The brief also names an outstanding **audio walk** as riding this visit. **A distinct PRD anchor
   for it was not found** by this session — whoever plans the visit should confirm it exists before
   counting on it; `B-155`'s owed plant measurement was verified and does share this recording.

**Env for the measurements above:** local, 2026-08-29. jsdom for the compute table; system Chrome
(Playwright, `channel: 'chrome'`) for the paint table, at 60 Hz — **not CEF, and not at the channel
rate**, which is exactly why (e) and (f) remain unmeasured.

### ⭐ MEASURED 2026-08-31 (`SKEW-COUNT-01`) — `k` = 1–3 fields (20–60 ms) at `1080i5000`, median 30 ms, from TEN recorded switches on the owner's machine

The frame count this item owed now exists, produced automatically by a committed harness
(**`tools/skew-harness`** — one command, see its README) against the real local
2.5.0 `69e8ad5`: the CHANNEL recorded to a file through a second consumer, ONE look switch
per run driven through `setActiveLook` (never hand-typed AMCP), the two transitions found by
pixel comparison, and every run's window classified by a transparent TCP tap on the AMCP
socket. `report.json` per sweep is committed under `tools/skew-harness/evidence/`.

**Why recording the channel to a file measures `k` exactly — verified, not assumed.** In
`v2.5.0-stable` source, `video_channel.cpp`'s tick calls the stage once, composites EVERY
layer's frame in `mixer_(stage_frames.frames, …)` into ONE `const_frame`, and hands that same
frame to `output_(…)`, which fans it to ALL consumers; the DeckLink/SDI hop is strictly
downstream of compositing. So the skew is fully formed in the composited sequence and any
consumer replays it. Confirmed empirically here too: **two file consumers attached at once
recorded 75/75 frames byte-identical** over a 1.5 s window.

**The channel mode, and the interlace fact that sets `k`'s unit.** This machine's config is
`1080p5000`; the harness flips it to **`1080i5000` at runtime (`SET 1 MODE` → `202 OK`),
measures there, and restores it**. Two server facts matter and were verified in source +
on the wire:

- `INFO <ch>` reports `framerate` **50 in BOTH modes** — `video_channel` publishes
  `framerate × field_count`, i.e. the FIELD rate. Never derive the frame period from it.
- `stage.cpp` pulls BOTH fields inside one 25 Hz tick — _"it lets us tick at 25hz and avoids
  amcp changes starting on the second field"_ — so a `MIXER FILL` lands **tick-aligned
  (40 ms granularity)**, while the recorded file carries both fields at 50 fps. Measured:
  the mixer transition always lands on one parity; **the page's repunch can land on the OFF
  field** (odd offsets observed), because the html producer pops a fresh CEF buffer per
  field. `k` is therefore counted in 20 ms FIELDS below, the finest unit air actually shows.

**The distribution — min / median / max, never a single value:**

| mode                  | `k` per run (fields = 20 ms each) | ms             | min / median / max  |
| --------------------- | --------------------------------- | -------------- | ------------------- |
| `1080i5000` (10 runs) | 1, 1, 1, 1, 1, 2, 3, 3, 3, 3      | 20×5, 40, 60×4 | **20 / 30 / 60 ms** |
| `1080p5000` (6 runs)  | 1, 1, 1, 1, 2, 2 (frames = 20 ms) | 20×4, 40×2     | **20 / 20 / 40 ms** |

Every run's wire window was verified `PLAY`-free — exactly `MIXER FILL`+`CLIP` per plate then
one `CG UPDATE` — and every recording passed a per-run cadence guard (frames = wall-clock ÷
period; a run that slips is DISCARDED, never rounded). **The two modes agree in WALL-CLOCK
terms (~20–60 ms) rather than in tick counts** — the page half lags by its own frame clock
plus the command gap, which is the §-hop prediction of the re-scope section confirmed at its
small end: mixer on frame N, holes one-to-two frame periods later.

**The probes, and what would make them wrong.** Probe A sits strictly inside the
INTERSECTION of one plate's hole across both looks (≥60 px from every hole edge of either
look), over a static high-contrast pattern whose mapping changes wildly with the box shape
(`cover`, wide-banner → tall-column) — it fires when the FILLS move. Probe B sits inside the
entering look's hole and ≥60 px clear of EVERY hole of the outgoing look, over the painted
background — it fires when the PAGE repunches. A probe touching a hole edge would fire on
both transitions and read `k = 0`; placement is machine-checked (`probePlacementIssues`,
asserted in unit tests AND re-run before each sweep). The source clips are STATIC because a
moving source changes probe A every frame and destroys first-change detection. Frame 44 of
run 00 (`evidence/2026-08-31-i5000`) is the artefact itself, on disk: holes at the banner
look, fills at the column look, black through the mismatch.

**Caveats, stated rather than hidden.** This machine has no DeckLink and no genlock (the
channel demonstrably slips on >2 s recording windows — the harness stays inside the verified
regime); CEF here shares a desktop GPU with the recording encoder. The mechanism and the
quantisation are the server's own and transfer; the exact medians on the plant may shift by
a field, which the SAME harness pointed at the plant server would settle from the studio.

### 🔴 What the measured `k` SELECTS — argued, NOT implemented; the owner chooses

- ⭐ **Mixer delay, parameter = 1 channel frame.** `k` is literally its parameter, and the
  measured `k` clusters at one frame period (median 30 ms at `1080i5000`, i.e. between one
  field and one frame). A one-frame hold on the mixer pair centres the distribution on zero:
  worst-case misalignment drops from 3 fields to 1, in either direction. It cannot reach
  zero — the residual ±1-field jitter is CLOCK QUANTISATION (the page's paint clock vs the
  channel tick), which no fixed offset removes.
  **How a real delay would be expressed:** 🔴 a tween is NOT a delay (`MIXER FILL … <frames>
<tween>` animates; the looks are entered with a cut), and mainline 2.5.0 has **no
  scheduling verb at all** — verified against `v2.5.0-stable`'s `AMCPCommandsImpl.cpp`: zero
  matches for "schedule"; `MIXER … DEFER`/`COMMIT` exists but is ATOMICITY (a
  `deferred_transforms_` list applied on `COMMIT`), not timing. So the delay lives in the
  BRIDGE: `setActiveLook` holds the `MIXER FILL`/`CLIP` pair one frame period on its own
  timer while keeping the fills-only-on-success semantics. (`DEFER` the fills + `COMMIT`
  after the page paints is a viable spelling of the ACK candidate, not of this one — §3b's
  COMMIT-scope question still gates it.)
- **Page-acknowledgement gating the mixer** — the measurement WEAKENS this candidate: its
  own costing said _"at `k=1` it may cost more than it saves"_, and `k` IS ~1. The ack
  cannot be sent before the page's committed frame (double-rAF ≈ 1–2 page frames) plus a
  page→bridge trip that does not exist today, so the fills would land 1–2 frames AFTER the
  holes — the same artefact, mirrored.
- **One tweened timeline driving both** — unchanged by the number: structurally right, most
  expensive, and turns the cut into an animation, which is a product decision rather than a
  fix.

**Nothing was implemented.** The number, the harness and this argument are the whole of
`SKEW-COUNT-01`'s deliverable.

- **Cross-refs (measurement):** [[B-155]] (same harness, `--with-play-switch` — its window
  measured separately, 80 ms locally, plant still owed), [[B-189]] (found by this harness's
  wire tap: the channel-mode read discards every real `INFO` reply and re-sends forever).

### ⭐ FIXED LOCALLY 2026-08-31 (`SKEW-HOLD-01`) — the mixer hold, implemented; `k` re-measured at −20/0/+20 ms

**The order `setActiveLook` now drives, stated exactly** (`tools/caspar-bridge/src/caspar-runtime.ts`,
the `B-174` order note in the method body):

1. **PLAN** — `#planLiveSeating`, unchanged and still byte-identical to the swap's. Every refusal
   the bridge can detect without applying (unknown look, unresolvable source through the product's
   own doors, collision, band) fires HERE, with the page untouched.
2. **TELL THE PAGE** — `#tellPageLook`, moved BEFORE the apply via a `beforeApply` seam on
   `reconcileLivePlates` (one injection point on the one path every switch command already flows
   through, never a second code path). It carries the PLAN's fit facts explicitly — `#plateFits`
   is still written only when an apply lands — and a refused `CG UPDATE` **aborts the switch
   before any geometry command**: nothing moves at all, which is STRONGER than the old order's
   lost-tell tail state (moved fills under unmoved holes).
3. **HOLD** — the bridge sleeps `lookMixerHoldMs`: **configurable** (`--look-mixer-hold-ms`,
   `BridgeOptions.lookMixerHoldMs`, the runtime option; `0` = no hold, order kept), **defaulting
   to ONE CHANNEL FRAME of the channel's OBSERVED video mode** (`videoModeFramePeriodMs`,
   `@cg/shared-ipc` — readable at all because [[B-189]] is fixed in the same change), 40 ms
   fallback while the mode is unread. The rate suffix must be 4–5 digits: a custom mode id spelled
   `1080p50` divides to 0.5 Hz and would have parked the mixer for TWO SECONDS, so a token outside
   the ×100 convention is UNREAD and takes the fallback. `#withLiveSeatLock` still spans the whole
   span, so no other GATED verb interleaves — but `take`/`out`/`stopItem`/`clearAll` are
   deliberately un-gated, which is why step 3 ends with a re-check.
4. **RE-ASK, THEN MOVE THE FILLS** — before the apply, the hook re-asks the two facts the plan
   rests on (the row still owns live seats; the ledger still holds the records planned against)
   and abandons the switch if either was true and is now false. Only that transition aborts, so
   the off-air path is untouched. Without it, an `out` landing inside the hold left the apply
   re-`PLAY`ing the whole union pre-seat onto the layers `out` had just cleared and
   `registerLiveLayers` resurrecting a ledger for a row the stack believes idle — [[B-161]]'s
   shape, reached with no take. Then `#applyLivePlates`, unchanged. On a wire-refused line,
   `B-166`'s all-or-nothing geometry rollback runs as before AND `setActiveLook` **re-tells the
   previous look** through the same fused writer, so the record follows whichever tell last landed
   and the page does not END on a look the switch did not perform. ⚠ Where that revert tell is
   itself refused, the record follows the PAGE (what the audience sees) and the message says so;
   the next reconcile converges the fills. Both tails are pinned in `look-switch-refusal`.

**Why this does not merely shift both halves:** the page's notification moved EARLIER (it no
longer waits for the fills' ACKs), and only the mixer's application moved later. Measured, same
harness, same probes, `1080i5000`, ten runs each:

| sweep                                        | `k` per run (fields, 20 ms each)   | min / median / max   |
| -------------------------------------------- | ---------------------------------- | -------------------- |
| BEFORE (`SKEW-COUNT-01`, quiet box)          | 1, 1, 1, 1, 1, 2, 3, 3, 3, 3       | **20 / 30 / 60 ms**  |
| BEFORE (re-run this session, box under load) | 1, 2, 3, 3, 3, 3, 3, 5, 5, 7       | 20 / 60 / 140 ms     |
| **AFTER (hold in force, quiet box)**         | −1, −1, −1, −1, 0, 0, 0, 0, +1, +1 | **−20 / 0 / +20 ms** |

This session's two sweeps are committed beside the harness, so the numbers can be re-read rather
than believed: `tools/skew-harness/evidence/2026-08-31-hold-before/report.json` (row 2) and
`…/2026-08-31-hold-after/report.json` (row 3); `SKEW-COUNT-01`'s own report is the already-tracked
`…/2026-08-31-i5000/report.json` (row 1).

The fair pairing is quiet-to-quiet; the loaded re-run is kept because it shows `k` is
load-sensitive on this ungenlocked dev box, which the plant (genlocked, dedicated) is not
expected to reproduce. The AFTER residual is ±1 FIELD, zero-centred — the page's paint clock
against the channel tick, which **no fixed hold can remove**; a bigger or adaptive hold buys
nothing further.

⚠ **The mode caveat, recorded as the brief asks:** the page lag is constant in WALL-CLOCK (the
two modes agreed in ms, not in ticks), but the hold is denominated in whole channel frames — so
the derived default is per-mode (40 ms at `1080i5000`, 20 ms at `1080p5000`) and is right for
`1080i5000` SPECIFICALLY because that is the plant's mode and the measured lag (~20–60 ms) spans
about one of its frames. ⚠ The switch as a whole now lands ~one frame later on air — expected,
harmless (nothing compares against a reference), and written here so it is read, not discovered.

⚠ **The stopped/off-air path is byte-untouched** — stated because a separate off-air defect
(stopped row: switch look, then PLAY → fills at the OLD arrangement under NEW holes) is being
filed while this change lands. The reorder lives entirely inside the on-air branch's
reconcile-and-tell; the off-air record-only early return, the take path, and the `CG ADD`
look payload are unchanged, so the two changes do not collide.

**CI, on the commit that carries the change (`e3c60f00`):**
[run 33403122456](https://github.com/yasermostafaee/cg/actions/runs/33403122456) — `conclusion:
success`, with the `E2E (Playwright)` job's own conclusion `success` (it RAN, it was not skipped).
The Linux `e2e` debt is DISCHARGED; what remains below is a HARDWARE reading, which no CI can take.

**What is still OWED, and why the box is `[~]`:** the owner's naked-eye check on the PLANT — the
same two-look switch that was visibly skewed on 2026-08-24, now expected to move together.
A dev-box distribution is the acceptance criterion this session was given and it is met; the
plant's genlocked DeckLink chain and its CEF host are still different hardware, and `SKEW-COUNT-01`'s
caveat that medians may shift by a field there stands until someone looks.

### MEASURED 2026-08-31 (`SKEW-RESIDUE-01`) — what the residue IS, and the two axes swept. NOTHING implemented

The owner, after the hold shipped: _"There's still a small delay when switching looks. Sometimes it
isn't there at all; repeating it several times, sometimes yes and sometimes no, but very small."_ and
_"Both directions are bad. When there is no black, the hole appears quickly but the previous boxes are
still there. When the hole goes later, black is visible."_

The first half is the measured distribution in words: `-20/0/+20 ms` means a field early, exact, or a
field late, **random per switch**, because the page's paint clock has no fixed phase against the
channel tick. **No constant hold can remove that.** The second half is what this session quantified.

#### 1. What is on screen during the mismatch, by direction

`tools/skew-harness --classify` now reads the WHOLE frame, not two probes, and classifies every pixel
of the window against the recording's own settled states: **transient black** (an open mask over no
picture), **misplaced picture** (still showing the outgoing look where the entering look shows
otherwise) and **other** (neither — hole edges, codec, anything the rule does not cover). Ten runs,
`1080i5000`, two looks, flat background; the per-run CONTROL (the classifier run on the settled
frames either side) came back **≤ 0.04 %** on every run, which is what says these numbers describe
the switch rather than the instrument.

| direction                   | runs | BLACK, peak % of frame | BLACK visible | MISPLACED, peak % of frame | MISPLACED visible |
| --------------------------- | ---- | ---------------------- | ------------- | -------------------------- | ----------------- |
| **hole-early** (k = −20 ms) | 6/10 | **15.9 %**             | 20 ms         | **37.4 %**                 | 20 ms             |
| **exact** (k = 0)           | 2/10 | 0                      | —             | 0                          | —                 |
| **hole-late** (k = +20 ms)  | 2/10 | **2.3 %**              | 20 ms         | **15.8 %**                 | 20 ms             |

🔴 **The two directions are NOT equally bad, and the worse one is the one this fixture produces most
often.** Hole-early puts **seven times** the black on air (15.9 % against 2.3 %) and more than twice
the misplaced picture. Frames on disk, both opened and confirmed by eye:
`evidence/2026-08-31-residue-flat-2looks/skew-02-black.png` (hole-early: the column holes open with
the banner pictures still in them — the top strip of each hole is picture, the bottom two-thirds is
BLACK) and `.../skew-00-black.png` (hole-late: the banner holes still open with the column pictures
inside them — a black bar between the two, no black anywhere else).

⚠ `k = 0` is not "small"; it is **nothing at all**. The mismatch window is `[min, max − 1]` frames,
which is EMPTY when both halves land on one frame — measured, not assumed (the classifier's own
`k = 0` runs report zero of every class).

#### 2. The two axes nobody had swept

**PAGE CONTENT — real, and it is where the residue lives.** A full-frame `<video>` decoding every
frame behind the same scene (a real scene element through the runtime's own `assetUrls` seam, still
content plus one moving patch as the decoder's positive control — visible in every recorded frame):

| scene                                    | k min / median / max   |
| ---------------------------------------- | ---------------------- |
| flat background, 2 looks                 | **−20 / −20 / +20 ms** |
| **full-frame video background**, 2 looks | **0 / +20 / +60 ms**   |

The whole distribution moves LATE by about one channel frame, and the hole-early half disappears:
4 runs exact, 4 hole-late, none early. **The 40 ms hold was tuned against a page with nothing to do;
a page with a video behind it lands one to one-and-a-half frames after the fills.**

**NUMBER OF LOOKS — no effect, and this contradicts the owner's report.** Filler looks are built from
the SAME two plates (so the union pre-seat and every wire command are identical) and are never
entered; the measured switch is always banner → column:

| looks                                                | k min / median / max |
| ---------------------------------------------------- | -------------------- |
| 2                                                    | −20 / −20 / +20 ms   |
| 3                                                    | −20 / −20 / +20 ms   |
| 4                                                    | −20 / −10 / +20 ms   |
| 4, each filler carrying a full-frame panel + 8 boxes | −20 / −20 / +20 ms   |

⇒ **`k` does not grow with look count**, even when the extra looks carry real content. The owner's
1-box/2-box/3-box template most likely got worse for the axis ABOVE — its looks carry page content —
rather than for the count. ⚠ Worth re-asking him what those looks contained before spending on this.

#### 3. How an inactive look is hidden, and what `display:none` is worth

**It is already `display: none`** — `applyArrangementToNodes` writes `node.style.display = on ? '' :
'none'` (`packages/template-runtime/src/arrangement-view.ts`), driven by the one `resolveVisibilityOf`
predicate, and `B-150`'s `LookMediaPark` additionally pauses and silences the drivers inside a hidden
look. So an inactive look is out of the layout and paint cycle entirely: the premise that the page
"carries every look's full-frame subtree at once" is true of the DOM and false of the frame budget.

Measured rather than argued: with the hiding switched to `visibility: hidden` (a TEMPORARY local
patch, reverted — `git diff` on that file is empty) and four heavy looks, `k` read
**−20 / −10 / +20 ms** against `display: none`'s **−20 / −20 / +20**. No measurable difference on this
fixture: at four looks the page has headroom either way, which is the same reason the look-count
sweep is flat.

⚠ **The repunch traverses ALL looks**: `sceneMaskHoles` calls `flattenElements(scene, 'paint')` over
the whole scene and only then filters by on-screen-ness, so its cost grows with look count — but the
sweep says that cost stays under one field at four looks.

#### 4. Which remedy the data supports

1. 🥇 **INTERSECTION MASK during the transition window** — punch `old ∩ new` for the window so every
   open pixel is backed by a picture in both arrangements. It is the only candidate that removes BOTH
   classes in BOTH directions, and the data says the worst direction costs **15.9 % of the frame
   black plus 37.4 % misplaced** for one field. Its cost is a smaller picture for that same field.
   ⚠ **The empty-intersection edge case, captured rather than reasoned about**: two looks that do not
   overlap punch nothing, and the frame is the template alone —
   `evidence/2026-08-31-residue-empty-intersection/empty-00-after.png`, a flat field with every box
   gone. That is one field of "the boxes blinked", against today's one field of black rectangles
   (`empty-00.png`, the same capture one frame earlier).
   ⚠ **NOT the union**: it enlarges the open area, so the late-hole case gains black rather than
   losing it. Recorded so the idea is not revived.
2. 🥈 **A protocol variant** — _"close to the intersection now, open the new look in N ms"_. The tell
   CAN carry it: `__cg` is a namespace object designed to be extended, one shared codec
   (`packages/shared-schema/src/control-payload.ts`), and unknown members are silently dropped by the
   reader, so an older page ignores a new field instead of failing. But the page does nothing
   time-delayed today — `update()` is `async` with no `await` in its body — and no intersection
   concept exists anywhere in the tree. It is candidate 1 PLUS a timer and a schema change.
3. ❌ **PHASE-LOCK — dead, and the repo already measured why.** Nothing carries a channel frame
   number: OSC's `/channel/N/framerate` is parsed as a RATE, `/foreground/file/frame` was measured
   ABSENT (ADR 0004), `INFO` has no tick index, the bridge's tick tap keeps only a last-arrival
   timestamp and throttles that event to 1 Hz, and the page's whole time base is `rAF` /
   `performance.now()`. 2.5.0 has no scheduling verb. Phase-lock needs a mechanism that exists on
   neither side.

**RECOMMENDATION, in two lines:** take the intersection mask (1). It is the only option that removes
black AND misplaced picture in BOTH directions without inventing a clock, and the number that decides
it is `15.9 % black + 37.4 % misplaced for 20 ms` in the direction this fixture produced six times in
ten — against a cost of one field at the intersection's smaller area.

⚠ **And the hold's default should be re-judged against the page-content number rather than raised on
instinct**: on a light page the distribution straddles zero (a bigger hold would make hole-late
certain), while on a video-backed page it is already a frame short. A constant cannot serve both —
which is the argument for (1) and against tuning.

**CI, on the commit that carries these measurements (`41cd9dc6`):**
[run 33419204741](https://github.com/yasermostafaee/cg/actions/runs/33419204741) — `conclusion:
success`, with the `E2E (Playwright)` job's own conclusion `success` (it RAN; it was not skipped),
alongside `Lint • Typecheck • Test • Build`. The Linux `e2e` debt for this session is DISCHARGED.

**Evidence:** `tools/skew-harness/evidence/2026-08-31-residue-*/report.json` — `flat-2looks`,
`video-2looks`, `flat-3looks`, `flat-4looks`, `flat-4looks-heavy`, `visibility-4looks`,
`empty-intersection`. ⚠ The `.png` frames named above sit beside those reports and are GITIGNORED,
like the `.mkv` recordings and for the same reason (a pattern frame is ~750 KB): they are on the
machine that took them. The `report.json` files carry every number, including the per-frame series. The instrument gained a SEPARATION GUARD in this session: a crossing must reach
40 % of what that probe settled between its two states, because the video background's own codec
noise produced a crossing of 6.3 against a settled delta of 74 and reported `k = −340 ms` beside nine
runs at +40.

- **Cross-refs (fix):** the spec text moved with the code per spec discipline —
  `openspec/changes/multibox-layout-switch/specs/runtime-multibox-layout/spec.md` (the switching
  requirement), `tasks.md` 6.7/7.9 (dated amendments), `design.md` §2.9; [[B-158]] (its
  fills-first mechanism section carries a dated re-judge note), [[B-166]]/[[B-167]] (the rollback
  this extends with the revert tell — their end-state guarantees are re-asserted in
  `look-switch-refusal` and `live-look-reconcile`), `look-switch-hold.integration.test.ts` (the
  hold's duration, its observed-mode default, an explicit 0 surviving `??`).

## [ ] B-177 — a DeckLink input admits ONE producer, `CLEAR` returns before the destroy, and the failure arrives disguised as `404 File not found.` ⟨priority: high — the seating path re-`PLAY`s live layers, and the disguise sends the diagnosis to the wrong place⟩ — OPEN, filed 2026-08-25 from the DeckLink plant walk

**Observed 2026-08-25** on the production plant (2.5.0 `69e8ad5`, host `192.168.21.114`) while
running [`docs/recon/2026-08-25-decklink-model-walk.md`](../recon/2026-08-25-decklink-model-walk.md).
Two independent instances, nine minutes apart.

**Instance 1 — `CLEAR` immediately followed by `PLAY` on the same layer:**

```
16:01:05.594  CLEAR 1-10                    -> #202 CLEAR OK
16:01:05.604  PLAY 1-10 DECKLINK DEVICE 1
16:01:05.617  [error] EnableVideoInput - DeckLink SDI 4K [1|1080p5000] Could not enable video input.
16:01:05.631  DeckLink SDI 4K [23487013|1080i5000] Destroyed.      <- 14 ms AFTER the failure
```

**Instance 2 — a plain re-`PLAY` over a decklink producer already live on that layer. No `CLEAR`
is involved at all:**

```
16:10:15.776  PLAY 1-10 DECKLINK DEVICE 1   (a decklink producer was ALREADY live on layer 1-10)
16:10:15.858  [error] EnableVideoInput - DeckLink SDI 4K [1|PAL] Could not enable video input.
```

Runs with a **~5 s gap** between `CLEAR` and `PLAY` initialised cleanly **every time**.

**Expected:** re-seating a live source on a layer that already carries it either succeeds, or fails
with an error that says what went wrong.
**Actual:** the producer fails to open, and the operator is told a **file is missing**.
**Env:** CasparCG 2.5.0 `69e8ad5`, DeckLink SDI 4K (index `1`, persistent ID `23487013`), single
SDI input. Not reproducible against `@cg/amcp-mock`, which models `PLAY` as instantaneous and has
no notion of device contention.

### The three facts, from the log rather than from reasoning

1. **`CLEAR` answers `202` BEFORE the producer is destroyed.** It is an acknowledgement, not a
   destruction receipt. In instance 1 the `Destroyed.` line lands **14 ms after** the `202` — and
   after the failure the `202` invited.
2. **CasparCG constructs the NEW producer before destroying the OLD one** on the same layer. That
   is why instance 2 fails with no `CLEAR` anywhere near it: a plain re-`PLAY` of the same device
   collides **with itself**.
3. ⇒ **Two producers cannot hold one physical input.** So **the same live source cannot be seated
   on two boxes at once** on this hardware. That is a product-level constraint, not a timing bug,
   and no amount of sequencing removes it.

### 🔴 The disguise — this is its own hazard, and arguably the worse half

The console answered:

```
#404 PLAY FAILED
File not found.
```

When the decklink producer throws, CasparCG's producer registry **falls through to the FILE
producer** and reports **that** producer's error. The failure therefore presents as a missing media
file on a command that never mentioned a file.

**Any code that reads a `404` from a live-source `PLAY` as "media missing" will mis-diagnose
DeckLink contention** — and will send the operator to check a file path when the real answer is to
wait for a destroy, or to stop asking one input to serve two boxes. A refusal message naming the
wrong subsystem is worse than a bare failure, because it is actively followed.

⚠ **This also means a `404` is NOT safely readable as "the argument was bad".** Any current or
future preflight that classifies live-source failures by response code needs to know that `404` on
a `DECKLINK` argument is ambiguous.

### What the CODE does today — established by READING, not by guessing

Both questions were answered by reading the seating path. Neither is a hypothesis.

**(1) Does the seating path issue a `CLEAR` and a `PLAY` for the same device without waiting for
the destroy? — YES, and in two distinct ways.**

- **It re-`PLAY`s over an occupied layer with no `CLEAR` at all.** `CasparRuntime.#seatLiveLayers`
  (`tools/caspar-bridge/src/caspar-runtime.ts`, the `else` branch of the `seatUnchanged` test)
  pushes `playSource(...)` straight onto a layer that a previous seat may still hold. **That is
  instance 2 exactly** — the plant reproduced this shape without any teardown involved.
- **`teardownLiveLayers`** (same file) sends `out(slot)` — which is `CLEAR <ch>-<layer>`
  (`command-builder.ts`) — then `mixerClear(slot)`, each `await`ed. 🔴 **The `await` is on the AMCP
  ACK, and fact 1 says the ack precedes the destroy by ~14 ms.** So the code _does_ serialise, and
  serialising is _not_ the same as waiting for the destroy. Nothing in the bridge waits for, or can
  observe, `Destroyed.`.

⚠ **FLAGGED AS A DESIGN DECISION, NOT A FACT — do not let a later reader take this as settled.**
Whether any single flow performs `teardownLiveLayers` and then re-seats **the same device** with no
intervening gap was **not** established here: it depends on take/swap orchestration above these two
methods, and answering it properly means tracing the take path, not grepping. The re-`PLAY` case
above is proven and sufficient to file; the teardown-then-seat case is **plausible and unverified**.

**(2) Can two boxes be assigned the same live source today? — YES. Nothing prevents it.**

`validateSourceAssignments` (`packages/shared-ipc/src/channels/sources.ts`) builds its duplicate key
as `` `${assignment.templateId}\u0000${assignment.plateId}` `` and refuses only a **plate assigned
twice**. **There is no constraint of any kind on two different plates sharing one `sourceId`**, and
none anywhere else in the validator. An operator can assign the same DeckLink source to every box
in a multibox template, the config validates, it persists, and the second seat cannot work on this
hardware.

⚠ **FLAGGED AS A DESIGN DECISION.** Whether that _should_ be refused is genuinely open and is
**not** decided here:

- refusing it at the config boundary is honest but **installation-specific** — a plant with two
  cards, or a `route://`/NDI/stream source, has no such limit, and the validator is shared by every
  installation;
- allowing it and failing at the take is what happens today, except the failure says `File not
found.`;
- a third reading is that one source feeding several boxes should seat **once** and be routed, which
  is a feature rather than a refusal.

**This item does not choose. It records that nothing chooses today.**

### Notes

- **Priority `high` for the DISGUISE and the re-`PLAY`, not for the hardware limit.** The
  one-producer-per-input constraint is physics and is fine once it is known. What is a defect is
  that the product's own seating path can trigger it, and that when it does the operator is told to
  look for a file.
- **No fix is proposed here, deliberately.** A retry, a wait, a serialising gate and a config-time
  refusal are all plausible and they are not equivalent; picking one needs the take-path trace
  flagged above. Filing is the whole of this item.
- ⚠ **`@cg/amcp-mock` cannot reproduce any of this** and its classifier docstring now says so. A
  green suite is not evidence about this class of failure — which is precisely why it took a plant
  visit to find, on a code path that has been green for weeks.
- **Cross-refs:** [[C-021]] arm (a) — its owed on-air pass will meet this; [[C-015]] (the seating
  path); [[C-027]] (parked by the same single-input finding); [[B-155]] (the other defect whose
  evidence only a plant visit produces).
- The number was verified free by the heading sweep immediately before this heading was written:
  highest `B-` heading `B-176`; the duplicate audit printed exactly `B-056` and `B-080` and nothing
  else; a whole-tree `git grep` for `B-177` returned only
  [b-number-registry.md](b-number-registry.md)'s own "next free" pointer, and `B-178` returned
  nothing. Filed in this file per [README.md](README.md)'s routing — a bridge/playout defect, not
  cross-cutting tooling.

---

## [~] B-178 — the Designer's fit control is INERT under a look group: the author writes `fitMode` on the ELEMENT, the wire reads it off a source entry nothing ever writes ⟨priority: high⟩ — FIXED in this session

**What:** a live plate authored `cover` reaches air as `contain`, for **every look-group template
ever exported**. The Designer's fit control writes `fitMode` onto the plate ELEMENT; the look-group
carrier reads it off `lookGroups[].sources[].fitMode`; and **nothing in the product ever writes that
field.** The two never meet, so `resolvePlateFitMode` sees `undefined` at the authored level and
falls through to the `contain` default for every plate.

**The owner's repro, 2026-08-25:** two live plates side by side, left `contain`, right `cover`.
Exported, loaded on the plant, taken. **Both rendered `contain`**, and nothing anywhere said so.

### The evidence, from the artefacts

`CG ADD` payload, plant log 20:28:32 (Tehran):

```
"__cg":{"look":"look-2","plates":{
   "l1":{"aspect":1.7777777777777777,"mode":"contain"},
   "l2":{"aspect":1.7777777777777777,"mode":"contain"}}}
```

The mixer geometry agrees exactly — channel `1920×1080`, boxes `943.6 × 1049.04` and
`938.4 × 1049.04`:

| plate | `FILL` sent          | contain would be     | cover would be      |
| ----- | -------------------- | -------------------- | ------------------- |
| `l1`  | `943.60 × 530.77 px` | `943.60 × 530.77` ✅ | `1864.96 × 1049.04` |
| `l2`  | `938.40 × 527.85 px` | `938.40 × 527.85` ✅ | `1864.96 × 1049.04` |

`FILL` and `CLIP` were **byte-identical** for both — the `contain` signature, since a contained
picture lies wholly inside its box. Under `cover` they must differ.

🔴 **The author's choice IS in the export — this is not a stale template.** The `.vcg`
(`manifest.authoring.exportedAt = 2026-08-25T16:49:47Z`, nine minutes before the take) carries
`fitMode: "cover"` on element `el-1787676336354-663598` in `compositions[1]` — one of the two plates
that went to air.

🔴 **And the carrier the wire is keyed by has no such field:**

```json
"lookGroups[0].sources": [
  { "routeKey": "l1", "dynamic": false },
  { "routeKey": "l2", "dynamic": false }
]
```

`routeKey` and `dynamic`. `__cg.plates` is keyed by exactly those `routeKey`s.

### The chain, confirmed at file:line

⚠ **Every line number in this table is AT `9247e7cd`, the commit that carried the bug** — this is a
diagnosis of the shipped state, so the pre-fix anchors are the evidence and re-pointing them at the
repaired code would destroy it. Rows 4–7 no longer describe the tree; read them with
`git show 9247e7cd:<path>`. The anchors elsewhere in this item, and all of `B-179`'s, describe the
CURRENT tree and are named by symbol where the line is volatile.

| #   | site                                                                 | what it does                                                                                                                                    |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/designer/src/renderer/features/inspector/StyleSection.tsx:805` | `updateElement(id, { fitMode: value })` — onto the **ELEMENT**                                                                                  |
| 2   | `apps/designer/src/renderer/state/slices/looks.ts:110`               | `sources: [...group.sources, { routeKey: key, dynamic: false }]` — the **only** creator of a `LookSource`, writing neither field                |
| 3   | `apps/designer/src/renderer/features/inspector/LooksSection.tsx:64`  | the look-group editor's prop type is `{ routeKey, dynamic }` — the UI does not even **model** a fit mode                                        |
| 4   | `packages/vcg-format/src/live-sources.ts:332`                        | reads the never-written `src.fitMode`                                                                                                           |
| 5   | `packages/vcg-format/src/live-sources.ts:299-311`                    | the element loop harvests `el.id` and `flat.rect` and **drops `el.fitMode`**                                                                    |
| 6   | `packages/vcg-format/src/live-sources.ts:363`                        | `lookCarrier === null ? collectLiveSources(scene) : lookCarrier.sources` — mutually exclusive, so the element-reading collector is never called |
| 7   | `tools/caspar-bridge/src/caspar-runtime.ts:4119`                     | `resolvePlateFitMode(override, frame.declaration.fitMode)` — always `undefined` ⇒ `DEFAULT_LIVE_FIT_MODE`                                       |

Two aggravating facts found while confirming it:

- ⚠ **The control renders unconditionally** (`StyleSection.tsx:665`, outside the look-group ternary
  two lines above), so the author operates a live, responsive control that is a silent no-op.
- 🔴 **The wire OUTRANKS the element on the page**, so the element-level fallback cannot rescue it:
  `packages/shared-schema/src/scene-flatten.ts:586` reads `fit?.mode ?? el.fitMode ?? DEFAULT`, and
  `CgPlateFit.mode` is non-optional and always sent. The bridge's `contain` actively overrides an
  element that says `cover`.
- The fault is confined to the AUTHOR's level: the operator's per-assignment override still works
  (`caspar-runtime.ts:4037-4038`).

**Why nothing caught it:** `collectLookCarrier` is exercised only by
`packages/vcg-format/tests/look-carrier.test.ts` and `hidden-look-suppression.test.ts`, and **neither
ever set a fit mode**. The one `C-028` carrier test drives `collectLiveSources` — the no-look path,
where the field was read off the element and worked. **A fixture without a look group cannot see this
bug**, which is exactly how it shipped.

### ⭐ THE DECISION — the mode is PER LOOK, read off the element that serves that routeKey there

The naive fix is to add `fitMode` to `lookGroups[].sources[]` beside `dynamic`, since the wire is
keyed by `routeKey`. **That is wrong, and for the reason `C-028` already gave:** one `routeKey`
appears in EVERY look, in a differently-shaped box each time. `l2` sits in `look-1` and `look-2`; a
per-source mode forces one answer for boxes that may want different ones. It would also require a
NEW per-source Designer control while leaving the existing per-element one inert — two controls for
one concept, which is worse than the bug.

**DECIDED: keep the mode on the ELEMENT, and carry it per LOOK, beside the rects.**

- `TemplateLookCarrier.fits: Record<routeKey, LiveFitMode>` — a structural mirror of `rects`, which
  is already per-look and per-routeKey.
- `TemplateLookSchema.fits` on the wire, **optional**, because zod strips unknown keys and a
  template packaged before this change carries none; requiring it would refuse every such record at
  the IPC boundary and again at boot.
- `lookPlateFits(live, activeLookId)` in `packages/shared-ipc/src/channels/templates.ts` — a
  deliberate **sibling of `lookPlateRects`**, whose own header forbids a local spelling: _"a FUNCTION
  OF THE CARRIER, not a method on any runtime, so the bridge cannot drift from the console."_
- `LookSource.fitMode` is **DELETED**. A field that looks like the place to write a fit mode, and is
  not, is precisely how this returns.

**It is buildable because the mapping already existed and was thrown away.** `collectLookCarrier`'s
element loop computes (look, routeKey) → element at `live-sources.ts:304-310`; `el.fitMode` was in
scope on the same statement that wrote `rects[el.routeKey] = flat.rect`. It is a genuine FUNCTION,
not a choice: a within-look duplicate `routeKey` is refused at export with `severity: 'error'`
(`live-source-preflight.ts:481-496` + `Exporter.ts:370-376`), while the import path stays tolerant
(first-wins) so the carrier remains total for a hand-crafted package.

⚠ **`firstPlateFor` is NOT that mapping and must not be used for it** — it is keyed by `routeKey`
alone and holds the globally-first plate in document order, so for a routeKey shared by two looks it
returns look A's element and look B's authored mode would be unreachable.

**A look switch had the same defect one layer up, found by the new tests:** `#plateFits` was written
only by the TAKE, so `#tellPageLook` sent the OUTGOING look's modes while the reconcile had already
moved the fills to the ENTERING look's. Fill in one shape, hole in another — `B-149` arriving through
the switch. `reconcileLivePlates` now re-records from its own plan, on success only.

### Does it generalise to `expectedAspect`? NO — and the reason is the point

`LookSource.expectedAspect` is equally dead (same `addLookSource`, same zero writers), so an author's
aspect assertion is dropped for look-group templates too — **and that disarms the take's
aspect-mismatch refusal**, which needs BOTH the source's aspect and the author's
(`live-plate-fit.ts:179`). Same class, one field wider.

🔴 **But it must NOT become per-look.** `expectedAspect` asserts a property of the **FEED** — "this
source delivers 16:9" — and a feed does not change shape when the operator presses a look. Two looks
asserting different aspects for one source would be a contradiction about an external fact, which is
exactly why `looks.ts`'s header keeps it on the declaration _"so two looks cannot disagree about what
a HOLE asserts"_. `fitMode` asserts how that feed is **placed in a box**, and a look is precisely a
change of box. **The two facts differ in kind, so they differ in carrier.** Filed separately as
[[B-179]].

### ⭐ THE PATTERN — "the system knows something and does not say it"

This is the same class the repo has already named three times, verbatim, and it should not get a
rival name: [[B-141]] (`bugs-runtime.md:3663`), [[B-143]] (`:3762`), [[B-144]] (`:3847`) — _"the
system knows something and does not say it"_ — and [[R-053]] (`runtime.md:2492`) calls it _"the same
zero-reader shape as [[B-143]]'s `assumed` flag"_. [[B-146]] (heading `:4086`, the sentence at `:4120`) carries the sharpest statement
of the cost: _"A control that silently does nothing is the worst of the three outcomes."_ [[B-147]]
is the near-exact twin — a control writing a field nothing reads.

**Here, three things knew and none of them said:** the Designer knew the author had chosen `cover`;
the exporter knew it was discarding an element-level field; the bridge knew it was defaulting rather
than honouring. The operator got a well-formed payload with a legal value and no way to tell it apart
from an authored `contain`.

⚠ **A prior brief cited this pattern's other instances as `D-157` (a blocked Export that names
nothing) and `B-178` (a snap guide drawn at the pointer). NEITHER EXISTS** — both appear in the tree
only as "next free" pointers in [b-number-registry.md](b-number-registry.md), and a whole-tree sweep
found no item describing either defect under any number. That is a further instance of the
phantom-label failure the registry already records four times. If those two defects are real, they
want filing; this item cites the pattern's REAL anchors above instead.

### The signal — a per-take readout, with PROVENANCE

`resolvePlateFitMode` now returns `{ mode, from }` where `from` is
`'override' | 'authored' | 'default'`, decided at the one place the chain is walked. `'default'`
means **nobody stated anything** — distinct from an authored `contain`, which produces the same
picture and, before this, the same bytes. The bridge writes one line per take:

```
[caspar-bridge] item-1 live-plate fit — l1=contain (authored), l2=cover (authored)
```

**Why the bridge log:** it is demonstrably where a human already looks — the log that caught this bug
is the artefact the owner was reading when they found it.

**Why a readout and not a warning:** the first draft raised a ⚠ whenever any plate defaulted, and it
fired on essentially every take, because most templates author no fit and for them the default is
correct. A warning that is usually wrong is how a signal stops being read — and this exists precisely
because the previous signal (none) was not read. It states facts and gives no advice; the diagnostic
power is the word `default` appearing where the author expected `authored`.

⚠ **Deliberately a log line and not a badge on the operator's row.** [[B-143]] already records that
three per-plate facts want a row-level home and asks that the first of them build it deliberately
rather than bolting on a private surface. This does not pre-empt that.

**Acceptance:**

- WHEN two plates in ONE look are authored with DIFFERENT fit modes THEN `__cg.plates` carries a
  different `mode` for each, and their `MIXER FILL` rects differ accordingly
- WHEN one `routeKey` appears in TWO looks with different authored modes THEN each look resolves to
  its own, and a look switch carries the new mode in the same payload as the new look id
- WHEN a plate's mode is `cover` THEN its `MIXER FILL` and `MIXER CLIP` DIFFER, `FILL` overflowing
  the box on the wide axis and `CLIP` staying at the box
- WHEN a plate's mode is `contain` THEN `FILL` and `CLIP` are byte-identical — the positive control
- WHEN nobody authored a mode THEN the plate resolves to `contain` and the take log reports it as
  `default`, distinguishably from an authored `contain`
- WHEN a look-group template's DECLARATION carries a `fitMode` THEN it is IGNORED — the looks are the
  authority, and a second home for one fact is what caused this

**Where each bullet is pinned** (a bullet with no test is a claim, and this item is about claims
that were never checked):

| bullet                            | test                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| two modes in one look             | `look-carrier.test.ts` "TWO plates in ONE look…" · `live-look-reconcile…` "…reach air with DIFFERENT geometry"                      |
| one routeKey, two looks           | `look-carrier.test.ts` "ONE source in TWO looks…" · `look-plate-fits.test.ts` · `live-look-reconcile…` "…the switch tells the page" |
| `cover` FILL ≠ CLIP, by value     | `live-look-reconcile…` "…reach air with DIFFERENT geometry" (1864.96 × 1049.04 asserted)                                            |
| `contain` FILL === CLIP (control) | same test, and "…resolves to the DEFAULT"                                                                                           |
| defaulted vs authored, reported   | `live-look-reconcile…` "…the take SAYS SO as `default`" and "…an AUTHORED `contain` reports `authored`" (stderr captured)           |
| the declaration is ignored        | `live-look-reconcile…` "the DECLARATION's fitMode is IGNORED under a look group"                                                    |
| the parked-seat guard             | `live-look-reconcile…` "a PARKED seat must NOT overwrite the punched plate's facts"                                                 |
| `fits` survives the wire schema   | `look-plate-fits.test.ts` "B-178 — `fits` survives the wire schema"                                                                 |

### Notes

- **Priority `high` because it reaches air and is silent.** The multibox look group is exactly the
  feature the fit control was built for, so the control was inert in its own primary case.
- **On-air behaviour change:** a look-group template whose author set `cover` will now render `cover`
  where it rendered `contain`. That is the fix, and it is what the author always asked for.
- 🔴 **THE TEMPLATE MUST BE RE-IMPORTED for the fix to reach an existing installation, and nothing
  says so.** The bridge persists `TemplateInfo` and re-reads it at boot, so a registry written
  before this change carries no `fits` at all. Such a record resolves every plate to `contain` and
  the take readout reports `default` — which is TRUE of the record and FALSE of the author, who did
  state a mode. Re-importing the `.vcg` rebuilds the carrier. ⚠ Same shape as this bug one level
  out: the system knows the record predates the field and does not say so. Not fixed here (a
  carrier-version stamp is its own decision); named so the first person to meet it is not misled by
  a readout that is locally honest.
- **Cross-refs:** [[C-028]] (the feature, and the comment that reasoned its way into this);
  [[B-149]] (hole ≠ picture, the precedent); [[B-143]] / [[B-141]] / [[B-144]] / [[B-146]] /
  [[B-147]] / [[R-053]] (the named pattern); [[B-179]] (`expectedAspect`, the same defect one field
  wider); [[D-147]] (the aspect chain this deliberately does not touch).
- The number was verified free by the heading sweep immediately before this heading was written:
  highest `B-` heading `B-177`; the duplicate audit printed exactly `B-056` and `B-080` and nothing
  else; `B-001` … `B-177` contiguous with no gaps; a whole-tree `git grep` for `B-178` returned only
  [b-number-registry.md](b-number-registry.md)'s own "next free" pointer and `B-177`'s provenance
  note, never a heading; `B-179` and `B-180` returned nothing at all.

---

## [~] B-179 — `expectedAspect` is dropped for every look-group template, which DISARMS the aspect-mismatch refusal, and the aspect that reaches air is the CATALOG's guess with nothing checking it ⟨priority: high — FIXED by `derive-look-sources`; the CHOICE between (a) and (b) was settled by the owner, and one Acceptance bullet is REJECTED with it⟩

**What:** two joined findings from the [[B-178]] investigation, filed here rather than folded into
it because their fix is a different shape and touches a refusal that stops takes on air.

1. **`LookSource.expectedAspect` has ZERO WRITERS**, exactly as `fitMode` did. `addLookSource`
   (`apps/designer/src/renderer/state/slices/looks.ts:110`) is the only producer of a `LookSource`
   and emits `{ routeKey, dynamic: false }`; the look-group editor's prop type
   (`LooksSection.tsx:64`) does not model the field. `collectLookCarrier` copies `src.expectedAspect`
   (`packages/vcg-format/src/live-sources.ts` — the `src.expectedAspect` spread in `collectLookCarrier`) and therefore always copies nothing.
2. ⇒ **The take's aspect-mismatch refusal is DISARMED for every look-group template.** It fires only
   when BOTH the source's aspect and the author's are present
   (`tools/caspar-bridge/src/live-plate-fit.ts:179`); the author's half can never arrive. So a plate
   whose feed is a different shape than the design assumed reaches air with no refusal, no warning,
   and — under `contain`, the default — a picture quietly smaller than its box.

### Where the aspect on the wire actually came from

The plant payload carried `aspect: 1.7777777777777777` for both plates while **neither on-air
element nor either source entry stated one**. Traced: it is **step 1** of `resolvePlateAspect`'s
chain — the operator's `format` on the CATALOG entry, through `aspectForFormat`
(`packages/shared-ipc/src/channels/sources.ts:127-159`). That is designed behaviour ([[D-147]]: the
source outranks the author), not a defect in the chain. The other steps are excluded:

- **step 2** (`SourceDefinition.aspect`) has **no input control anywhere** — `SourcesModal` renders
  Name / Kind / Format plus a read-only derived aspect line, so it is reachable only by hand-editing
  `bridge-source-catalog.json`;
- **step 3** (the element's `expectedAspect`) is structurally dead under looks — finding 1 above;
- **step 4** returns `aspect: null`, not a number.

⚠ **`1.7777777777777777` does not pin the format**: `576p*`, `720p*`, `1080p*`, `1080i*` and
`2160p*` all divide to the same IEEE double, and so does the Designer's own `expectedAspect: 16/9`
element default (`element-defaults.ts:301`) — a red herring, since under looks that element field is
never read.

### 🔴 The measured disagreement, and why nothing can catch it

CasparCG's own log for plate `l2` reported a clip of **`w: 1280 h: 608` — aspect 2.105**, against the
bridge's assumed **1.778**. The picture was fitted to a shape the feed does not have.

**And nothing in the product can notice.** Searched and NOT FOUND: the bridge never learns a live
source's real dimensions. The only server-read geometry is the CHANNEL's raster via `INFO <channel>`
(`caspar-runtime.ts`'s `videoModeRaster` read), which `channel-settings-store.ts:121-133` explicitly forbids feeding
into placement; OSC maps framerate / producer / file-path / paused only
(`packages/caspar-client/src/osc/event-mapper.ts`, and a grep for `width|height|aspect|resolution`
across that package returns nothing). So the catalog's declared `format` is an unverified assertion
that drives real geometry, and [[B-143]]'s `assumed` flag — the one fact that would say so — still
has no readers.

### 🔴 RE-SCOPED AND FIXED 2026-08-29 (`SOURCE-DECLARATION-DROP-02`) — the owner rejected this item's own premise, and the fix follows from that

**This item did not choose between (a) and (b). The owner did, by rejecting the reasoning that made
(a) attractive** — which is why this is a RE-SCOPE and not a tick. His words:

> _"aspect and fit are per-plate right now and have nothing to do with the source — which I think is
> correct."_

**What that overturns, precisely.** The section below argues `expectedAspect` _"asserts a property of
the FEED"_ and therefore cannot be per-look, so it belongs on the DECLARATION. The owner reads it as
the author's intention for the BOX. The code supports his reading: `resolvePlateAspect` runs source
`format` — source `aspect` — element `expectedAspect` — `assumed`, so **the real feed already
outranks the author whenever the installation states a format** (verified in
`tools/caspar-bridge/src/live-plate-fit.ts`). The author's number is a fallback and a VALIDATION
input, never an assertion the system trusts over the feed. [[C-028]] had already settled the fit the
same way, per element.

🔴 **(a) IS GONE, not rejected on its merits.** [[B-188]] deleted the multi-frame group's source
declaration outright, so _"a writer on the declaration"_ has no declaration to write to. **(b) — the
HOIST — is what shipped:** `collectLookCarrier` reads `expectedAspect` off the plate ELEMENT that
first serves each key in document order — the same element the carrier's `elementId` already names,
so the entry describes one element rather than two halves of two. `dynamic` moved the same way, to
the same `dynamicRoleIndex` the groupless path already used.

**Findings 1 and 2 are therefore FIXED.** The author's `expectedAspect` reaches the carrier for a
look-group template, so the take's mismatch refusal — which fires only when BOTH the source's
aspect and the author's are present — is **armed again** for the configuration the product's
flagship feature uses.

🔴 **Acceptance bullet 3 is DELIBERATELY NOT IMPLEMENTED, and it falls with the premise.** It
read: _"WHEN two plates serving one routeKey assert DIFFERENT aspects THEN that is named at authoring
time, not resolved silently by document order."_ That refusal only makes sense if an aspect is a fact
about an external feed that two looks may not contradict. Under the owner's reading it is two boxes
carrying two authored intentions, which is not a contradiction — and the feed's own format wins
over both when it is known. **Document order resolves it, and that is stated rather than silent:** it
is documented at the carrier, pinned by a test, and named here.

⚠ **What is NOT fixed, and is unchanged by any of this:** the rest of this item's second half
stands. The bridge still never learns a live source's real dimensions, the catalog's declared
`format` is still an unverified assertion driving real geometry, and [[B-143]]'s `assumed` flag still
has no readers. Re-arming the refusal means the author's number is now CHECKED against the
installation's claim — it does not make that claim true.

### The fix is NOT [[B-178]]'s

🔴 **`expectedAspect` must NOT become per-look.** It asserts a property of the **FEED** — "this source
delivers 16:9" — and a feed does not change shape when the operator presses a look. Two looks
asserting different aspects for one source would be a contradiction about an external fact, which is
why `looks.ts`'s header keeps it on the declaration _"so two looks cannot disagree about what a HOLE
asserts"_. [[B-178]]'s `fitMode` moved per-look because it describes how a feed is placed in a BOX,
and a look is precisely a change of box. **The two facts differ in kind, so they differ in carrier.**

**Two candidate fixes — SETTLED above; kept for the reasoning, which is why (a) looked
right at the time:**

- **(a) a writer on the declaration** — expose `expectedAspect` in the look-group sources editor, so
  the author states it once for the group, where it belongs. Simple; but it is a SECOND place to
  author an aspect beside the plate element's own field, and two spellings of one fact is the shape
  this repo keeps paying for.
- **(b) HOIST it from the elements, with a refusal on disagreement** — `collectLookCarrier` reads
  every plate that serves a routeKey, and refuses at export when two of them assert different
  aspects. Keeps one authoring surface; costs a new preflight refusal, and a refusal that blocks
  Export needs the care [[B-146]]'s class demands.

**Acceptance:**

- WHEN an author sets `expectedAspect` on a plate in a look-group template THEN it reaches the
  carrier, by whichever of (a)/(b) is chosen
- WHEN the assigned source's aspect contradicts it THEN the take is refused under `cover` exactly as
  it is for a non-look template — the refusal is armed again
- WHEN two plates serving one routeKey assert DIFFERENT aspects THEN that is named at authoring
  time, not resolved silently by document order

### Notes

- **Priority `high`** because a disarmed refusal is worse than an absent one: the guard exists, the
  tests pass, and it cannot fire in the configuration the product's flagship feature uses.
- **Same class as [[B-178]], [[B-141]], [[B-143]], [[B-144]], [[B-146]], [[B-147]] and [[R-053]] —
  _the system knows something and does not say it._** Here the system does not even know it: the
  author's assertion is discarded before anyone could check it.
- ⚠ **Not fixed alongside [[B-178]] on purpose.** Re-arming a refusal changes which takes are
  BLOCKED on air, and choosing between (a) and (b) is a product decision about where an aspect is
  authored. [[B-178]] was a silent drop with an unambiguous fix; this is not.
- **Cross-refs:** [[B-178]] (the same dead-field defect, one field over, fixed); [[D-147]] (the
  aspect chain and why the source outranks the author); [[B-143]] (`assumed` has no readers — the
  honesty half that would surface this); [[R-053]] (the mismatch refusal's operator surface);
  [[C-028]] (the fit modes the aspect drives).
- The number was verified free immediately before this heading was written: highest `B-` heading was
  `B-178` (filed in the same session, directly above); the duplicate audit printed exactly `B-056`
  and `B-080`; a whole-tree `git grep` for `B-179` returned only [[B-178]]'s own forward reference
  and this file's pointer, never a heading; `B-180` returned nothing at all.

## [~] B-189 — the channel-mode read DISCARDS every real CasparCG reply, so R-030's raster check is DISARMED on every real install and the "one-shot" `INFO` re-sends forever ⟨priority: medium — a guard that cannot fire, plus a per-sweep command on the wire, invisible to every test because the mock speaks the shape the code expects⟩ — filed 2026-08-31 from `SKEW-COUNT-01`'s wire tap; **FIXED 2026-08-31 (`SKEW-HOLD-01`) — both breaks, plus the MOCK now speaks the real dialect; see the fix section**

**Found on a wire tap, not by reading code.** `B-174`'s harness (`tools/skew-harness`) proxies the
bridge's AMCP socket, and every recorded switch window carried an ambient `INFO 1` — one per sweep
tick, forever. The "one-shot" channel-mode read never latches, because it never succeeds.

### Two independent breaks, each sufficient, mutually masking

`CasparRuntime.#readChannelMode` sends `INFO <channel>` and then:

1. 🔴 **It gates on the wrong response KIND.** It requires `response.kind === 'ok-multi'` (a `200`
   multi-line block). The real 2.5.0 `69e8ad5` answers `INFO <channel>` with **`201 INFO OK`** plus
   ONE payload chunk — measured on the tap — which `@cg/caspar-client`'s parser correctly classifies
   as **`ok-line`**. The read returns early and records nothing.
2. 🔴 **Even past that gate, the parse looks for a tag the server does not emit.**
   `parseVideoModeFromInfo` (`@cg/shared-ipc`) matches `<video-mode>…</video-mode>`; the real reply
   carries **`<format>1080p5000</format>`**. Zero matches, `null`, nothing recorded.

**Why every test is green while both are broken:** `@cg/amcp-mock`'s `handleInfo` answers
`INFO <ch>` as **`ok-multi` 200** with a **`<video-mode>`** tag — the expected shape on BOTH axes at
once. The suites (and `awaitChannelModeRead`, the bridge tests' own quiescence helper) therefore
prove the code agrees with the mock, and nothing anywhere had ever read the real server's reply
until this tap did. The `B-155` lesson — _"the mock is precisely the thing that models the behaviour
in question"_ — met on a query verb.

### Consequences, in order of harm

- **R-030's raster-mismatch check can never fire on a real install.** Its own doc says the
  disagreement is "shouted on stderr and pushed to every browser"; in fact `observed` stays absent
  for ever and `rasterVerdict` reports `unreadable` — "the check could not be performed" — which
  reads as a shrug, not as a defect. A channel configured `1080i5000` against a server running
  `1080p5000` mis-places every graphic with no warning anywhere. (`CLAUDE.md` golden rule 6: the
  failure-silent branch was designed for an UNREACHABLE server, and a reply in the wrong dialect
  lands in it indistinguishably.)
- **The latch (`#modeReadFrom`) is set only on success, so the sweep re-sends `INFO <ch>` every
  tick, indefinitely** — measured at one per 250 ms under the harness's sweep. Low priority, small,
  but it is a permanent background command the design says should happen once per primary.
- **`awaitChannelModeRead` never completes against a real server**, so any future test or tool that
  reuses it off-mock will hang — the harness had to wait on reachability instead
  (`tools/skew-harness/src/run.ts`, `whenServerReachable`).

### The fix shape (as filed by `SKEW-COUNT-01`, which implemented nothing)

Accept `ok-line` alongside `ok-multi` (joining `data` / `lines` respectively) and parse BOTH
spellings of the mode tag (`<format>` first, `<video-mode>` kept for the mock and any build that
speaks it) — then make the MOCK answer the measured real shape (`201` + `<format>`), not the other
way round, so the suite stops vouching for a dialect no server speaks. A regression test belongs at
the parser level with the REAL reply pasted verbatim.

### ⭐ FIXED 2026-08-31 (`SKEW-HOLD-01`) — exactly that shape, and the FIXTURE is the load-bearing half

- **`#readChannelMode`** accepts `ok-line` and `ok-multi` (`caspar-runtime.ts`, the `B-189` note at
  the gate); **`parseVideoModeFromInfo`** matches `<format>` first, `<video-mode>` as fallback,
  `<format>` winning when both appear (`@cg/shared-ipc` `channelSettings.ts`).
- **The fixture speaks the server, not the code**: the REAL `INFO 1` reply — captured byte-exact
  with a raw socket from 2.5.0 `69e8ad5` at `127.0.0.1:5250` on 2026-08-31 (`SKEW-HOLD-01`; status
  line and terminal CRLF stripped, bare-`\n` interior kept) — is pasted VERBATIM into
  `packages/shared-ipc/tests/channel-settings.test.ts` and must parse to `1080p5000`. That string's
  provenance is the wire; a parser drifting from the real dialect reddens there first.
- **`@cg/amcp-mock`'s `handleInfo`** now answers `INFO <ch>` in the captured reply's exact shape
  (`201`/`ok-line`, one bare-`\n` chunk, `<format>`, terminal `\n\r\n`) with its own mode value —
  its own suite asserts the envelope (`mock-integration.test.ts`) — so the whole bridge suite now
  vouches for the dialect a server actually speaks.
- **Both consequences asserted by value** (`channel-raster.integration.test.ts`): the raster
  MISMATCH shout fires against the real dialect (`CHANNEL 1 RASTER MISMATCH` on stderr, pushed to
  browsers), and the new one-shot test drives the latch with its own positive control — the count
  GROWS while replies are refused (proving sweep and counter live), then FREEZES the tick after
  one reply parses. **`awaitChannelModeRead` completes against the real dialect** — implicitly
  re-proven by every bridge boot that drains it (nine suites), all green.

### ⭐ The rule-8 saga (`awaitChannelModeRead`'s origin) — RE-JUDGED with this in hand: sibling, NOT root cause

The question `SKEW-HOLD-01` was asked: the one-shot `INFO 1` intruded across three sessions, was
twice dismissed as flake, and was remedied by the `awaitChannelModeRead()` drain — is `B-189` the
root cause of that episode? **No — with the evidence, and with one real connection between them:**

- ⚠ The document the question cites (`evidence-and-staging-rules`) **does not exist in this tree
  or in memory** — the saga's substance was recovered from commit `5659ca5e` (2026-08-19,
  _"flake family 3 — a wire-silence baseline needs a proven-quiescent wire"_) and
  `tests/support/harness.ts`'s own doc. Per that commit: session AW's stop-hook red at
  `live-seating:331` was "unreproducible then" (dismissal), `:346` struck twice in the fixing
  session's gate runs, and the mechanism was the DESIGNED one-shot landing between a `before`
  baseline and its `slice(before) → []` assertion under gate CPU load.
- **Those flakes ran against the MOCK, where the old dialect PARSED** — the read succeeded, the
  latch set on the first sweep, and the intruding `INFO 1` really was one command, once. `B-189`
  (the read never succeeding) is a property of the REAL dialect only, so it cannot have caused a
  mock-land timing flake. Sibling failures of one latch, not cause and effect.
- **The real connection:** the saga's remedy was sound in mock-land ONLY. Against a real server
  the drain waits on a latch that could never set — 15 s, then _"the quiescent-wire baseline
  cannot be established"_ — which `SKEW-COUNT-01` hit in practice and had to route around
  (`whenServerReachable`, `tools/skew-harness/src/run.ts`). With `B-189` fixed the drain is valid
  against both dialects. Corroboration that the real dialect was OBSERVABLE well before the
  filing: session AS's hardware recon (2026-08-18) already recorded `INFO 1-10` answering `201`.

**Env:** 2.5.0 `69e8ad5` local, 2026-08-31, `SET 1 MODE` between `1080p5000`/`1080i5000` — the reply
shape is the same in both. Wire evidence in `tools/skew-harness/evidence/2026-08-31-i5000/report.json`
(`commands` arrays).

- **Cross-refs:** [[B-174]] (the harness whose tap caught it, and whose fix's derived-default hold
  READS the mode this repairs), [[B-155]] (the green-mock trap this repeats on a query verb),
  [[R-030]] (the check this re-arms), [[B-100]]/[[B-101]] (the axis rules the silent-failure
  branch was written for).

## [~] B-191 — a look switched while the row is STOPPED is recorded but never TOLD, so the next PLAY comes up with the pictures on one look and the holes on another ⟨priority: high — a wrong layout on air, reached by an ordinary operator sequence, with no refusal and no message⟩ — filed AND FIXED 2026-08-31 (`RUNTIME-RECONCILE-01` S3)

**The owner's sequence, 2026-08-31:** on air on the two-box look → **STOP** → while stopped, switch to
the single-box look → **PLAY** → the fills and the holes come up on DIFFERENT looks. Two recoveries,
both reported and both diagnostic: switching to another look and back repairs it (the on-air path
reconciles correctly), and a further stop-and-play repairs it.

### Answered BY VALUE, on the wire, not by reading

`tools/caspar-bridge/tests/look-switch-stopped.integration.test.ts` drives exactly that sequence
against the mock and reads the trace. The take after the stopped switch sends:

```
MIXER 1-60 VOLUME 1 | PLAY 1-30 DECKLINK DEVICE 1 | MIXER 1-30 VOLUME 0 |
MIXER 1-30 FILL 0 0 1 1 | MIXER 1-30 CLIP 0 0 1 1 | PLAY 1-31 … | CG 1-60 PLAY 0
```

🔴 **`FILL 0 0 1 1` is the NEW look — the pictures are right — and `CG 1-60 PLAY 0` carries NOTHING.**
No `CG ADD`, no `CG UPDATE`, no `__cg` payload: the page is never told, so it comes back up punching
the look it was showing when it was stopped. (The parse is proven by a positive control in the same
test: the same reader answers `two` for the first take's `CG ADD`.) So the decisive question — _does
`#tellPageLook` run on the stopped path?_ — is answered **NO**, and the half that is stale is the
PAGE, not the fills.

### The mechanism: "off air" was used as a proxy for "no page"

`setActiveLook` short-circuits when the row is off air with nothing seated, and records the look on
case 2 of `#recordActiveLook`: _"there is no page to disagree… both re-enter through `#sendAdd`,
which puts the look in the `CG ADD` payload."_ That justification is sound after **`out`** — the
producer is destroyed, `#loaded` is cleared, and the next take really does rebuild the page. It is
**false after `stop`**: `stopItem` leaves the producer RESIDENT (its own comment says so), `#loaded`
stays set, and the take's `B-039` re-ADD is therefore skipped. The look is recorded against a build
that never happens.

**Fixed at the TAKE, and the first attempt at the fix is worth recording because it was wrong.**
The obvious repair — tell the page from `setActiveLook` whenever a producer is resident — turns
the picker into a verb that reaches the plant on an OFF-AIR row, and the suite said so immediately:
[[B-151]]'s _"switching the look of a REHEARSING row sends NOTHING to CasparCG"_ went red, a pin the
OWNER asked for because the same control drives PVW. It is also not enough on its own: the rehearse
route reaches the identical mismatch by a different door (load → rehearse → switch → exit → play).

So the repair sits in `#takeImpl`, in the `else` of the `B-039` re-ADD guard — **the one place both
routes into air converge**: no producer ⇒ the re-ADD's payload carries the look, as it always did; a
resident producer ⇒ the take TELLS the page the recorded look, before it seats the plates, so the
holes and the fills land on one look. `setActiveLook`'s off-air branch is unchanged and still sends
nothing, and case 2's justification in `#recordActiveLook` now names the take rather than overstating
what `#sendAdd` can promise.

⚠ **A refused tell does NOT refuse the take** (`B-161`, golden rule 10, in the direction that
matters here): the plates are about to be seated and a take the operator was told did not happen —
while the wire had already moved — is the worse outcome. It lands and SAYS what disagrees.

### DATED FROM `git`, and the answer is "not a regression"

`git log -S` on the early return: it entered with **`1f76edb0` (2026-08-20)**, LOOKS phase 3 — the
first implementation already recorded the look and returned when nothing was seated — and
**`c3425891` (2026-08-21)** only moved the write into `#recordActiveLook` and wrote case 2's
justification. **No commit was found in which this sequence worked**, so the owner's memory of it
working is most likely of the `out`-then-load path (which does rebuild the page) rather than
stop-then-play. Stated plainly rather than guessed at.

⚠ **`SKEW-HOLD-01`'s claim is CONFIRMED, not merely repeated:** its reorder is entirely inside the
on-air branch's reconcile-and-tell, and the stopped path it left byte-untouched is precisely the one
that was already broken. This session's change is the first touch that path has had since `B-178`.

- **Cross-refs:** [[B-039]] (the re-ADD guard whose absence-after-stop is the other half of the
  mechanism, and where the fix now lives), [[B-151]] (the rehearse pin the first attempt broke — it
  is why the repair is at the take), [[B-161]] / golden rule 10 (why nothing is played or filled),
  [[B-174]] (the on-air order, untouched by this), [[B-149]] (what a hole and a picture disagreeing
  looks like on air).
- **Number:** highest `B-` HEADING across every ref was `B-190` (taken earlier today by the
  `@cg/vcg-format` determinism fix); `B-191` … `B-197` returned no headings anywhere.
