# Bugs — Runtime / CasparCG

Bug reports for the **Runtime** app (`apps/runtime`, the CasparCG playout controller)
and its client stack (`@cg/caspar-client`, AMCP/OSC). For the bug format and Claude's
per-bug loop, see [bugs.md](bugs.md).

> **B- numbers are GLOBAL** across all three bug files and are **never reused**.
> When filing a new bug, pick the next unused `B-` number regardless of which file
> it goes in. Bug files: [bugs-designer.md](bugs-designer.md) ·
> [bugs-runtime.md](bugs-runtime.md) · [bugs.md](bugs.md) (cross-cutting / tooling).

---

## [ ] B-038 — LIVE bridge renders nothing: CG ADD references the template by UUID and sends empty fields ⟨priority: high⟩

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
