# Bugs — Runtime / CasparCG

Bug reports for the **Runtime** app (`apps/runtime`, the CasparCG playout controller)
and its client stack (`@cg/caspar-client`, AMCP/OSC). For the bug format and Claude's
per-bug loop, see [bugs.md](bugs.md).

> **B- numbers are GLOBAL** across all three bug files and are **never reused**.
> When filing a new bug, pick the next unused `B-` number regardless of which file
> it goes in. Bug files: [bugs-designer.md](bugs-designer.md) ·
> [bugs-runtime.md](bugs-runtime.md) · [bugs.md](bugs.md) (cross-cutting / tooling).

---

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
  B-038's closed scope.

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

## [~] B-040 — ticker list field (`_tickerTexts`) displays + serializes as "[object Object]" — the Runtime Inspector has no list-field control ⟨priority: high⟩

> Surfaced on **real CasparCG**; `amcp-mock` hid it by never inspecting the data
> payload's structure. Read-only report — no fix here.

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
