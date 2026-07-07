# Runtime — backlog

Features for the playout controller (`apps/runtime`). The CasparCG control path
itself lives in `caspar.md`. See `README.md` for the format.

## [x] R-001 — Import a `.vcg` template (upload) ⟨priority: medium⟩ — merged (#216, `5a0329d`) + archived

<!-- change: openspec/changes/archive/2026-07-07-import-vcg-template/ -->

**What:** Let the operator upload a `.vcg` file to register it as an available
template in the Runtime.
**Why:** The sidebar still says "drop a `.vcg` into the watched folder" — an
Electron-era flow. Browsers have no watched folder, so there's no way to add a
template today.
**Acceptance:**

- WHEN the operator uploads a `.vcg` THEN it is verified (`@cg/vcg-format.verify`)
  and added to the template registry
- WHEN a registered template is selected THEN it can be loaded onto the stack
  with its field schema in the Inspector
- WHEN a `.vcg` fails verification THEN the operator sees a clear error and
  nothing is registered
  **Notes:** `@cg/vcg-format` is isomorphic; extend the template registry in
  `apps/runtime/src/platform/MockRuntime.ts` (and the real registry later). Replace
  the sidebar placeholder copy in `App.tsx`.

## [ ] R-002 — Settings panel UI ⟨priority: low⟩

**What:** A settings view exposing the operator toggles (telemetry mode to start).
**Why:** The `settings` bridge (get/set/onChanged) is wired but has no UI.
**Acceptance:**

- WHEN the operator opens Settings and changes telemetry mode THEN it persists
  (localStorage) and survives reload
  **Notes:** `bridge.settings.*` already implemented in the mock; pairs with P-002
  (routing) if Settings becomes its own route.

## [ ] R-003 — stage Inspector edits locally; only the Update button applies them to air ⟨priority: medium⟩

**What:** Change the Inspector's commit model for a live item: field edits (text,
list items, …) stage locally and are sent via `stack.update` ONLY when the operator
clicks **Update**; blur/Enter merely stages the value.
**Why:** Today every blur/Enter commits immediately and reaches the on-air output
at once (observed in the 2026-07-07 live session, CasparCG 2.5.0 `69e8ad5`) — a
half-finished or accidental edit goes straight to air. On-air safety needs an
explicit apply step.
**Acceptance:**

- WHEN the operator edits a field of an on-air item and blurs/Enters THEN the value
  is staged locally (visibly pending) and NO `stack.update` is sent
- WHEN the operator clicks Update THEN all staged edits are applied in one
  `stack.update` and the pending indication clears
- WHEN the operator re-selects the item without applying THEN staged edits are
  either kept (still pending) or discarded explicitly — never silently half-applied
  **Notes:** Interacts with B-044's pending-update status machine (the sticky
  "updating" badge) — design them together, ship separately. This is a dedicated
  future change, NOT part of the B-040 list-editor fix (which deliberately keeps
  the current commit semantics).
  **Known hazard this design must remove or explicitly handle** (found in the
  B-040 adversarial review, 2026-07-07): the Inspector's blur-commit triggers a
  whole-editor REMOUNT via the value-signature `key`
  (`key={fieldId-JSON.stringify(value)}`, `Inspector.tsx`); on the synchronous
  mock path the remount detaches the mousedown'ed node so the FIRST click on the
  list editor's ↑/↓/×/Add buttons is silently swallowed, and on the live bridge
  the delayed state push re-seeds the editor and can DISCARD keystrokes typed
  into another item's row between commit and push. Staged edits (no commit on
  blur) removes the trigger — but the chosen design must state how upstream
  value changes reconcile with in-progress local edits without a destructive
  remount.

## [ ] R-004 — template Library shows the manifest display name, not the raw id ⟨priority: low⟩

**What:** Library rows (and the import/Load copy) show the template's display
**name** from the `.vcg` manifest; the id stays discoverable as secondary info
(tooltip or small secondary text).
**Why:** The Library renders the raw template id (`LibraryPanel.tsx` shows
`t.templateId`) — a UUID for a real `.vcg` — which is meaningless to the operator
(observed in the 2026-07-07 live session).
**Acceptance:**

- WHEN a `.vcg` is imported THEN its Library row shows the manifest's display name,
  with the id available as a tooltip / secondary line
- WHEN a template has no usable name THEN the row falls back to the id
  **Notes:** `TemplateInfo` (`@cg/shared-ipc` `channels/templates.ts`) carries no
  name today — extend the schema (add `name`), populate it from the manifest at
  import (`templateDelivery.ts`), and pass it through both registries (bridge
  `TemplateRegistry` + `MockRuntime`).

## [ ] R-005 — delete a template from the Library ⟨priority: low⟩

**What:** Let the operator remove a registered template — a per-row delete button
AND a context-menu entry.
**Why:** The Library only grows; a mis-imported or stale `.vcg` cannot be removed
(observed in the 2026-07-07 live session).
**Acceptance:**

- WHEN the operator deletes a template (button or context menu) THEN it disappears
  from the Library and from `templates.list`
- WHEN a template is deleted THEN the backend registry drops it too — incl. the
  bridge `TemplateRegistry` retained HTML and its served `/template/<id>` endpoint
- WHEN a stack item still references the template THEN deletion warns or is refused
  (decide in the change) — never silently broken stack rows
  **Notes:** Needs a new `templates.remove` channel in `@cg/shared-ipc`, removal
  semantics in `tools/caspar-bridge` (`template-registry.ts` + the HTTP serve list),
  the `MockRuntime` equivalent, and the `LibraryPanel` UI (button + context menu).

## [ ] R-006 — surface + recover the boot-time backend choice (no silent per-session mock) ⟨priority: low⟩

**What:** When the boot-time bridge probe fails and the session pins to
`offline-mock`, make that state prominent and recoverable — e.g. a **Reconnect**
affordance that re-probes the bridge and attaches LIVE (or guides the operator
through an explicit reload + re-import) instead of requiring the operator to
discover a manual refresh.
**Why:** The backend is chosen once at boot (`createRuntimeBridge.ts`: probe
refused/timed out → persistent `offline-mock` for the whole session). In the
2026-07-07 live session the page had booted on the mock — commands "never reached
CasparCG" and only a page refresh + re-import attached the real bridge. The
`LinkIndicator` does show `offline-mock`, but the mode is easy to miss and there is
no recovery path in the UI.
**Acceptance:**

- WHEN the session is on `offline-mock` THEN the UI states it prominently and
  offers a reconnect/retry affordance
- WHEN the operator triggers reconnect and the bridge is reachable THEN the session
  attaches LIVE (or is explicitly guided to reload), and the operator is told which
  templates need re-import (the bridge's in-memory registry starts empty)
  **Notes:** Keep the deliberate current model — no silent mid-session fallback to
  the mock; the gap is only visibility + recovery of the boot-time choice. Related:
  the B-038 open follow-up (re-deliver retained template HTML on reconnect).
