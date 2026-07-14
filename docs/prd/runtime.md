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
  (routing) if Settings becomes its own route. Extended by [[R-010]] (server
  connection settings panel), which is where the settings view's real payload
  lives.

## [x] R-003 — stage Inspector edits locally; only the Update button applies them to air ⟨priority: medium⟩ — merged via `stage-inspector-edits`, archived

<!-- change: openspec/changes/archive/2026-07-08-stage-inspector-edits/ -->

> **CLOSED — live-validated.** Inspector edits stage in a per-item draft overlay
> and reach the bridge only on an explicit Update (stack row + Inspector header)
> as ONE atomic `stack.update`; nothing is sent on change/blur/Enter. Discard
> reverts, dirty state is shown per-field + as a row/inspector "● draft" chip,
> drafts are per-item and survive selection switches, and Take/Out/Remove never
> auto-apply drafts. The recorded remount hazard is removed (controlled fields,
> no `JSON.stringify(value)` key). Operator-validated live on **CasparCG 2.5.0**
> (`69e8ad5`, 2026-07-08): all 7 checklist points pass, no regressions.

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

## [~] R-004 — every panel labels a template by the imported file name, never the raw id ⟨priority: medium⟩ — Library half merged via `runtime-library-display-name` (#306, archived); REOPENED and completed on `fix/runtime-ux-batch-2`, change: `runtime-item-label-from-file`

<!-- change: openspec/changes/archive/2026-07-14-runtime-library-display-name/ -->
<!-- change: openspec/changes/runtime-item-label-from-file/ -->

**Reopened (2026-07-14).** The first pass looked right in testing because the bundled
starters carry real labels, and was wrong on the packages operators actually import:

- Only ONE human name survives into a `.vcg` — the entry COMPOSITION's (the export
  projection overwrites the scene name with it; the project name never enters the package).
  For a real package that is frequently a Designer-internal label like "Comp 1", and since
  `ManifestSchema.name` permits a blank, the rule could fall all the way back to the UUID.
- The STACK row and the INSPECTOR were never in scope: both labelled a row
  `fields['title'] ?? item.itemId` — a field most templates lack — and printed the raw
  `templateId` beneath it.

The fix: the label is the **imported file name** (cleaned; case preserved for Persian/mixed
script), else the manifest name, else "Unnamed template" — on all three panels, and the raw
id is never rendered as text (tooltip only). `TemplateInfo` gains an optional
`sourceFileName`, captured from `File.name` at import.

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

## [~] R-005 — delete a template from the Library ⟨priority: medium⟩ — remove BUTTON + refuse-while-referenced MERGED (#306); the context-menu half is still OPEN, so the change `runtime-library-remove-template` is deliberately left ACTIVE (unarchived) and this item stays `[~]`

**What:** Let the operator remove a registered template — a per-row delete button
AND a context-menu entry.
**Why:** The Library only grows; a mis-imported or stale `.vcg` cannot be removed
(observed in the 2026-07-07 live session).
**Acceptance:**

- WHEN the operator deletes a template (button or context menu) THEN it disappears
  from the Library and from `templates.list`
- WHEN a template is deleted THEN the backend registry drops it too — incl. the
  bridge `TemplateRegistry` retained HTML and its served `/template/<id>` endpoint
- WHEN a stack item still references the template THEN deletion is REFUSED with a reason
  naming how many items use it — never silently broken stack rows
  **Notes:** Needs a new `templates.remove` channel in `@cg/shared-ipc`, removal
  semantics in `tools/caspar-bridge` (`template-registry.ts` + the HTTP serve list),
  the `MockRuntime` equivalent, and the `LibraryPanel` UI (button + context menu).

  **Recon corrections (2026-07-13), both load-bearing:**
  1. **Refuse-while-referenced is RESOLVED, not an open question.** The original
     "warns or is refused (decide in the change)" is settled: **refuse**. Deleting a
     referenced template does NOT take the graphic off air (CasparCG already fetched the
     self-contained HTML into CEF) and nothing appears to break — but the item's next
     `out()` → `take()` hits the `unknown-template` guard
     (`caspar-runtime.ts` `take()`, B-039 re-ADD) and the row can NEVER come back, while
     `setPosition`'s re-ADD stops silently. The predicate is **any** reference, not just
     on-air: an `idle`/`loaded` row is poisoned exactly as badly. Mirror R-010's
     on-air-block shape (`#onAirCount` → `{ ok, reason, message }`); the unblock path is
     the same (`stack.remove` / Remove-All).
  2. **The retained-payload resurrection path.** `WebSocketRuntime` keeps a page-lifetime
     `#retained` map of every `templates.import` payload and **re-delivers the whole set on
     every reconnect** (that is what heals a bridge restart). Pruning it on a confirmed
     removal is **required**, or the template resurrects on the next bridge blip. A
     **refused** removal must leave it intact.

  Un-serving needs **no** serve-side change: `TemplateHttpServer` holds no map, it reads
  through the injected `getHtml` per request, so dropping the registry entry 404s
  `GET /template/<id>` on its own.

## [~] R-006 — the Runtime never pretends to be on air: no silent mock, refuse offline, explicit test mode ⟨priority: high⟩ — implemented on `fix/offline-mock-safety`, change: `runtime-offline-safety`

**What:** Four parts, all required — this is a **broadcast-safety** item, not a
visibility nit:

1. **No silent fallback.** An unreachable bridge NEVER becomes the mock. The app
   lands in an explicit, loud DISCONNECTED state that keeps reconnecting.
2. **Refuse the on-air verbs while no server is reachable.** `take`/`update`/`out`
   are refused (`errorCode: 'disconnected'`) BEFORE any intent is applied, so no
   optimistic status can exist. Refuse, never defer — a queued command would be
   stranded (reconnect-reconciliation replays template HTML, not stack intents).
3. **Test mode is an EXPLICIT operator switch** with a loud, persistent indicator.
   Never entered automatically, never mid-show.
4. **No fake ON AIR / no fake HEALTHY.** A simulation may simulate playout; it may
   not claim the broadcast-red ON AIR badge or a healthy link to hardware that is
   not there.

**Why:** Escalated from ⟨low⟩ after it was hit as a **safety failure** (2026-07-13):
the operator pressed PLAY, the row went solid-red **ON AIR**, both servers read
**HEALTHY** — and nothing was on air. The bridge had not been reachable at boot, so
`createRuntimeBridge` silently pinned the session to `MockRuntime`, which _simulates a
successful playout_ (`take()` → `playing` → `on-air`, `accepted: true`) and seeds both
servers `healthy`. The only tell was one amber pill sitting beside a green
"PRIMARY A HEALTHY" that contradicted it — and the reassuring claim won. Meanwhile
nothing anywhere refused a command because the server was absent (a repo-wide grep for a
`disconnected`/`offline` refusal reason returned zero hits), even though the orphan sweep
had gated on exactly that predicate all along.

This is the same incident the original R-006 recorded ("commands _never reached
CasparCG_") — it was simply scoped to visibility and left at ⟨low⟩.
**Acceptance:**

- WHEN the bridge probe fails at boot THEN the app stays on the live backend in a loud
  DISCONNECTED state — it does NOT construct the mock, does NOT report any server healthy,
  and shows no item as on air
- WHEN the operator issues take/update/out while no declared server is reachable THEN the
  bridge refuses with a clear reason, no intent is recorded, the item's status is unchanged,
  and the command is NOT queued for later
- WHEN a mirror pair's PRIMARY is down but a BACKUP is healthy THEN the verbs still work
  (the command reaches a real, rendering server — refusing would deny air that exists; see
  [B-056](bugs-runtime.md))
- WHEN the operator enters test mode THEN it is a deliberate act, a persistent full-width
  TEST MODE banner states nothing is on air, and no CasparCG server is reported healthy
- WHEN an item is "played" in test mode THEN its badge reads SIM, visually distinct from the
  broadcast-red ON AIR badge a real on-air item carries
  **Notes:** The mock stays a valuable test tool — it keeps its state machine, so the on-air
  gates (R-010's block, R-011's position lock, the B-044 badge settle) remain exercisable
  offline. What it loses is the ability to make a claim the operator would trust: real air.
  Related: [B-079](bugs-runtime.md) — the second, independent path to a false ON AIR (a
  failed take outranked by stale OSC), fixed alongside.

## [x] R-007 — Runtime control styling + interaction feedback ⟨priority: medium⟩ — merged via `polish-runtime-controls`, archived

<!-- change: openspec/changes/archive/2026-07-08-polish-runtime-controls/ -->

> **CLOSED — operator-validated.** A real design-system layer for the Runtime: a
> `controls.css` class stylesheet driven by `--r-*` custom properties mirrored
> from `theme.ts` (no new dependency), the `Button`/`AsyncButton`/`StatusBadge`/
> `DraftChip` primitives, and the `.cg-field` class applied directly to the
> existing controlled inputs. Every control now shows hover / active-pressed /
> focus-visible / disabled; bridge-round-trip buttons show press → busy (spinner
> after ~150ms, held ≥300ms) → success / inline error, decoupled from the B-044
> badge; every badge state (incl. UNCONFIRMED) + the R-003 dirty-dot / `● draft`
> have a coherent visual; `prefers-reduced-motion` honored; **TAKE renamed to
> PLAY** (label + aria only). Styling-only — no behavior/verb/lifecycle/escaping/
> schema/bridge change; R-003 input wiring untouched. A jsdom-StrictMode
> `dom.test` + per-surface dispatch e2e guard against severed clicks (a real bug
> caught + fixed during the slice). Operator-validated live on **CasparCG 2.5.0**
> (`69e8ad5`, 2026-07-08): all surfaces read well, controls fire on first click,
> inputs type smoothly (multi-digit numbers, staged edits, textarea newlines), no
> state visual regressed. Follow-up: R-008 (field sizing/density pass).

**What:** Give the Runtime a real design-system layer: professional, legible
controls with unmistakable interaction feedback (hover / active-pressed /
focus-visible / disabled), an async-feedback contract for every button whose
action is a bridge round-trip (instant press → busy-while-in-flight → success →
inline error on rejection), and a coherent visual language for every status /
badge / chip state. Includes the **TAKE → PLAY** button label rename (label +
aria text only — IPC channels and API names stay as-is) and styling the R-003
dirty-dot / "● draft" chip / Discard control and the B-044 UNCONFIRMED badge.
**Why:** Styling today is per-component inline `const styles` objects. Inline
styles cannot express `:hover` / `:active` / `:focus-visible`, so controls feel
dead — no press feedback, no hover, no focus rings — and there is no busy or
success signal when a command round-trips to the bridge (observed across the
2026-07-07/08 live sessions). The operator can't tell a click registered, can't
tell a command is in flight, and a rejection is easy to miss.
**Acceptance:**

- WHEN the operator hovers / presses / tab-focuses any control THEN it shows a
  distinct hover, pressed, and visible focus-visible state (no layout shift
  between states)
- WHEN a bridge-round-trip button is clicked THEN it shows instant pressed
  feedback, becomes busy (disabled + `aria-busy`, double-fire guarded) while ITS
  OWN request is in flight — a spinner-or-equivalent appearing only if the
  request exceeds ~150ms and held ≥300ms once shown — a brief success affordance
  on resolve, and a visible error near the control on rejection (never
  console-only)
- WHEN a request's WS ack clears the button's busy state THEN the stack badge may
  still be settling (B-044) — the two are decoupled and read as distinct
- WHEN every stack badge state renders (ON AIR / READY / IDLE / UPDATING /
  UNCONFIRMED / ERROR / EXIT / TAKING) plus the R-003 dirty-dot and "● draft"
  chip THEN each has a coherent, legible visual with adequate dark-theme contrast
- WHEN `prefers-reduced-motion` is set THEN spinners / transitions are replaced
  by a static busy affordance
- WHEN the change ships THEN the "TAKE" button reads "PLAY" (label + aria); no
  behavior changes (R-003 semantics, the B-044 lifecycle, verbs, escaping all
  stay exactly as-is), and the existing Playwright specs stay green (the PLAY
  selector update is the one deliberate change)
  **Notes:** Introduces a styling MECHANISM (a global stylesheet with classes +
  CSS custom properties fed from `theme.ts`, or shared styled primitives — no new
  UI framework / styling dependency) and shared primitives (Button variants,
  TextInput, TextArea, NumberField preserving R-003's in-progress-text behavior,
  StatusBadge, DraftChip). Give PLAY / UPDATE / OUT / REMOVE a deliberate visual
  hierarchy (an on-air action must not look like a neutral sibling of Remove).
  Keeps the dark broadcast-console look and the sacred air-state colors.
  Cross-refs: R-003 (dirty/Discard affordances), B-044 (UNCONFIRMED badge).

## [ ] R-008 — Runtime field sizing + spacing pass ⟨priority: medium⟩

**What:** Revisit the dimensions of the Runtime's input controls — text fields,
the number field, and the ticker item textareas — plus their min-heights and the
overall Inspector/Library density, now that the shared control primitives are in
place (R-007).
**Why:** After the R-007 design-system rollout the controls read well
stylistically, but the operator finds the inputs still too small / cramped
(final-pass feedback, 2026-07-08). This is a focused sizing-and-spacing
follow-up, not a restyle.
**Acceptance:**

- WHEN the operator edits text / number / ticker-item fields THEN the fields are
  comfortably sized (readable height + padding) without wasting vertical space
- WHEN the sizing changes land THEN they build on R-007's `.cg-field` /
  `--r-space-*` tokens (adjust the shared tokens/class, not per-component inline
  styles) and no interaction state or R-003 input behavior regresses
  **Notes:** Builds directly on R-007 (`.cg-field`, the `--r-*` spacing/type
  scale). Symptom-level for now; measure comfortable field metrics during the
  change.

## [x] R-009 — surface orphaned/unknown on-air layers to the operator, with an explicit per-layer Clear control ⟨priority: medium⟩ — merged via `surface-orphan-layers`, archived

<!-- change: openspec/changes/archive/2026-07-10-surface-orphan-layers/ -->

> **CLOSED — implemented + mock/integration-validated 2026-07-11.** Built as
> the operator-decided PERIODIC OCCUPANCY SWEEP, with the instrument
> corrected by a read-only live capture on the actual build (CasparCG 2.5.0
> `69e8ad5`): AMCP `INFO <channel>` returns NO per-layer data on the 2.3+
> lineage, so the sweep samples a passive **`OscOccupancyTap`** instead —
> one line in the OSC transport AFTER parsing, BEFORE the interest drop, so
> it sees every layer WITHOUT widening interest; the B-044 firehose
> protections are byte-for-byte untouched (asserted by a dedicated
> independence test). Sweep: 5 s cadence, current-primary only (dynamic —
> follows failover/setConfig), skips unless healthy (warnings FREEZE while
> disconnected), 2-consecutive-sweeps surface / 1-sweep resolve,
> change-only publishes, zero added AMCP traffic. Channels `layers.orphans`
> / `layers.orphans-changed` / `layers.clear`; Clear refuses owned layers,
> sends an urgent `CLEAR <ch>-<layer>`, marks adoption on primary success,
> resolves only on the next sweep's observed empty; NEVER auto-clears.
> Amber `OrphanLayersBanner` above the stack, idle-quiet, confirm-gated
> per-row CLEAR. **The sketch below is superseded where it names signals:**
> the diagnosis proved `unexpected-onair` structurally cannot see
> never-loaded layers (interest drops them upstream of the Reconciler), so
> it, `observe`/`collision`, `beginResync`, and `HeartbeatService` all STAY
> DEAD — C-010 unchanged. **Live smoke (optional, non-gating): partially
> run on 2.5.0 `69e8ad5`** — the foreign `PLAY 1-99 RED` + cleanup
> `CLEAR 1-99` halves verified live over AMCP; the orphan-surfacing half was
> environment-blocked (the operator's RUNNING pre-R-009 bridge held UDP
> 6250, the OSC ingest) — to complete it: stop the old bridge, run the new
> build, leave a graphic via a second AMCP client, watch the banner name it
> within ~10 s, Clear, confirm idle-quiet. Mock/integration validation
> stands regardless (the mock's OSC emitter reports per-layer producers
> truthfully; the foreign-session scenario is integration-tested).

**What:** Make server-side layer occupancy the bridge does NOT own visible to
the operator, with an explicit, per-layer **Clear** affordance. Wire the
already-emitted-but-unheard signals — `Reconciler`'s `unexpected-onair` and
`LayerManager.observe`/`collision` (both currently have no production caller;
see C-010) — over a new `@cg/shared-ipc` publish channel into a Runtime warning
surface ("layer 1-60 is on air but not on your stack"), where the operator can
Clear that layer deliberately.

**Why:** `reconnect-reconciliation` (B-048) deliberately ships **no blind
startup CLEAR** — an orphan from a dead bridge session stays on air until a
Load happens to target its layer (on-air safety: a cold bridge cannot tell junk
from a graphic ridden through a controller restart). The flip side, confirmed
in the 2026-07-10 live session: an orphan on a layer no Load targets stays up
INDEFINITELY with zero operator visibility or control. The decision belongs to
the operator, not to a heuristic.

**Acceptance (sketch — refine when scheduled):**

- WHEN OSC reports a non-empty producer on a layer the bridge does not own
  THEN the Runtime surfaces a visible occupancy warning naming the
  channel-layer (never silently, never auto-clearing)
- WHEN the operator invokes Clear on a surfaced layer THEN the bridge sends
  `CLEAR <ch>-<layer>` and the warning resolves on the observed empty
  transition
- WHEN nothing foreign is on air THEN no warning surface is shown (no idle
  noise)
  **Notes:** interest-gating today drops OSC for never-loaded layers — the
  design must widen interest (or add a periodic occupancy sweep) WITHOUT
  regressing the B-044-era firehose protections. Builds on C-010's dead wiring;
  C-011's persisted occupancy would upgrade "unknown layer" to "layer X held
  template Y last session — resume or clear?". Cross-refs: [[B-048]] (the
  designed stay-on-air behavior this makes controllable), [[B-053]] (fixing the
  producer⇒on-air mapping helps this warning's precision).

## [x] R-010 — server connection settings panel: configure primary (+ optional backup) CasparCG from the Runtime UI ⟨priority: medium⟩ — merged via `runtime-server-settings`, archived

<!-- change: openspec/changes/archive/2026-07-10-runtime-server-settings/ -->

> **CLOSED — implemented + mock/integration-validated 2026-07-11.** No live
> remote smoke was run (no second machine in the session); the optional
> checklist is recorded in the change's `design.md` and the change is fully
> validated against `amcp-mock` regardless. What shipped:
> `connections.set-config` applies a new `ConnectionConfig` to the RUNNING
> bridge (sessions/adapter/template-serve rebuilt, land-on-new-config failure
> semantics, an unreachable host is honest-not-fatal), REFUSED while anything
> is on air or unsettled (playing/on-air/updating/exiting/unconfirmed or
> pending — bridge-authoritative, mirrored in the panel); **Remove-All**
> (`stack.remove-all`, confirm-gated REMOVE ALL in the stack header) OUTs +
> REMOVEs every item as the sanctioned unblocking path — folded into this
> entry rather than a separate PRD line (it shipped as this change's
> companion; the OpenSpec requirement carries its scenarios);
> `ServerSettingsPanel` (StatusBar SERVERS button) edits primary + optional
> backup + strategy + auto-failover with the LAN-exposure warning; the config
> persists bridge-side (`~/.cg-runtime/bridge-connection.json`, CLI flags >
> file > default). **Bonus gap closed:** OSC ingest was hardcoded to bind
> loopback — a remote CasparCG would render but never confirm; the bind now
> derives per server locality like the serve path. **SECURITY invariant
> asserted by test:** the control WebSocket stays loopback-bound regardless
> of server config; only the data plane (template HTTP, OSC ingest) goes
> routable for a declared remote server.

> Filed 2026-07-11 from the B-046 fix (`harden-redundancy-single-and-two-server`).
> Extends the thin R-002 "Settings panel UI" (telemetry toggle) with the
> connection page it was always going to need. Symptom/feature-level — do not
> start without scheduling.

**What:** A Runtime settings view for the CasparCG connection: edit the
primary server's host / AMCP port / OSC port, optionally ADD or REMOVE a
backup server (the B-046 declared shape — `servers: { A, B? }`, no mode
enum), and push the resulting `ConnectionConfig` to the bridge at runtime.
This includes pointing the bridge at a REMOTE CasparCG on another machine,
not just `127.0.0.1`.

**Why:** Today the connection is fixed at bridge boot: the config shape,
validation, and remote-host plumbing all exist, but the only way to change
servers is restarting the bridge with CLI flags — invisible to the operator.
The B-046 change made the config shape UI-ready (primary + optional backup);
this item is the UI plus a runtime path to apply it.

**Infrastructure that already exists (this item is UI + one channel):**

- `ConnectionConfig` in `@cg/shared-ipc` (Zod-validated; `servers.B`
  optional since B-046) and the read-only `connections.config` channel.
- The bridge CLI already builds arbitrary hosts/ports: `--caspar-host` /
  `--amcp-port` / `--osc-port` and (B-046) `--backup-host` /
  `--backup-amcp-port` / `--backup-osc-port`.
- `deriveServeOptions` (`tools/caspar-bridge/src/template-http-server.ts`)
  already derives the routable template-serve host when CasparCG is remote —
  the serve path is solved; the panel only changes where the config comes
  from.

**Missing:** the settings UI itself and a `connections.configure`-style
channel that applies a new `ConnectionConfig` to a RUNNING bridge
(tear down / rebuild the declared sessions safely — never mid-Take).

**Acceptance (sketch — refine when scheduled):**

- WHEN the operator edits the primary host/ports and applies THEN the bridge
  reconnects to the new server and `connections.health` reflects it, without
  a bridge process restart
- WHEN the operator adds a backup THEN a B session appears (health shows it;
  failover enabled); WHEN they remove it THEN the runtime returns to declared
  single-server (no phantom churn — the B-046 guarantees hold)
- WHEN the primary host is a remote machine THEN templates still render
  (the serve path derives a routable host as it does for `--caspar-host`)
- WHEN a config is invalid or unreachable THEN the operator gets a visible
  error and the previous connection keeps running (never silently dropped)
  **Notes:** cross-refs [[B-046]] (the config shape + single-server semantics
  this panel edits), R-002 (this page lives in / supersedes that settings
  view), R-006 (boot-time backend choice surface — adjacent but distinct).
  Apply-while-on-air policy needs design care (likely: defer apply or require
  confirmation while anything is ON AIR).

---

## [x] R-011 — operator-chosen on-air POSITION for a loaded graphic ("author small, place anywhere" — the runtime half) ⟨priority: medium⟩ — merged via `runtime-onair-positioning`, archived; **live-confirmed on CasparCG 2.3.2 / `4de6d18f`** (2026-07-13)

<!-- change: openspec/changes/archive/2026-07-12-runtime-onair-positioning/ -->

> **Implemented + mock/integration/e2e-validated 2026-07-12** as **Option A
> (runtime offset)** — a `MIXER` path was REJECTED (hard requirement: no new
> hardware-gated AMCP verb; the corner math lives where the footprint is
> known; MIXER resamples the rendered raster). What shipped: an optional
> scene-level `defaultPosition: Position` (9-point anchor + output-space
> pixel offset, `@cg/shared-schema`, backward-compatible);
> `applyOutputPosition` in `@cg/template-runtime` called ONLY from the
> exported single-file boot (the one page CasparCG loads — bridge-served AND
> file-drop) — effective = URL-query override
> (`?pos=<anchor>&dx=<x>&dy=<y>`) ?? `scene.defaultPosition` ?? CENTERED
> (never 0,0), placed by sizing the page to the 1920×1080 reference frame +
> translating the scene-sized `.cg-stage` (the Designer preview never calls
> it — regression-guarded untouched); `stack.set-position` + a per-item
> Inspector picker (3×3 anchor grid + dx/dy) seeded from the manifest
> default recorded at import, LOCKED while on air (bridge-authoritative
> refusal, mirrored in the UI); the bridge stores per-item overrides
> (`#positions`), re-serves a loaded-not-taken item invisibly, appends the
> query onto the RESOLVED served URL in `#sendAdd` ONLY (the B-064
> serve-down/bare-id contract byte-for-byte; take's B-039 re-ADD inherits
> it), keeps overrides across `setConfig`, and drops them at remove.
> Residuals (change `design.md` §8): non-1080 channels are future work
> (offsets author against 1920×1080); no on-air repositioning by design;
> overrides are process-memory.
>
> **Live smoke — PASSED on CasparCG 2.3.2 (build `4de6d18f`), 2026-07-13**: on a
> real 1920×1080 CasparCG channel, a small-comp template renders **CENTERED** with
> no override (the "never 0,0" default holds on hardware) and at the **chosen
> anchor + offset** when an override is applied before take; the Designer preview
> shows the comp unchanged at its own resolution (the preview never calls
> `applyOutputPosition`, as designed). Both halves of the effective-position chain
> are confirmed live. The read-back half was a separate defect — see [[B-072]],
> also live-confirmed on this build.

**What:** A manifest default position, an operator per-item position picker

- override, and RUNTIME-SIDE application of the position (no CasparCG MIXER
  — positioning stays out of AMCP).

**Why:** A small-canvas template (e.g. a 300×300 comp) renders at output
(0,0): the served page's stage sits at the top-left of the 1920×1080 CEF
frame and the bridge applies no positioning. "Author small, place anywhere"
needs the runtime half: place the authored footprint at an operator-chosen
anchor+offset on the output.

**Acceptance:**

- WHEN a small-comp template with no default and no override is loaded THEN
  it renders CENTERED on the output (never 0,0)
- WHEN the scene carries `defaultPosition` THEN the output honors it and
  the picker seeds from it
- WHEN the operator applies an anchor+offset override THEN the served URL
  carries it as a query and the output renders there (load AND retake)
- WHEN the item is on air THEN `stack.set-position` is refused and the
  picker is locked; editable while loaded-not-taken and idle
- WHEN the Designer previews the same scene THEN no positioning applies

**Notes:** cross-ref **D-119** (the Designer half: auto-populates
`defaultPosition` from the nested-instance position and switches to
small-comp export — depends on this change's schema field + runtime
application). The reference output frame is 1920×1080; non-1080 channels
are a documented follow-up.
