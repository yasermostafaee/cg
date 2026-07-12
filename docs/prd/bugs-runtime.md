# Bugs — Runtime / CasparCG

Bug reports for the **Runtime** app (`apps/runtime`, the CasparCG playout controller)
and its client stack (`@cg/caspar-client`, AMCP/OSC). For the bug format and Claude's
per-bug loop, see [bugs.md](bugs.md).

> **B- numbers are GLOBAL** across all three bug files and are **never reused**.
> When filing a new bug, pick the next unused `B-` number regardless of which file
> it goes in. Bug files: [bugs-designer.md](bugs-designer.md) ·
> [bugs-runtime.md](bugs-runtime.md) · [bugs.md](bugs.md) (cross-cutting / tooling).

---

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

## [x] B-064 — R-010 regression: after an OSC-port change Apply cycle, the template server stays down and every Load ships a bare-id 404 ⟨priority: high⟩ — fixed via `fix-setconfig-serve-restart`, archived

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

## [~] B-041 — special characters (`"`, `\`, newline) in a field value break the live CG UPDATE / CG ADD (broken AMCP escaping) ⟨priority: high⟩

> Surfaced on **real CasparCG 2.3.2** with special-character field values; `amcp-mock`
> hid it (its tokenizer is the exact inverse of our own escaper) and the ADR-0006
> harness missed it (its probe payloads had no `"` or `\`). Read-only report — no fix
> here; the escaping fix is designed next.

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
  exactly as typed, updates apply, no `Uncaught SyntaxError`. **Stays `[~]`: the
  only remaining gate before `[x]` is the 2.3.2 confirmation** (sweep re-run or
  live special-char validation on a 2.3.2 box).

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

## [x] B-054 — `#loaded` (producer-existence bookkeeping) goes stale across a CASPARCG restart: the next Take `CG PLAY`s an empty layer (202 no-op, blank take) ⟨priority: medium⟩

> RESOLVED (2026-07-11) by `openspec/changes/archive/`
> `clear-loaded-on-session-reconnect`: `#wireAdapter` subscribes each declared
> session's `'healthy'` (fires only on a completed AMCP reconnect cycle, never
> on degraded→healthy OSC recovery) and wholesale-clears `#loaded`, so the
> next Take re-verifies via the B-039 re-ADD and renders. `#adopted` is
> deliberately kept (restarted layers are empty — the skipped adopt-CLEAR is
> a no-op). Mock-validated only (mock restart on the same ports = genuinely
> empty per-instance layer state); NO live smoke ran — no CasparCG on the dev
> machine (optional/non-gating per the brief).

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

## [~] B-056 — `load()` proceeds when the adopt-CLEAR didn't land on the PRIMARY: an unadopted live orphan can render under an owned slot with no UI tell ⟨priority: low⟩

> Found by the adversarial design review of the B-053 fix (2026-07-10,
> `fix-false-onair-badge` design.md §8); symptom-level, NOT reproduced live.
> A multi-fault reconnect-window residual, ACCEPTED as out of the B-053 fix's
> scope because the mitigation touches redundancy fault-mode semantics.

> **Implemented 2026-07-12** (`openspec/changes/owned-slot-occupancy-warning`)
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
