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

## [x] R-004 — every panel labels a template by the imported file name, never the raw id ⟨priority: medium⟩ — Library half merged via `runtime-library-display-name` (#306, archived); REOPENED and completed on `fix/runtime-ux-batch-2` — merged (#317) + archived: `openspec/changes/archive/2026-07-18-runtime-item-label-from-file/`

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

**What:** Every operator-facing panel — the Library card, the stack row, the Inspector
header — labels a template by the **imported file name** (cleaned), else the manifest name,
else "Unnamed template". The raw `templateId` is never rendered as text; it stays reachable
as the row's tooltip.
**Why:** The Library rendered a UUID (observed in the 2026-07-07 live session), and the
first fix only half-solved it. The manifest name is the entry COMPOSITION's — often a
Designer-internal label, and permitted to be blank — while the stack row and the Inspector
were never in scope at all and still labelled a row `fields['title'] ?? item.itemId`, i.e.
`item-<uuid>`. The file name is the one string the operator chose and recognises.
**Acceptance:**

- WHEN a `.vcg` is imported THEN all three panels show its cleaned file name
  (`news-lower-third.vcg` → `news lower third`), not the manifest's internal comp name
- WHEN the file name is cleaned THEN the case is PRESERVED — these names are Persian, or
  mixed Persian/English, and there is no correct "capitalize" for an Arabic-script string
- WHEN a bundled starter (which has no source file) is shown THEN it keeps its manifest name
- WHEN a template has neither a file nor a usable name THEN it reads "Unnamed template" —
  never the id, never blank
- WHEN any panel renders a template THEN the raw `templateId` appears nowhere as text; it is
  reachable only as the row's tooltip
  **Notes:** `TemplateInfo` gains an optional, display-only `sourceFileName`, captured from
  `File.name` at import (`templateDelivery.ts`) and carried through both registries — no new
  channel, no new bridge op, and `templateId` remains the sole identity. The stack row joins
  `templateId` against the registry (`useTemplateIndex`) because `StackItemState` carries no
  label and must not.

## [x] R-005 — delete a template from the Library ⟨priority: medium⟩ — remove BUTTON + refuse-while-referenced merged (#306); the context-menu half merged (#346, `feat/runtime-context-menu`) once the Runtime gained a context-menu primitive (#326) + archived: `openspec/changes/archive/2026-07-18-runtime-library-remove-template/`

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

## [x] R-006 — the Runtime never pretends to be on air: no silent mock, refuse offline, explicit test mode ⟨priority: high⟩ — merged (#312, `fix/offline-mock-safety`) + archived: `openspec/changes/archive/2026-07-18-runtime-offline-safety/`

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

## [x] R-012 — Clear-All: take every on-air item off air, and keep it on the stack ⟨priority: medium⟩ — merged (#317, `fix/runtime-ux-batch-2`) + archived: `openspec/changes/archive/2026-07-18-runtime-stack-clear-all/`

<!-- change: openspec/changes/runtime-stack-clear-all/ -->

**What:** A **Clear-All** control beside Remove-All in the stack header. It sends the
per-item CLEAR to every ON-AIR item and leaves every row on the stack, idle and
re-takeable.
**Why:** The stack's only bulk escape hatch is Remove-All, which is the wrong shape for what
operators need in a hurry. "Get it off the screen" is not "throw it away": Remove-All OUTs
**and** REMOVEs, so recovering from it means re-importing the templates and re-typing every
staged field. The one control available for "everything off, now" therefore charges a
rebuild for a moment of panic. And there is no bulk way to do the safe half — clearing five
on-air graphics means pressing Clear on five rows, one at a time, while they are on air.
**Acceptance:**

- WHEN the operator confirms Clear-All THEN every on-air item receives a
  `CLEAR <channel>-<layer>` and every item REMAINS on the stack (the cleared ones settle to
  idle; a merely-loaded item is untouched)
- WHEN a cleared item is taken again THEN the bridge re-ADDs it onto its still-reserved slot
  and it renders
- WHEN no item is on air THEN Clear-All is not offered (Remove-All still is)
- WHEN the confirmation is shown THEN it counts only the ON-AIR items, and says they stay on
  the stack
- **(broadcast safety)** WHEN Clear-All runs THEN every command sent is a per-layer
  `CLEAR <channel>-<layer>` for an item's OWN slot — NEVER a channel-level `CLEAR <channel>`,
  which would wipe the whole channel including the program/background feed this app does not
  manage. A producer on a layer we never allocated stays on air, untouched; an item holding
  no slot gets no CLEAR; an empty stack sends no command at all
  **Notes:** NO new AMCP verb — `clearAll()` reuses the same per-item `out()` (`CLEAR`) the
  row's Clear button sends. One shared `isOnAir` predicate (not `idle`, not `loaded`) backs
  the row's Clear gating, the header's count, and the bridge, so Clear-All means exactly
  "press Clear on every row where Clear is enabled". Implemented on both backends so the
  B-074 parity + route-coverage guards stay green.

## [x] R-013 — right-click a stack row for its actions ⟨priority: medium⟩ — merged (#346, `feat/runtime-context-menu`) + archived: `openspec/changes/archive/2026-07-18-runtime-stack-row-context-menu/`

<!-- change: openspec/changes/runtime-stack-row-context-menu/ -->

**What:** Right-click on a stack row opens a menu of that row's own actions — PLAY, UPDATE,
CLEAR, REMOVE — mirroring the row's buttons exactly. Completes the context-menu half of the
in-app-menu work whose modal half merged as #325 and whose primitive (`ui/ContextMenu`,
`useContextMenu`, app-wide native-menu suppression) merged as #326 but was wired to nothing.
The Library's half of the same work is [[R-005]] task 5.2.
**Why:** The primitive shipped unwired, so right-click across the whole operator surface does
nothing at all: the native menu is suppressed and nothing replaces it. On a playout console
the row actions are the things an operator reaches for under time pressure, and the buttons
are small targets in a dense row.
**Acceptance:**

- WHEN the operator right-clicks a stack row THEN a menu opens with that row's four actions
- WHEN a row's button is disabled THEN the matching menu item is disabled too — the same
  gate, including the R-006 link-down refusal on PLAY/UPDATE/CLEAR and [[B-085]]'s on REMOVE
- WHEN a menu item is chosen THEN it runs the SAME handler the button runs — never a second
  command path
- WHEN a menu action is refused THEN the reason reaches the operator through the command
  TOAST, worded exactly as the button's refusal
- WHEN the menu is open THEN outside-click, Escape, scroll and running an action all dismiss
  it, and it never opens off-screen
- WHEN the operator right-clicks a text field THEN the browser's own menu still appears, so
  cut/copy/paste and the BiDi services stay available for Persian copy

**Notes:** No new command path, no new gate, no new state — the menu is an ALTERNATE ENTRY
POINT. The row declares its four actions ONCE (`ui/rowAction.ts`) and renders them twice, as
buttons and as menu items, so "the menu mirrors the buttons" is structural rather than two
code paths that have to keep agreeing. FROZEN: on-air refusal (R-006), the linkDown gates
themselves, [[B-085]]'s browser-local library, [[B-086]]/[[B-087]]'s `unverified` badge, and
[[B-092]]'s stack restore are all untouched.

## [ ] R-014 — Persian / localised numerals: numbers DISPLAY in Persian digits ⟨priority: medium⟩

**What:** Numeric display is localised: numbers shown in the operator UI are DISPLAYED in
Persian digits. The UI already carries Persian text throughout — the displayed numerals are the
missing half. (The INPUT half — accepting Persian-typed digits — is owned by [[R-020]].)
**Why:** Mixed Latin digits inside Persian text read as a seam in what is otherwise a
Persian-first product.
**Acceptance:**

- WHEN a number is displayed in the operator UI THEN it renders in Persian digits (scope: see the
  open questions — recorded, not decided)
- WHEN a numeric value reaches a machine consumer (AMCP on the wire, stored data, exported files)
  THEN it is normalised to ASCII digits — localisation is presentation-layer and never leaks into
  a protocol or format

**Notes:** OPEN QUESTIONS recorded rather than decided: (a) which fields — ALL numeric fields, or
only operator-facing ones? (b) the normalisation boundary — AMCP presumably still needs ASCII
digits on the wire, so this is a presentation-layer concern with a conversion edge that has to be
placed precisely; (c) is the numeral locale a setting, or fixed to Persian? — The INPUT half is
precisely filed AND implemented as [[R-020]] (accept ۰–۹/٠–٩, normalize on input, canonical
storage/wire); THIS item keeps the DISPLAY half and the open questions.

## [x] R-015 — protect VIDEO layers: a graphics operator can never clear one, and a video layer reads as NORMAL ⟨priority: high⟩ — merged (#365) + archived: `openspec/changes/archive/2026-07-19-runtime-protect-video-layers/`

**What (the owner's settled rule):** a graphics operator must never be able to clear a VIDEO
layer. Sharper than the originally-filed "not-ours", and it dissolves the [[R-009]] tension
without guessing, because the discriminator is OBSERVABLE rather than inferred: OSC reports the
producer KIND per layer, and this system only ever places `html` producers. So a non-`html`
producer (`ffmpeg`, and any unrecognised kind — "not html" fails safe, video kinds are never
enumerated) is PROVABLY not ours → clearing it is impossible: no confirm, no heavier gate — the
affordance does not exist, and the bridge refuses `layers.clear` besides (a UI-only gate is not a
prohibition). An orphaned `html` producer is plausibly our own graphic riding through a dead
bridge session — exactly [[R-009]]'s case — so its confirm-gated Clear SURVIVES unchanged.
**Why:** Observed symptom: adding a video on layer 1 warned that the operator could clear
layer 1. Protection was a warning; a warning still leaves one click between the operator and
taking a program feed off air.
**Acceptance:**

- WHEN a layer's fresh observation reports a non-`html` producer (a video, regardless of layer
  number) THEN no Clear affordance exists for it anywhere, and `layers.clear` refuses it
  (`reason: 'foreign'`) from ANY caller with nothing sent to the wire
- WHEN a layer has NO fresh observation (blind tap, aged-out entry) THEN `layers.clear` refuses
  it too — silence is evidence of nothing and cannot license a CLEAR
- WHEN an orphaned layer's fresh observation reports `html` THEN its [[R-009]] confirm-gated
  Clear works unchanged
- WHEN a video layer is shown THEN it reads as a NORMAL state in a neutral tone (never amber,
  never the on-air red): the operator sees the layer is occupied and by what kind, and the clear
  action is simply absent

**Notes:** PRESENTATION REQUIREMENT from the owner: an occupied video layer is a normal fact of
the console — there is essentially always one in play, so warning amber would permanently imply
something is wrong when nothing is. — KNOWN LIMITS recorded in the change's `design.md`: the
blind-tap install fails DARK (prohibition holds, occupancy display cannot — [[B-094]]'s NO OSC
indicator explains why), and [[B-092]]'s restart misadoption (a foreign producer landing on a
retained-intent layer while the bridge was dead is adopted as ours; the honest refusal needs a
second `unverifiable` cause — structural, recorded not fixed). — The allocation-path hole (an
ordinary Add can adopt-CLEAR an in-range foreign producer) is filed separately as [[C-014]].

## [ ] R-016 — reorder stack items, preferably by dragging ⟨priority: medium⟩

**What:** The operator can reorder the rows of the stack — preferably by dragging a row to a new
position — and the new order is a real, persistent order.
**Why:** The stack's order is the operator's running order; today items sit wherever they were
added, and the operator cannot arrange them to match the rundown.
**Acceptance:**

- WHEN the operator drags a stack row to a new position THEN the list immediately reflects the
  new order
- WHEN the stack is re-rendered, the page reloads, or the bridge reconnects THEN the chosen order
  survives — it is a real ordering, not a render artifact

**Notes:** CONSTRAINT recorded: today's ordering is render-only (`[...items].reverse()` in
`StackPanel`) — no persistent reorder operation exists, so this introduces a real ordering
concept that has to LIVE somewhere. Consider alongside where stack state now lives after
[[B-092]] (browser-retained intent + occupancy-aware reconcile-on-connect).

## [ ] R-017 — an ON-AIR item cannot be REMOVEd — take it off air first (STOP or CLEAR) ⟨priority: high⟩

**What:** REMOVE is refused while a stack item is on air; the operator takes it off air first via
[[C-012]]'s STOP (graceful outro, producer stays resident) or CLEAR, and only then removes the
row. Same rule in bulk: Remove-All is DISABLED while anything is on air. Affordances stay visible
and disabled with a title naming the remedy; the bridge refuses independently.
**Why:** REMOVE is the only row verb with no opinion about on-air state. PLAY and UPDATE gate on
the narrow local `onAir` (`'on-air' || 'playing'`, `StackRow.tsx:97`); STOP and CLEAR gate on the
shared `isOnAir`; REMOVE gates on `linkDown` ALONE ([[B-085]], `StackRow.tsx:197` —
`disabled: linkDown,`). On a live graphic it is therefore enabled, unconfirmed, and does two
irreversible things at once: destroys the producer and drops the row with its staged fields. Same
shape [[R-015]] closed for video layers, minus even the warning. The remedy only became KIND this
week — before [[C-012]] there was no non-destructive way off air, so "clear it first" meant
"destroy it first".
**Acceptance:**

- WHEN an item is on air THEN its REMOVE affordance is disabled as a button AND as a menu item,
  with a title naming the remedy
- WHEN `stack.remove` is invoked for an on-air item by ANY caller THEN the bridge refuses with a
  legible reason and NOTHING reaches the wire — a UI-only gate is not a prohibition
- WHEN any item is on air THEN Remove-All is DISABLED (visible, titled) and `stack.remove-all` is
  refused bridge-side with nothing on the wire
- WHEN one item is on air and four are idle THEN those four are still individually removable —
  only the BULK action is withheld
- WHEN a refusal happens THEN it reaches the operator through the command toast, worded the same
  however it was issued
- WHEN the item has been STOPped (resting at `loaded`, producer resident) THEN REMOVE is available
  again and still CLEARs before dropping the row, exactly as today
- WHEN nothing is on air THEN Remove-All behaves exactly as today, confirm and all
- WHEN an item is not on air THEN nothing changes — the ordinary path is untouched

**Notes — OWNER'S DIRECTION (decided, not open):**

- **ONE PREDICATE.** Read the EXISTING shared `isOnAir`
  (`renderer/features/stack/onAir.ts:18-20` — `status !== 'idle' && status !== 'loaded'`) — never
  a second definition of "on air"; a parallel definition is how [[B-086]]/[[B-087]]'s honesty work
  gets quietly undermined. **The consequence, stated from the recon rather than assumed:**
  `unverified` sits INSIDE that predicate (it is a two-item denylist, so `unverified` falls
  through), so an unverified item is NOT directly removable. That is the opposite of the
  "merciful" branch the direction anticipated, so the escape route is what carries the mercy, and
  it exists: STOP and CLEAR gate on the same predicate and are therefore ENABLED on exactly those
  rows, and a CLEAR settles the item to `idle`, where REMOVE returns. Note also that on a
  genuinely dead link nothing is newly stranded — [[B-085]]'s `linkDown` gate already disables
  REMOVE there. The case where this rule newly bites is [[B-093]]'s OSC-blind `unverified` (AMCP
  alive, OSC dead), where the link is UP: two clicks instead of one, never a dead end. Changing
  `isOnAir` itself is a different decision, out of scope.
- **ONE AUTHORITY for both scopes** — with a conflict the implementation must resolve first.
  [[R-010]]'s `#onAirCount` (`caspar-runtime.ts:1511-1523`) counts
  `pending || playing | on-air | updating | exiting | unconfirmed`, which is **not the same set**
  as the renderer's `isOnAir`: it EXCLUDES `unverified`, `error` and `disconnected`, which
  `isOnAir` includes. Mirroring `#onAirCount` bridge-side while gating the UI on `isOnAir` would
  therefore produce exactly the two-mechanisms-that-must-agree failure this note exists to
  prevent — the UI would disable REMOVE on an `unverified` row that the bridge would happily
  accept. Pick ONE set and use it on both sides, and say which in the change's design. Do not
  invent a third vocabulary: the refusal shape stays [[R-010]]'s
  `{ ok: false, reason, message }`.
- **ONE DECLARATION:** the per-row gate goes in the row's single `RowAction[]` declaration
  ([[R-013]]; `StackRow.tsx:133`, rendered as buttons at `:246` and projected through
  `toMenuItems(actions)` at `:261`), so button and menu item inherit it structurally rather than
  by two code paths agreeing.
- **DISABLED, NOT ABSENT** — deliberately unlike Clear-All, which is genuinely not rendered when
  nothing is on air (`StackPanel.tsx:128`). Recorded so nobody later "harmonises" them: Clear-All's
  absence is honest because there is genuinely nothing to clear; a Remove-All that VANISHED
  mid-show reads as a lost feature. A disabled control with a title teaches the rule; a missing one
  teaches nothing.
- **NOT "SKIP THE ON-AIR ONES"** (rejected): silently removing four of five rows breaks the
  action's own name and leaves the operator believing the stack is empty while a graphic is live.
- **THE PAIR BECOMES COMPLEMENTARY** — Clear-All offered only when something is on air, Remove-All
  only when nothing is. The header always presents exactly one bulk action, and the remedy for the
  disabled one is the enabled one.
- **THE BRIDGE HALF IS NEW CAPABILITY, not a tightening.** Today neither channel can refuse:
  `stack.remove` answers a bare `{ accepted: boolean }` and `stack.remove-all`
  `{ ok, removed }` — no `errorCode`/`reason` on either (`shared-ipc/src/channels/stack.ts`) — and
  neither implementation refuses anything. `remove` does not even carry the bridge-side
  `#linkDown()` guard its button implies. So this adds the first refusal to both, across two
  different response shapes; follow [[B-070]]'s `errorCode` precedent.
- **RIPPLE THE IMPLEMENTATION OWES.** [[R-010]]'s blocked-Apply recovery runs through Remove-All
  today, and under this rule that path changes — and gets SHORTER, since Apply gates on the on-air
  COUNT (not stack emptiness), so CLEAR-ALL ALONE unblocks it. The copy currently naming Remove-All
  as the remedy, all of which becomes self-contradictory (it would name a control that is disabled
  precisely because of the condition being reported): `ServerSettingsPanel.tsx:308`,
  `MockRuntime.ts:301`, the bridge's own message at `caspar-runtime.ts:1389`, and the assertion of
  that literal string in `serverSettingsPanel.dom.test.ts`. The Playwright e2e to rewrite is
  `apps/runtime/tests/e2e/server-settings.spec.ts` — its step 2 clicks Remove-All to unblock
  Apply and then asserts "No items loaded"; after Clear-All the rows correctly REMAIN (idle), so
  that assertion changes shape too. [[R-010]]'s own gate is FROZEN — only the remedy wording and
  the recovery path move.
- **FROZEN when implemented:** [[R-006]], [[B-085]]'s REMOVE link-gate (this ADDS a condition, it
  does not replace it), [[R-015]]'s `foreign` prohibition, [[B-086]]/[[B-087]]'s `unverified`
  badge, [[B-092]]'s restore, [[C-012]]'s STOP, Clear-All's behaviour.
- **Tidy-up available while in here** (not required): the row's prose still says "four actions" in
  three places (`StackRow.tsx:128`, `:216`, its docstring) and `rowAction.ts:16-17` still lists
  PLAY/UPDATE/CLEAR/REMOVE — [[C-012]]'s STOP made it five.

## [x] R-018 — feed field values from a text file (whole-text default, OPTIONAL split; manual reload) ⟨priority: medium⟩ — manual-reload half SHIPPED and archived: `openspec/changes/archive/2026-08-11-runtime-field-from-file/` (living spec `runtime-ui`); local gate green; no CasparCG hardware pass owed (renderer-only over the EXISTING field-update path — same `stack.update` wire and value shapes as hand edits, no new AMCP verbs, `@cg/template-runtime` untouched); OWES one Linux `pnpm gate:e2e` (FULL suite — a Linux run is owed for any UI/layout/rendering change, not only spec edits: the new FromFileControl mounts inside the Inspector and changes its content height, and nine existing specs interact with the Inspector plus the content-height-sensitive `panel-scroll.spec.ts`; DISCHARGED 2026-08-08 by a COMPLETED, GREEN `e2e` job on `ubuntu-latest` for commit `a344cd2`, which carries the change: <https://github.com/yasermostafaee/cg/actions/runs/31252541925> — run `conclusion: success`, `E2E (Playwright)` job conclusion `success`, runtime 62 passed / designer 237 passed, including the named-risk `panel-scroll.spec.ts` and `inspector-open-close.spec.ts`); the Windows `gate:e2e` 22/22 (0 cached) pass is recorded as non-authoritative EVIDENCE, not discharge (~19px render-geometry delta); the WATCH half remains OPEN as [[R-026]] (recon-first) and is NOT part of this closure

**What:** At playout, a text-carrying field takes its value from a chosen text file: whole-file
verbatim by default, an OPTIONAL delimiter split into list items, and a manual RELOAD. The
Designer track covers the one-shot authoring load separately ([[D-138]] by title: "load ticker /
sequence / text content from a text file"); THIS item is the RUNTIME half. Automatic WATCHING is
deliberately NOT in this item — it is [[R-026]], recon-first, because its architecture (browser
FSA re-read vs the bridge watching a path) is an open decision this item must not block on.
**Why:** The client's newsroom workflow keeps the crawl/subtitle copy in a text file that other
staff update. The INCUMBENT Cinegy workflow — honor it as the default — is that the TYPIST embeds
the separators inside the text and the whole file IS the content, fed verbatim; splitting into
discrete items is OUR optional convenience.
**Acceptance:**

- WHEN the operator chooses "from file" on a text-type field with split OFF (the DEFAULT) THEN
  the ENTIRE file content becomes the field value verbatim — applied through the normal
  field-update path, so a live item updates exactly as a hand-edited field would
- WHEN the target is a ticker's content with split OFF THEN the entire file becomes ONE list
  item's text, so the crawl renders the author's own embedded separators exactly as typed —
  VERIFIED model at filing (2026-07-22): a ticker's content is fielded as a `list`, never a
  single text value — the element's authored `items: { id, text }[]` are replaced at playout by
  a bound `list` field (`packages/shared-schema/src/elements.ts`, `fields.ts`; "the ticker reads
  `text`" per item)
- WHEN the operator enables SPLIT THEN they define a delimiter (free text; sensible suggestions
  offered) and the content splits into a list value for list-type fields (ticker / sequence
  items); entries empty after trimming are skipped
- WHEN the target is a SEQUENCE's list field THEN split defaults ON (a sequence shows discrete
  items); WHEN split is OFF there THEN the whole text becomes ONE item and the UI says so
  explicitly — the split default is per-TARGET (crawl parity keeps the ticker whole-text), not
  per-field-type, since ticker and sequence content are BOTH `list` fields under the real model
- WHEN the operator triggers RELOAD THEN the file is re-read and the field re-applies — manual
  reload is the v1 baseline and must work everywhere
- WHEN the file is UTF-8 Persian/RTL THEN content survives verbatim through shaping/bidi
- WHEN the file is missing/unreadable at reload THEN the CURRENT on-air value is KEPT and the
  operator sees a legible error — never a blank crawl on air because a share went away

**Notes:** this feeds the EXISTING field-update path — no new content pipeline; the file is just
an input method for field values. The ticker field model was verified at filing and the item is
worded against it (see the second Acceptance bullet). Cinegy parity is the NEED, not the UI.
Pairs with the Designer-track authoring-load item ([[D-138]], cross-referenced by title). The
WATCH half is [[R-026]] — recon-first because bridge involvement is an open architecture call;
the `TextFileSource` abstraction this half ships is what keeps that follow-up cheap.

## [ ] R-019 — modal editor for list-type field values: add / edit / delete / drag-reorder ⟨priority: medium⟩

**What:** A button on list-type fields opens a modal editor: add items, edit them, delete them,
reorder via drag & drop. Changes apply through the NORMAL field-update path, so a live item
updates exactly as hand-edited fields do.
**Why:** Ticker/sequence list fields currently render as stacked inputs that eat Inspector
space; editing a long crawl in-place is cramped and reordering is impossible.
**Acceptance:**

- WHEN a `list`-type field is shown THEN a button opens a modal covering add / edit / delete /
  drag-reorder of its items
- WHEN changes are applied THEN they go through the existing field-update path — a live item
  updates exactly as hand-edited fields do
- WHEN item text is Persian/RTL THEN it survives verbatim
- WHEN [[R-018]]'s from-file mode is ACTIVE on that field THEN the modal is read-only and
  points at the file as the source
- WHEN operated by keyboard THEN the modal is accessible per the design system's
  interactive-control rules

**Notes:** the list-field item shape was verified at [[R-018]]'s filing and this item is worded
against it: a `list` field's items are ordered and extensible, `{ id, text }[]`, and the ticker
reads `text` per item (`packages/shared-schema/src/elements.ts`, `fields.ts`). Cross-ref
[[R-018]].

## [x] R-020 — Persian-keyboard digits accepted in numeric inputs, normalized to canonical digits ⟨priority: medium⟩ — archived: `openspec/changes/archive/2026-08-08-runtime-persian-digit-input/`; no on-air behavior change (wire values unchanged) so no CasparCG hardware pass was owed; the owed Linux `gate:e2e` is DISCHARGED — the edited spinbutton→textbox role assertion in `stage-inspector-edits.spec.ts` executed and passed on `ubuntu-latest` in a COMPLETED, GREEN run for commit `a344cd2` (<https://github.com/yasermostafaee/cg/actions/runs/31252541925>), which is what closed this item rather than the WSL install it was waiting for. Residual, deliberately NOT held open: the owner has not yet exercised Persian digit entry on their own machine with a real Persian keyboard — a usability confirmation, not a correctness gate, and the behaviour is pinned by unit, DOM and Linux E2E coverage

**What:** With a Persian keyboard active, numeric inputs (offsets, counts, ports, numeric field
values) reject Persian digits (۰–۹). They must be accepted and normalized to canonical digits
for the stored value; text fields keep them verbatim (display text is display text).
**Why:** An operator on a Persian keyboard should never have to switch layouts to type a
number, and silent rejection reads as a broken input.
**Acceptance:**

- WHEN the operator types Persian digits (۰–۹) or Arabic-Indic digits (٠–٩) into ANY Runtime
  numeric input THEN they are accepted, normalizing on input
- WHEN the value is stored or transmitted THEN it is canonical digits
- WHEN [[B-077]]'s pattern validation lands THEN a numeric pattern must not reject Persian
  digits
- WHEN the field is text-type THEN its content is untouched — verbatim

**Notes:** Runtime half only — the Designer half is [[D-130]] ("Persian/Arabic-Indic digit
input in numeric fields", filed on the Designer track in #387, merged while this batch was
being written). Small, no recon. RELATIONSHIP TO [[R-014]] (judged at filing):
R-014 already records the broader localisation item — input acceptance AND Persian DISPLAY,
with its scope questions recorded, undecided. THIS item is the INPUT half made precise and
independently shippable (both digit ranges, normalize-on-input, canonical storage/wire,
text-verbatim, the B-077 interaction); implement the input half ONCE, under this number —
R-014's input-side acceptance reads as satisfied by this item, and R-014 keeps the DISPLAY
half and its open questions.

## [~] R-021 — fixed operator layers: aliased pre-defined slots with on-row import+load and layer-level control ⟨priority: high⟩ — STAGES 1 + 2a landed (`openspec/changes/runtime-fixed-layers/`, see its STAGE MAP). Stage 1: install config + the LayerManager fixed mechanism + the R-009 orphan-sweep exclusion. Stage 2a (wire contract): the five `fixedLayers.*` channels (config read/update with the validator's own reason codes, single-sourced; per-slot state as FACTS — observed occupancy per the D3 honesty rules + a stage-3 `binding` field), bridge routes + publish-on-change from the existing sweep tick, LIVE bank changes via `LayerManager.applyFixed`, persistence on applied change, the typed `RuntimeBridge.fixedLayers` seam + `WebSocketRuntime` impl + `MockRuntime` parity (offline occupancy honestly UNKNOWN). Still no renderer/UI, still no on-air behaviour change (no bank ⇒ config null / state [] / zero publishes, test-pinned), R-015's clear refusal untouched. No CasparCG hardware pass and no Linux `gate:e2e` owed for the 2a slice — every touched path checked against `UI_RENDER_PATTERNS` in `tools/gate-hook/src/gate-decision.mjs`, none matches (packages/shared-ipc, packages/caspar-client, tools/caspar-bridge, apps/runtime src/shared + src/platform + non-e2e tests, docs, openspec). **Stage 2b (renderer) landed:** the fixed-bank panel above the stack (idle-quiet — no bank, no panel, byte-identical column), permanent rows with alias + layer number and honest occupancy (explicit UNKNOWN never shown as empty, B-094; a dead SPA↔bridge link masks EVERY row to unknown over the frozen snapshot, the B-087 class), verb derivation as the ONE pure `fixedRowActions` declaration point — stage 2b's ONLY verb is a confirm-gated layer CLEAR on an OBSERVED `html` producer (the b1 blind-Clear-under-silence and the non-html carve-out are DELIBERATELY stage 4/task 4.3: today's bridge refuses both and an enabled control must never invite a click that only rejects), the declaration-time confirm gate (`withConfirm` + the `cancelled` async path — cancel is no success flash and no toast) shared by buttons and context menu, the bank config modal (count/aliases live; channel/start read-only; refusals surface the validator's mapped reason + its message), the b′ same-bank invariant documented (operator guide + `fixed-layers-store.ts` header; the divergence HINT is deferred to stage 3 — with `binding` null, every html producer is indistinguishably foreign and the hint would carry no information), and the `CG_E2E_FIXED_BANK` mock seed + unit/DOM/E2E coverage (the "import+load lands on the exact slot" E2E moved to stage 3 beside 5.3). **Stage 2b OWES, recorded as OWED not done:** (1) a Linux `gate:e2e` run — this slice touches `apps/runtime/src/renderer/**` + `tests/e2e/**`, which match `UI_RENDER_PATTERNS`; the Windows `gate:e2e` result is a Windows signal only, NON-authoritative for render geometry (~19px delta class); (2) a real-hardware pass on CasparCG 2.3.2 for the one on-air path this stage adds — with a bank declared and a foreign html graphic on a bank layer, the fixed row's Clear takes it off air, the row settles to empty on the next sweep, and nothing else on the channel is disturbed. **Stage 3 (the exact-slot import+load chain) landed** — see the change's STAGE MAP. **Stage 4 (the restore branch) landed 2026-08-14:** `#slotForRestore` now BRANCHES — a declared row is bound exactly or the item is skipped (`fixed-slot-taken`), and `#allocate()` is unreachable for one, so a bridge restart can no longer bring an operator's row back on some dynamic layer (D11's warning, and under R-028's declared model it would have misplaced EVERY row rather than an unlucky one — which is why R-028 §1.1 named this Blocking); a declared row observed holding a NON-html producer parks in the named `restore-blocked` state with ZERO wire traffic (no adopt — that is B-092's misadoption lie; no auto-CLEAR — automatic paths never destroy), exiting only by the operator's explicit Clear-then-take or by the foreign producer vacating; the row shows BOTH facts and BLOCKED outranks the item's retained (usually `on-air`) status, and every verb that would COMMAND that layer is held while CLEAR/REMOVE stay live; task 4.3's dialog now branches on what the wire actually said (unknown → says it cannot tell · producer → names the kind · empty → says so), every branch naming the layer number. **Found and fixed in passing (D12):** B-114 had replaced `reserve()` with `bindFixed()` instead of branching, so every DYNAMIC retained coordinate had silently lost its exact-slot restore — pinned now by design §d test 5, verified failing first. **Stage 4's Linux `gate:e2e` is DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/31760214543 (run 31760214543, `dev` HEAD `6ee4c5d4` which contains `e326a962`; completed + success, with the `e2e` job itself having RUN rather than skipped). **Stage 4 still OWES:** the real-hardware pass (7.3), which also still carries 4.3's UNRUN RECON (`CG STOP` on a non-html layer on real 2.3.2 — nothing shipped depends on its answer, since STOP is withheld for any non-html observation). Remaining: 7.3 (hardware) and the archive

**What:** A Cinegy-parity operating model IN PARALLEL with the dynamic stack: a fixed set of
pre-defined CasparCG layers (default TEN at 70–79 — chosen because the default policy's dynamic
ranges end at `custom` 60–69 and nothing uses 70–89; configurable per install, extendable ONLY
at the end up to 89, never renumbered mid-session), each rendered as a permanent row. Each
layer takes an optional ALIAS (config map layer→name) shown on the row. The row's import button
does the FULL chain in one action: pick a `.vcg` → import into the library (it stays there for
reuse) → create an item BOUND to that exact slot → Load.
**Why:** With multiple Runtime stations on one CasparCG, a known layer is always manageable
from any station — "layer 72 is the clock, whoever loaded it". The dynamic stack cannot promise
that; fixed, aliased slots can.
**Acceptance:**

- WHEN the install config declares fixed slots (start/count/aliases) THEN they are implemented
  as the LayerManager's pinned mechanism, so dynamic allocation NEVER lands on them
- WHEN the operator uses a row's import button THEN one action performs import + create + Load
  onto that exact slot (exact-slot binding via the existing `reserve()`-class path)
- WHEN the resident item is THIS bridge's THEN the row exposes the full item verb set
  (Take/Update/Stop/Clear) declared ONCE via the [[R-013]] rowAction pattern
- WHEN the layer is occupied by anything else (another station's html graphic, or a non-html
  producer) THEN the row shows occupancy honestly and offers LAYER verbs only — hard Clear and
  graceful Stop — never Take/Update (no field schema for a foreign item)
- WHEN the bridge restarts with an item on a fixed layer THEN the item survives ON THE SAME
  layer — restore must adopt-in-place, never fall through to allocate-elsewhere
- WHEN multiple stations drive one CasparCG THEN fixed rows and their verbs behave identically
  whichever station issued the original load

**Notes:** **THE structural risk, flagged loudly:** inside the fixed range, operator Clear
works on ANY producer INCLUDING non-html — a deliberate, owner-approved carve-out of
[[R-015]]'s foreign-refusal, justified because the fixed range is explicitly
operator-designated territory ("always able to manage or clear a known layer"). Outside the
range, R-015 is untouched. This is the THIRD ownership notion next to the producer-kind
discriminator ([[R-015]]/[[C-014]]/[[R-009]]) and [[C-015]]'s Live Source layer ledger — the
three MUST be designed to compose, and this item's design.md owns that composition. Restore
interaction with [[B-092]]/#368's narrowing needs its own tests: restore reaches `reserve()`
first, and #368 made a quarantined retained slot fall through to allocate-elsewhere — exactly
the fall-through this item's adopt-in-place FORBIDS on fixed slots. Needs design.md.
**Design phase done (2026-07-23):** `openspec/changes/runtime-fixed-layers/` — design-only
change dir (proposal + design.md resolving the composition/restore questions + specs delta +
fully-unchecked tasks.md). The four flagged decisions (a1/b1/d1/e1) were ANSWERED by the
owner the same day and are encoded in the change; no open decision blocks implementation,
which remains a later PR.

## [ ] R-022 — in-app template preview via the shared renderer (no CasparCG involvement) ⟨priority: medium⟩

**What:** See a graphic BEFORE take. The Runtime mounts the item's template with the CURRENT
field values using `@cg/template-runtime` — the same renderer the Designer preview uses — in a
preview pane. No CasparCG involvement, no second channel.
**Why:** Today the first time an operator sees a filled-in graphic is on program output; a
local preview catches wrong values and broken layouts before air.
**Acceptance:**

- WHEN an item is previewed THEN its template renders with its current field values and
  re-renders on edits
- WHEN previewing THEN the intro/lifecycle plays, so motion is assessable
- WHEN the preview is shown THEN two honest caveats are stated IN the item: browser-vs-CEF-71
  rendering may differ in detail ([[B-066]] class — "faithful, not pixel-identical"), and after
  [[C-015]] a Live Source region renders as a labeled placeholder, not video
- WHEN previewing THEN nothing is ever sent to CasparCG

**Notes:** deliberately NOT a server-side PVW channel — that would require solving [[C-016]]'s
return problem twice; a server-true preview can be a later item if ever needed. Implementation
touches renderer surfaces → `gate:e2e` owed at implementation time.

## [ ] R-023 — per-fixed-layer keyboard shortcuts (Play / Stop / Clear now; PAUSE and NEXT recon-first) ⟨priority: medium⟩

**What:** Operator keys per FIXED layer (depends on [[R-021]]): e.g. F1 = Play layer 1,
Shift+F1 = Stop layer 1. A management modal lists the fixed layers (with aliases), captures key
combos per verb, prevents conflicts, and persists in the same install config as the fixed
layers.
**Why:** Under time pressure an operator fires known layers by muscle memory, not by mousing to
a row — this is the Cinegy operating rhythm the fixed layers exist for.
**Acceptance:**

- WHEN the management modal is used THEN shortcuts are assignable per fixed layer for Play,
  Stop (graceful), Clear — these three ride existing verbs; PAUSE and NEXT are RECON-FIRST
  (see Notes) and ship only after recon
- WHEN a combo is assigned THEN conflicts are prevented at assignment time — a combo can bind
  once
- WHEN focus is in any text input THEN shortcuts are inert
- WHEN the app restarts THEN combos survive (config-persisted)
- WHEN the modal lists layers THEN it shows aliases, not bare numbers

**Notes:** RECON-FIRST for the two uncertain verbs — PAUSE: what AMCP `PAUSE` actually does to
an html-producer layer on real 2.3.2 is UNVERIFIED (probe first, never assume); NEXT: requires
template-side step support (`CG NEXT` → template `next()`), which is Designer-track work on the
playout lifecycle — a cross-track dependency: file the finding rather than assuming. Combos
match the PHYSICAL key (`e.code`) per the design-system keyboard rule, so a Persian layout
never breaks them. Cross-ref [[R-021]].

## [ ] R-024 — save/load operator rundowns as files (JSON export/import of the prepared stack) ⟨priority: medium⟩

**What:** Each operator saves their prepared list and re-loads it on demand. Export/import as a
FILE (JSON) so rundowns move between stations.
**Why:** Cinegy parity, newsroom workflow: shows are prepared in advance and re-used; today the
prepared stack lives only in one browser's retention.
**Acceptance:**

- WHEN the operator exports THEN the file captures the stack: items referencing library
  templates by id, field values, position overrides, fixed-layer bindings, order
- WHEN the operator imports THEN the stack is rebuilt from the file
- WHEN a referenced template is missing from the library THEN a legible PER-ITEM error is shown
  and the REST of the rundown still loads — never a silent drop and never a whole-file failure
- WHEN the file carries Persian text THEN it round-trips verbatim
- WHEN a rundown has loaded THEN its items behave as ordinary items afterwards — retention,
  restore, verbs unchanged

**Notes:** embed-template-content-vs-reference is a design.md decision (reference is the v1
default; record the portability trade-off). Cross-refs [[B-092]] (retention is today's
implicit persistence — this makes persistence explicit and named), [[R-021]] (fixed-layer
bindings are part of the captured shape), [[C-002]] (the preset/rundown control-surface stub:
THIS item is the file half over today's stack; the two must converge, not fork).

## [ ] R-025 — named, device-level position presets in the PositionPicker ⟨priority: low⟩

**What:** Save a position override (e.g. "top-right, dx=-200, dy=100") under a name and reuse
it across projects. Device-level (the [[D-126]] shared-library class, `designer.md`), so
presets survive projects and tabs.
**Why:** Stations converge on a handful of house positions; re-nudging them per item per
project is repeated work and drifts.
**Acceptance:**

- WHEN using the PositionPicker THEN the operator can create / apply / rename / delete named
  presets
- WHEN a preset is applied THEN it goes through the normal setPosition path ([[R-011]]), so
  on-air behaviour is identical to a manual nudge
- WHEN presets are stored THEN they persist device-level (bridge-side store, shared across
  operator tabs) and survive restarts
- WHEN a preset name is Persian THEN it renders fine

**Notes:** storage shape/location is a design.md decision — alongside the existing bridge
persistence class (the `connection-store` precedent). Cross-ref [[B-072]] (the picker must
show preset-applied state truthfully — the same honesty bar).

## [ ] R-026 — WATCH a field's source text file: auto re-apply on change (RECON-FIRST) ⟨priority: medium⟩

**What:** The automatic half split out of [[R-018]]: when a field has a file source attached,
file CHANGES re-apply the field automatically with a debounce — no operator Reload click. The
ARCHITECTURE is the open decision this item exists to settle, and it is RECON-FIRST: no
implementation before the recon verdict is recorded in design.md.
**Why:** [[R-018]]'s manual reload covers the newsroom loop but still needs an operator
keypress per update; the incumbent workflow expects the crawl to follow the file. Split from
R-018 so the settled manual half could ship without blocking on this architecture call.
**Acceptance:**

- WHEN recon completes THEN design.md records the architecture decision with trade-offs:
  (a) BROWSER re-read — poll/re-read the retained FSA handle (or use FSA change observers
  where available): no bridge involvement, but the watch DIES WITH THE TAB and FSA is
  Chromium-only; vs (b) BRIDGE (Node) watching a PATH and pushing values: survives
  operator-tab reloads, works in any browser — but requires bridge involvement and requires
  the operator to RE-SPECIFY the file BY PATH, because an FSA handle cannot be converted to a
  filesystem path (the handle≠path consequence, recorded at [[R-018]]'s split)
- WHEN watching is enabled on a field THEN file changes re-apply it automatically, debounced
  (rapid successive writes coalesce; no partial-write flicker on air)
- WHEN the file becomes missing/unreadable while watched THEN the current on-air value is KEPT
  and a legible error is shown — [[R-018]]'s missing-file safety, unchanged
- WHEN watching stops (tab reload under a browser watch; bridge restart under a bridge watch)
  THEN the operator can SEE that the field is no longer following the file — a silently dead
  watch is the failure mode this item must not ship with
- WHEN content is Persian/RTL THEN it survives verbatim — never digit-normalized (the
  [[R-018]] rule)

**Notes:** [[R-018]]'s `TextFileSource` abstraction
(`apps/runtime/src/renderer/features/inspector/textFileSource.ts` — a `read(): Promise<string>`

- display name behind the FSA handle) is the seam that keeps EITHER outcome cheap: a
  bridge-fed or observer-fed source drops in as a second implementation without touching the
  split/apply/error logic or its tests. Bridge involvement (option b) is what made the original
  combined item recon-first. Cross-refs [[R-018]] (the manual half + verbatim rules), the
  Designer-track [[D-138]] (authoring-time load, one-shot — no watch there).

## [ ] R-027 — operator pause/resume control for a playing template (and the D-128 §3.5/§3.5b on-air verification it unblocks) ⟨priority: medium⟩

**What:** Give the Runtime an operator affordance to PAUSE a playing template and RESUME it —
today `@cg/runtime` has none, at any surface (stack row, fixed-layer row, keyboard). Scope
(control surface, whether it is browser-side clock suspension or an AMCP verb, and which layers
it applies to) is part of this item, not assumed by it.
**Why:** Two independent reasons. (1) Operators ask for it — a held graphic that must wait on a
live event has no "hold here" control today, only Stop/Clear. (2) It is the missing TRIGGER for a
verification the platform owes: the Designer-track seek/resume-elimination work (`RESUME GRACE`,
the large-gap policy, `CONVERTER_REVISION` 2026-07-25.5's alignment fix) is verified only
off-hardware, because D-128's Phase-6 on-air smoke could not run §3.5/§3.5b — there was no way to
pause anything on air. That verification stays owed until this control exists.
**Acceptance:**

- WHEN a template is playing and the operator invokes pause THEN the graphic freezes on air and
  the surface shows it as PAUSED — never as playing, and never as stopped
- WHEN the operator invokes resume THEN playback continues from where it froze, with no visible
  jump, restart, or re-entry of the intro
- WHEN a template with a VIDEO element (D-128) is paused and resumed on real CasparCG 2.3.x CEF
  THEN D-128's runbook §3.5 (pause/resume) and §3.5b (background-throttle soak) can be executed,
  and both pass — no drift stutter, no black frame, no desync from the composition clock
- WHEN a scene carries TWO video elements THEN the "clean pause/resume" half of D-128's §3.6
  (untested for the same reason) also passes
- WHEN the affordance does not exist for a given layer/producer kind THEN no control is offered
  for it (never an enabled control that can only reject — the R-021 stage-2b rule)

**Notes:** **Filed 2026-07-27 as an INDEPENDENT follow-up when D-128 was archived — its status
has no bearing on D-128's, in either direction.** D-128 shipped and archived
(`openspec/changes/archive/2026-07-27-video-import-element/`) with §3.5/§3.5b recorded as NOT
EXECUTED rather than passing or waived; the owner decoupled the case rather than block the change
on a Runtime capability with no timeline. The remaining work here is a Runtime capability plus,
once it lands, an on-hardware re-run of those three D-128 cases against the already-shipped
feature — see the archived change's `design.md` ("Phase 6 — FINAL verdict (2026-07-27)") for the
exact cases and their preconditions. RECON-FIRST on the AMCP half for the same reason [[R-023]]
records: what AMCP `PAUSE` actually does to an html-producer layer on real 2.3.2 is UNVERIFIED —
probe first, never assume; a browser-side clock suspension may be the honest answer. Cross-refs
[[R-023]] (per-layer shortcuts — its PAUSE key depends on this item existing), [[R-021]]
(fixed-layer rows are one candidate surface). Cross-track filing: raised from the Designer track
(the `cg-designer` worktree) because that is where the gap surfaced; the item itself is
Runtime-track work.

## [~] R-028 — one layer surface: declared rows replace the dynamic stack (supersedes R-021's parallel-bank framing) ⟨priority: high⟩ — PARTS A + B landed (see `openspec/changes/runtime-unified-layer-rows/`); §§6–7 landed 2026-08-14. **§6 — retiring the dynamic path:** the sweep's narrowing is now written against ONE canonical enumeration of the THREE declared classes (`CasparRuntime#declaredLayerClass` → `playout | live-source | operator-row | null`), each arm delegating to that class's existing single source and re-deriving none of them. It returns a CLASS and not a boolean deliberately: the three make DIFFERENT claims, and an `isDeclared()` would have collapsed them into the strongest one — silently excluding the operator bank from the sweep, which is the two-of-three narrowing 6.5 was written to prevent. C-015 phase 5's three doors (the `#liveLayers` ledger, the R-009 sweep exclusion, the C-014 quarantine skip, `clearLayer`'s distinct `live-source` refusal) were PRESERVED, not rewritten: all seven door tests re-run and green by name. 6.1 is TWO tests because the claim has two halves — no OPERATOR-graphic caller of `allocate()` (renderer source scan, plus a guard that the exact-slot row load still exists so the absence cannot be met by deleting the feature), AND a declared non-operator caller still allocating across the freed 10–59 span, which is the half that keeps C-015's third ownership class legal. 6.4's ranges are DESCRIPTIVE, recorded beside both the policy and `TemplateTypeSchema`: `logo-bug`'s range moved (90–99 → 40–49) and the TYPE did not go with it — it travels in every `.vcg`. **One divergence from §6.2's wording, stated rather than coded around:** "candidates become layers nobody declared" would exclude the operator bank, and DECLARED ≠ OWNED — a row declares the layer is the operator's to USE, so a producer there we did not put there is an orphan, and since an unbound row now reads EMPTY unconditionally, excluding it would report it NOWHERE. **§7 — migration:** items on old dynamic layers are NOT auto-relocated (asserted as a behaviour, not trusted to the absence of migration code), and the operator guide gains an "Upgrading from the old dynamic stack" note; two adjacent falsehoods in that section were fixed in passing (the bridge-restart warning R-021 stage 4 retired, and "the slot count can GROW", false since part A's `resize-refused`). **Linux `gate:e2e` DISCHARGED** for the §6/§7 slice — https://github.com/yasermostafaee/cg/actions/runs/31760214543 (run 31760214543, `dev` HEAD `6ee4c5d4` which contains `25c21420`; completed + success, `e2e` job RAN). **OWED:** 8.1's wider operator-guide rewrite (the guide still describes a FIXED LAYERS panel part B deleted) and 9.3's hardware pass. Remaining: §8 docs, §9 gate/hardware

**What:** Merge the fixed-layer bank and the dynamic stack into ONE operator surface — a single
list of DECLARED layer rows, ordered descending by layer, each with an alias, the real CasparCG
layer number, its template, a description and a state indicator. One Load button does the whole
chain (pick a `.vcg` → register → bind to that exact slot → load). No Library panel, no separate
Stack panel. Config declares a FIXED ceiling of candidate layers with a per-layer visibility tick;
every candidate is fenced from automatic allocation regardless of its tick. Verbs are LOAD · PLAY
· NEXT · UPDATE · STOP · CLEAR · REMOVE with THIS project's C-012 semantics. Ranges: playout
60–69, Runtime rows 70–99.
**Why:** The owner has seen R-021 stage 3 running (#419) and rejected its core premise. R-021 was
designed as a fixed bank running BESIDE the dynamic stack — two surfaces, two ownership models,
one operator. The deployment reality is ONE bridge with MANY browsers (two operators on different
machines, or the same operator on a different browser tomorrow), so an item another browser loaded
is NOT foreign: the bridge loaded it and knows its template. And three writers touch layers, not
two — our Runtime, the PLAYOUT system sending `CG ADD`/`PLAY` directly, and anything else. A
surface built around per-browser dynamic allocation cannot express any of that. Reference product:
Cinegy CG (its LAYOUT, never its vocabulary — see the verb trap below).
**Acceptance:**

- WHEN the operator loads from a row THEN the item binds that row's EXACT layer via the
  exact-slot path, never automatic allocation
- WHEN any row is displayed THEN its REAL CasparCG layer number is visible (a display index may
  sit beside it, never instead of it) — an operator may need it to clear that layer by hand
- WHEN a candidate layer is unticked THEN its row hides AND the layer stays fenced — unticking
  never returns a layer to an allocatable pool
- WHEN the operator tries to untick a row that is occupied, OR whose occupancy is UNKNOWN THEN it
  is refused (fail closed — unknown is never treated as empty)
- WHEN a second browser connects to the same bridge THEN it shows the same rows, the same
  template identity and the same verbs — "not remembered" applies only across a BRIDGE restart
- WHEN a row is in the declared playout range THEN it is visible and labelled playout-owned with
  honest occupancy and NO operator verbs, and R-009's sweep never surfaces it as an orphan
- WHEN the operator invokes STOP THEN the outro runs and the producer stays resident (C-012) —
  the reference product's inverted labels are NOT adopted
- WHEN the loaded template has no next step THEN NEXT is not offered as an enabled control
- WHEN the bridge restarts THEN every item returns to its OWN row's layer, never another
- WHEN an install with items on dynamic layers is upgraded THEN nothing on air is auto-relocated

**Notes:** **DESIGN ONLY so far** — see `openspec/changes/runtime-unified-layer-rows/`
(`proposal.md`, `design.md`, spec delta, `tasks.md` all unchecked). Filed as a NEW change rather
than a revision of `runtime-fixed-layers`, because that change has FOUR stages already merged
(1, 2a, 2b, and stage 3 via #419) and revising it would rewrite the recorded intent of shipped
work. **#419's plumbing STAYS** and is this model's foundation — `bindFixed`, the
`fixedLayers.load` channel, the exact-slot import chain. **[[R-021]] stage 4 is NOT superseded and
becomes load-bearing:** with every item on a declared row, task 3.1's restore fall-through would
misplace EVERY item after a bridge restart rather than an edge case — it is a prerequisite here.
Two owner calls are OPEN and block implementation: where template files live under many browsers
(the library is BROWSER-LOCAL today, so operator B cannot see what operator A imported), and
whether the `CG NEXT` wire gap is in scope (`command-builder.ts` has no NEXT verb — the template
contract has `window.next`, the bridge cannot send it). Verified during design, not assumed:
layers 90–99 are free at runtime (`pinned` is declared but NEVER populated by any caller), though
`logo-bug` remains a `templateType` in the scene schema even when its range is freed;
`reservedLayers` (C-015) is the only possible mechanism for the playout split because OSC reports
producer KIND, not identity — without declaration R-009 flags healthy playout graphics as orphans.
**C-015 stops being distant** — it is a prerequisite. One RECON owed: whether CasparCG 2.3.2
exposes template identity beyond producer kind, via `tools/caspar-amcp-probe` on real hardware.

## [~] R-031 — the operator surface, as the owner described it: one Layers section, no Library, verbs on the row ⟨priority: high⟩

**What:** The concrete UI shape [[R-028]] resolves to, stated by the owner in review and filed
here because it was decided in chat and would otherwise exist only in a prompt. (1) The NUMBER of
layers and which are active is set in Settings. (2) The Library panel is DELETED — not hidden,
not collapsed. (3) Fixed Layers and Stack MERGE into one list, and what remains is the layer
list. (4) The section is called just **Layers** — with one list, "Fixed" distinguishes nothing.
(5) **Load means import + load together, in one action.** (6) Nothing is ever appended to a list
below — the stack model goes away entirely. (7) The verb buttons live on the layer ROW. (8) The
buttons MAY be present before a load, rendered DISABLED when that layer has no template.
**Why:** R-028's design settled the model; this is the owner's own description of what the
operator actually sees, and several points are not derivable from the design (the deletion of the
Library rather than its demotion, the section's NAME, and point 8's disabled-not-absent rule).
Point 8 is the one that looks like a contradiction and is not: [[R-021]] stage 2b forbids an
ENABLED control that can only reject, which a DISABLED button is not. A fixed control set that
lights up as state changes is legible under time pressure; controls that appear and disappear
move the target under the operator's hand. **Point 8 wins as written — do not "correct" it back
to hiding the buttons.**
**Acceptance:**

- WHEN the Runtime is opened THEN there is ONE section named Layers, and no Library panel exists
  anywhere in the product
- WHEN a row has no template THEN its verb buttons are present and DISABLED (never absent, never
  enabled-and-rejecting)
- WHEN the operator uses a row's Load THEN one action imports the `.vcg` AND loads it onto that
  row's exact layer
- WHEN an item is loaded THEN it appears on its own row and nothing is appended to any list below
- WHEN the candidate layers are configured THEN that happens in Settings, not on the row

**Notes:** Implemented in R-028 part B (`dev-r028-b`): `features/layers/LayersPanel.tsx` +
`LayerRow.tsx`, with `LibraryPanel`, `StackPanel`, `StackRow`, `FixedLayersPanel` and `FixedRow`
DELETED. Template REMOVAL was re-homed into the template picker dialog — it had no other surface
once the Library panel went, and losing a shipped capability (R-005) silently would have been
worse. Settings-side candidate-layer editing is the existing bank config modal, reached from the
Layers header. See `openspec/changes/runtime-unified-layer-rows/DEBT.md` for what part B left
owed (E2E suite, hardware pass).

## [~] R-032 — a PLAYOUT tab: see and clear what the playout system has on the reserved layers ⟨priority: high⟩

**What:** A second tab beside Layers, listing the DECLARED reserved (playout-owned) layers and
what is on each. When something is present on a reserved layer a **yellow indicator appears on
the tab** so the operator knows without opening it. Opening the tab lists the occupants and
allows clearing — individually and all at once. **This REVERSES [[R-028]] task 5.3's "playout
rows offer NO operator verbs"**: the main Layers list still offers none, but this tab does.
**Why (the owner's reasoning, which IS the specification):** the original rule against clearing
layers that are not ours existed to prevent accidentally killing the antenna layer itself, or a
live channel. Now that the graphics layers are declared in advance, even a graphic the playout
system put on 60–69 is something the operator should be able to see and clear.
**Acceptance:**

- WHEN something is on a declared playout layer THEN a yellow indicator appears on the tab, and
  opening it lists every reserved layer with what is observed on it
- WHEN an occupant is an `html` producer THEN a clear is offered, individually and via clear-all
- WHEN an occupant is ANY other producer kind (video, route, decklink, unrecognised) THEN NO
  clear control is offered at all and the row says why — the bridge refuses it independently
- WHEN a layer's occupancy cannot be verified THEN it reads as UNKNOWN in its own right (never as
  empty), and no clear is offered
- WHEN clear-all is invoked THEN it is confirm-gated, names how many and WHICH layers, states
  plainly that these are not our layers, and EXCLUDES every non-html and unverifiable occupant
- WHEN the R-009 orphan sweep runs THEN reserved layers are still excluded from it, and
  `layers.clear` still refuses them — automatic paths never touch these layers

**Notes:** The three constraints are not optional and are what make the reversal safe: **(1)
automatic never, deliberate yes** — part A's sweep exclusion and `layers.clear` refusal stand
UNCHANGED; this is a separate channel (`playoutLayers.clear`) reachable only from a labelled tab
the operator opens on purpose. **(2) html only** — the reservation is a claim about who owns the
LAYER, never about what is on it; a video landing there (including by the playout operator's own
mistake) is exactly the antenna/live-channel accident the reservation exists to prevent. **(3)
unknown is not empty** — fail closed, as [[R-028]]'s untick refusal and task 3.3 already do.
**The kind gate's boundary, stated honestly:** it guarantees "never a non-graphic". It does NOT
guarantee "never something important" — an html producer on a playout layer may well be the
station's own on-air graphics package, and clearing it takes real graphics off air. That is
accepted and intended; the wording must not imply a stronger promise. **Premise verified on the
station's running CasparCG 2.3.2** (R-028 task 1.3's recon, finally run): producer kind IS legible
for layers this bridge did not create — four foreign `html` producers observed via both the OSC
tap and AMCP `INFO` — and the occupancy tap stores the kind verbatim with no defaulting, so a
non-html producer cannot be misread as html. Still owed: observing the NEGATIVE case (a video on a
reserved layer) on hardware. Implemented in R-028 part B.

## [ ] R-033 — the Layers surface as a table: neutral controls, state carried by icon, channel as the outer axis ⟨priority: high⟩

**What:** The owner's visual review of the R-028 part B surface, filed because it was given in
chat and would otherwise be lost. Twelve items: (1) **row number** 1..n is the primary
identifier, left-aligned, with the REAL layer number kept on the row as a small fixed-width
secondary; (2) **alias is the row title**, template name and description beneath it; (3) a rigid
column grid — nothing moves horizontally when any text changes length, ellipsis inside the
column; (4) **channel tabs as the OUTER axis**, LAYERS/PLAYOUT inside a channel (one channel for
now, assume channel 1); (5) graceful degradation under panel drag — verbs collapse to icon-only,
text truncates, the row never wraps, no horizontal scrollbar; (6) **one tooltip mechanism**
inherited by default, matching the Designer; (7) **PGM/Preview reserved now** as labelled
not-connected panels, resizable and fullscreen-able; (8) the Configure modal scales to the
configured layer count and scrolls; (9) the **whole row is the click target**, edge to edge,
controls excepted; (10) **neutral buttons, colour on hover only** — row state carried by a large
coloured icon; (11) a real **table with a sticky header** plus icon-only verbs; (12) the
**fullscreen affordance as a property of the panel primitive**, so every panel has it.
**Why:** the reference is Cinegy's CG panel. The through-line is that in a control room the one
question that must be answerable at a glance is _what is on air_ — and today five competing
button colours per row leave that question nowhere to shout from. Making the controls neutral
gives the state hues back their meaning.
**Acceptance:**

- WHEN any row's alias, template name or state text changes length THEN no other element on any
  row moves horizontally
- WHEN the operator clicks anywhere on a row except a control THEN that row is selected —
  including the extreme left edge, and including empty rows
- WHEN a button is hovered THEN its treatment comes from OUTSIDE the state hues (or is a
  brightness/elevation change) — hovering PLAY must never flash the red that means ON AIR
- WHEN a row is disabled versus enabled THEN the two are obviously different on the dark
  background at a glance, without colour doing the work
- WHEN a row state is shown THEN icon AND colour distinguish it — on air, cued, empty, error and
  unknown are each distinct, and `unknown` never reads as `empty`
- WHEN the panel is dragged narrow THEN columns drop in the order description → template name →
  layer number; the verb columns NEVER drop, the row never wraps, and no horizontal scrolling is
  needed to reach a control
- WHEN a verb is icon-only THEN a visible column header names it, it keeps an `aria-label`, and
  it keeps a hover tooltip — three complementary channels, not one substituting for another
- WHEN the hit target is measured under a dense table THEN it still meets the declared minimum

**Notes:** **Two items are structural and must come FIRST because retrofitting them is
expensive.** (a) Channel is the OUTER tab level with LAYERS/PLAYOUT inside it — "Channel 1 |
Channel 2 | Playout" in one strip is ambiguous about whose playout it means, and the reservation
is per-channel so the yellow indicator must be attributable to a channel; invisible at one
channel, a correctness bug at two. (b) Fullscreen and tooltips belong to a shared panel/control
primitive, so PGM, Preview and anything added later inherit them instead of being hand-wired and
missed. Also: item 10's "destructive stays neutral" is deliberate and must not be
"fixed" back to a red REMOVE — the confirm gate is what protects that action, and red is
reserved for air. Item 11's icon-only verbs are only safe BECAUSE the sticky header carries the
label; do not ship one without the other. **Open config question for the owner, not for CC:** the
candidate ceiling is currently four layers (70–73) while R-028's design records 70–99 as
available — if the demo needs more than four simultaneous rows that is a config decision to take
before the demo. Filed from `dev-r028-b2`; see `openspec/changes/runtime-unified-layer-rows/DEBT.md`.

## [~] R-029 — cueing a graphic puts its audio on air before the operator takes it ⟨priority: high⟩ — CONTAINMENT LANDED 2026-08-14 in `openspec/changes/live-source-multibox/` (task 6.5a); the HEAD bullet is NOT discharged and this item stays `[~]` for it alone, see below

**What:** Make template audio start at the **take**, not at the **cue**. Today `CG ADD` with no
`PLAY` already produces audio on the channel, so an operator preparing a graphic is heard on air
while the graphic itself is still hidden. Decide and implement the containment; the three
candidate mechanisms are recorded below and **none is chosen yet**.
**Why:** Cue-then-take is the core operator gesture — the whole point of loading ahead is that
nothing reaches air until the take. Audio that ignores that boundary makes cueing unsafe, which
in practice means operators stop cueing and start taking blind. It also lands directly on
[[C-019]]: authoring audio into templates ships this defect to every template that has sound, so
this is an INPUT to that item, not a follow-up to it.
**Acceptance:**

- WHEN a template carrying audio is cued (`CG ADD`, not yet played) THEN nothing from it is
  audible on the channel output
- WHEN that cued item is then taken (`PLAY`) THEN its audio is audible, from the start of the
  audio — containment must not eat the head
- WHEN the containment mechanism is chosen THEN this item records WHICH mechanism, and states
  in words which command sources it does NOT cover
- WHEN the template-side option is part of the chosen mechanism THEN it is enforced at
  export/validate time, not left to authoring convention

**Evidence:** measured by the [[C-018]] recon at **0.24 s after `CG ADD`**, while the page was
still stage-loaded and hidden — `/channel/1/mixer/audio/volume` nonzero with no `PLAY` sent.
Confirmed by ear at the box on **2026-07-28** during the same owner checklist that confirmed
audible audio and working `MIXER VOLUME` (see [[C-018]]'s owner-checklist results). This is
2.5.0 behaviour and it is a direct consequence of the fix C-018 wants: on 2.3.x template audio
never reached the channel at all, so the defect could not exist there.

**LANDED 2026-08-14 (task 6.5/6.5a).** The mute is emitted in `#sendAdd` — the SINGLE `CG ADD` emit
chokepoint — so all four of its callers are covered by one implementation rather than by three
remembered guards, and `live-add-mute.integration.test.ts` pins each site individually **on the AMCP
trace**. A mute that FAILS does not proceed to the ADD (`add-mute-failed`): the mute is not a
courtesy step around the load, it is the condition under which loading is safe.

**MECHANISM CHOSEN 2026-08-08 — option 2, bridge-side, inside `live-source-multibox`.** The owner
folded this item, [[R-042]] and [[B-121]] into one wave (`live-source-multibox` design.md §7 and
§12.4): **every producer the bridge creates is created muted; audio is raised only by an explicit,
recorded intent naming the layer.** For `CG ADD` the `MIXER … VOLUME 0` lands **BEFORE the ADD** on
the wire (an ADD-then-mute is the same leak, shorter — [[R-042]]). The unmute is not newly built:
`take()` already re-asserts `INTENDED_VOLUME` unconditionally on every take
(`caspar-runtime.ts:1597-1601`), and that re-assert IS the explicit intent.

**Command sources it does NOT cover, stated as this item's third acceptance bullet requires:** the
company's PLAYOUT system sends `CG ADD` / `PLAY` to CasparCG directly, on layers this bridge never
touches. Nothing bridge-side can mute those, and no template-side convention binds a template we did
not author. That is option 3's gap and it remains open by construction.

🔴 **NOT DISCHARGED — the second acceptance bullet, the head.** _"WHEN that cued item is then
taken THEN its audio is audible, from the start of the audio — containment must not eat the head."_
A bridge-side mute cannot deliver this and `live-source-multibox` does not claim it: on 2.5.0 the
audio is **already running** at `CG ADD` (that is the defect), so a mute held from ADD to take
unmutes **mid-stream** — the head is eaten by however long the operator cued ahead. Closing it needs
**option 1**, gating audio on the template's own `play()` lifecycle and **enforcing that at
export/validate time**, which is a `@cg/template-runtime` + exporter change and is deliberately out
of `live-source-multibox`'s scope. **This item therefore stays `[~]` carrying exactly that residual**
— read the `[~]` as "the leak is contained", never as "the audio question is answered".

**Containment options — recorded, NONE chosen:**

1. **Template-side** — gate audio on the template's own play lifecycle rather than on load
   (start on `play()`, not on DOM/stage load). This is the RIGHT fix in the sense that the
   template is where the lifecycle actually lives, and it is the only option that survives any
   command source. But it binds **only templates we author**, so it is worth nothing as a
   convention: it must be **ENFORCED at export/validate time** — a template that starts audio
   on load fails to export — or it will hold until the first template authored elsewhere.
2. **Runtime/bridge-side** — `MIXER <layer> VOLUME 0` on ADD, restore on PLAY. **Technically
   confirmed to work** (the same MIXER control validated in C-018's checklist). Covers every
   template regardless of who authored it, but only for commands **we** send.
3. **Neither option covers the PLAYOUT system**, which sends `CG ADD`/`PLAY` directly from
   outside our code — the three-writers finding in [[R-028]]'s design
   (`openspec/changes/runtime-unified-layer-rows/design.md`). A graphic cued by the playout
   system carries whatever the template does on load, so option 1's export gate is the only one
   that reaches it — and only for templates that went through our exporter.

**Notes:** Filed from the C-018 hardware pass; no code rides this item yet. Sequencing matters
more than usual: if [[C-019]] ships template audio before this is decided, every audio template
authored in the meantime bakes in whichever behaviour the exporter allowed at the time.

## [ ] R-030 — output placement must know the channel raster ⟨priority: medium⟩

**What:** Give play-out placement the real channel geometry, and scale the stage to it. R-011's
"author small, place anywhere" is already implemented — but against a **hardcoded 1920×1080
output frame**, so on any other channel raster the anchors are computed against the wrong frame
and the scene overflows. The approach is DECIDED (below): keep 1920×1080 as the reference frame
and apply one uniform scale at play-out.
**Why:** The [[C-018]] recon hit exactly this — the rebuilt 2.5.0 config is stock **720p5000**
while the plant runs **1080i5000**, and a 1920×1080 scene overflowed the 720p channel. It was
worked around with `CG 1-10 INVOKE 0 "scrollTo(0,360)"`, which is a diagnostic trick, not
something that can be on air. Any channel-format decision — and the 2.5.0 cutover forces one —
currently changes where every graphic lands.
**Acceptance:**

- WHEN a scene plays on a 1920×1080 channel THEN the output is pixel-identical to today
  (`scale` = 1 — the no-regression bullet)
- WHEN a scene plays on a 1280×720 channel THEN the stage root is uniformly scaled and every
  anchor and offset lands proportionally correct, with no overflow and no `scrollTo` workaround
- WHEN the bridge supplies channel geometry as a query parameter THEN that is used; WHEN it is
  absent THEN `window.innerWidth`/`innerHeight`; WHEN neither is available THEN 1920×1080
- WHEN the channel is not 16:9 THEN the `min()` rule letterboxes rather than distorting
- WHEN the Designer preview renders THEN it still never calls the placement path — the author
  keeps seeing the comp at its own resolution

**What already exists** (`packages/template-runtime/src/position.ts`): a scene is built at its
own `scene.resolution` and translated onto the output frame by one of nine anchors, with the
operator override arriving as a bridge-appended query. The Designer preview never calls it, so
placement is output-only **by construction**.

> **PROSE CORRECTED 2026-08-02 — the paragraph that stood here described code that no longer
> exists.** It read: "`OUTPUT_FRAME` is hardcoded `{ width: 1920, height: 1080 }` at
> `position.ts:25`, and `applyOutputPosition` force-sizes `html`/`body` to it at
> `position.ts:110-111`." **`OUTPUT_FRAME` no longer exists anywhere in the code.** The two roles
> it used to conflate are now separate and separately named:
>
> - **`REFERENCE_FRAME`** (`position.ts:41`) — the authored coordinate space, deliberately a
>   constant 1920×1080. This is the reference the author sees, exactly as the DECIDED approach
>   below requires, and a test pins it (`tests/output-position.test.ts:232`).
> - **`resolveChannelRaster`** (`position.ts:153`) — the OUTPUT raster, resolved per channel.
>   `applyOutputPosition` calls it (`position.ts:260`), derives `outputScale` / `outputLetterbox`
>   (`:261`–`:262`), and sizes `html`/`body` to the **channel** raster (`:275`–`:276`).
>
> The rename was the point, not cosmetic: the old name asserted "output" while holding a constant,
> which is what made it a lie on any non-1080 channel. The seam described below did get supplied —
> the bridge reads `#channelSettings.rasterFor(slot.channel)` and appends `cw`/`ch` to the served
> URL (`tools/caspar-bridge/src/caspar-runtime.ts:3689`). This item stays `[ ]` because of the
> unmet acceptance recorded at the foot of this entry, not because nothing landed.

**DECIDED approach:**

- The **reference frame stays 1920×1080**; scene coordinates keep being authored against it.
  Nothing in the Designer, the schema or any existing document changes meaning.
- At play-out apply **ONE uniform `scale = min(channelW/refW, channelH/refH)`** to the stage
  root. Every existing anchor and offset calculation then stays correct **unchanged** — this is
  the reason for choosing scale over any coordinate rework.
- **Reflow is REJECTED**, and the reason is recorded so it is not reproposed: keyframes are
  authored in pixels, and line breaking and kerning are relative to authored boxes. Reflowing
  makes on-air output non-deterministic and breaks preview-equals-air — the property the whole
  placement design is built to preserve.
- **Channel geometry source, in order:** an explicit bridge query parameter; else
  `window.innerWidth`/`innerHeight`; else the 1920×1080 fallback.
- **Non-16:9 channels letterbox** under the `min()` rule — a known edge case, not a blocker.
  This plant is 16:9 throughout.

**Notes:** Filed from the C-018 recon; the approach is decided but no code rides this item yet.

**UNMET ACCEPTANCE — measured 2026-08-02, and this is why the item stays `[ ]`.** The third
acceptance bullet above specifies a three-source chain: _"WHEN the bridge supplies channel
geometry as a query parameter THEN that is used; WHEN it is absent THEN
`window.innerWidth`/`innerHeight`; WHEN neither is available THEN 1920×1080."_ Sources 1 and 3
work. **Source 2 can never run.**

The bridge appends `cw`/`ch` **unconditionally** — `caspar-runtime.ts:3689`, whose own comment
states the query "is never empty" because `rasterFor` falls back to the reference frame for an
unconfigured channel. `resolveChannelRaster` (`position.ts:153`) tries the query first and returns
on a hit (`:154`–`:155`), so the `window.innerWidth` branch (`:156`–`:158`) is unreachable in the
shipped product. It is exercised only by tests that pass an empty search string
(`tests/output-position.test.ts:145`).

**Why it matters, stated without overstating it.** Source 2 is the only source that would measure
what CasparCG's CEF _actually_ sized the page to, so it is the branch that would self-correct a
channel whose configured raster is wrong. Today an unconfigured channel is placed against
1920×1080 and the reading that could contradict it is never consulted on the placement path. The
mitigation is real and separate: `RasterMismatchBanner` compares the configured claim against
`INFO <channel>`, and because `ChannelSettingsStore.hydrate` back-fills every DECLARED channel
with the 1920×1080 default (`channel-settings-store.ts:106`), a declared-but-unconfigured 720p
channel does produce a `mismatch` and the banner does fire. The gap that remains is a channel
whose mode `INFO` cannot read: the verdict is `unreadable`, the banner stays silent **by design**,
and placement silently uses 1920×1080.

**This is recorded as an unmet acceptance of THIS item, not as a new defect** — the behaviour it
describes is the behaviour this item was filed to deliver. Closing `R-030` means either making
source 2 reachable (append `cw`/`ch` only when a channel is genuinely configured) or amending the
acceptance to drop a source the design does not want — a decision, not a bug fix.

## [~] R-034 — the delimiter list is CONFIGURABLE in settings, not hard-coded in the control ⟨priority: medium⟩ — FIXED and on `dev`: `openspec/changes/runtime-from-file-persistence/` (20/21 tasks), authored together with [[B-113]] because they are two defects in the same control. Gated on the SAME single remaining task 6.2 — an owner browser check on a Chromium that does not auto-grant — which is a File System Access question, not a delimiter one; one owner pass closes both items

**What:** the five delimiters offered under a list field are a hard-coded array in
`fromFileContent.ts` (`DELIMITER_SUGGESTIONS`). The owner asked for a section in settings where
the list can be added to and removed from, so a station whose source files use a separator nobody
anticipated can add it once rather than hand-typing it on every field, every session.

Pairs with [[B-113]], which makes the control a proper picker: once the operator cannot type a
delimiter inline, the configured list becomes the ONLY way to introduce one, so it must be
editable somewhere.

**Why:** the current list is a guess at what Persian broadcast source files use. It is right often
enough to look finished and wrong often enough to matter, and the cost of being wrong is an
operator retyping an escape sequence under time pressure. Configuration moves that cost to a
one-time setup step.

**Acceptance:**

- Settings offers a section listing the configured delimiters, each with the label the picker
  shows and the character(s) it splits on.
- A delimiter can be added, with a label, and appears in the field picker immediately.
- A delimiter can be removed, and disappears from the picker immediately.
- The list persists across a page refresh.
- Removing a delimiter that a field is currently using does not silently change that field's
  split: the field keeps splitting on what it was given.
- The list can never be emptied to nothing — a list field with split on must always have at
  least one delimiter to choose.

## [x] R-035 — a startup splash screen: the product's first frame ⟨priority: medium⟩ — shipped and archived: `openspec/changes/archive/2026-08-11-runtime-splash-screen/` (living spec `runtime-ui`). The Linux `gate:e2e` this UI change owed is DISCHARGED — <https://github.com/yasermostafaee/cg/actions/runs/31252541925>, commit `a344cd2`, run `conclusion: success`, `E2E (Playwright)` job conclusion `success` (it RAN); `splash.spec.ts` all 6 passed on Linux. The change's three remaining deferrals were RESCOPED OUT rather than done — they were never its scope: the placeholder brand → [[R-050]], the in-app about/version surface → [[R-051]], and the CDN font → folded into [[P-001]], which IS that fix, not filed as a duplicate

<!-- change: openspec/changes/archive/2026-08-11-runtime-splash-screen/ -->

<!-- Filed as R-031 by a session reading this file ON `main`, where R-030 was the highest in
     use; `dev` already held R-031 (the operator surface) in an unmerged fast-mode edit that
     `main` could not see, so the `origin/main` merge produced two R-031 entries. Renumbered
     to R-035 (the first free number above `dev`'s R-034) because this is the newer claim and
     all of its references sit in one place. The operator-surface R-031 is unchanged. -->

**What:** Give `apps/runtime` a startup splash — APASAI / **CG CONTROL**, a phase readout and a
progress rail — that is on screen from the FIRST PAINT until the app is genuinely ready, with a
minimum hold on a cold start. It replaces the bare `Connecting to bridge…` div the entry point
renders today. The markup and its critical CSS are INLINE in `index.html` so they paint with no
bundle and no network; a tiny inline script owns the clock and exposes `window.__CG_SPLASH__`
(`phase()` / `done()`), which the React entry calls at its real boot steps.
**Why:** The Runtime boots into an unstyled `Connecting to bridge…` line, so the product's first
frame is a fragment of debug text — and it cannot be fixed by a React component, because a
component cannot appear until the bundle has parsed and `createRuntimeBridge()` has resolved,
which is precisely the window that needs covering. On an on-air tool the first frame is also the
operator's confirmation that the right application came up on the right machine, which is why the
build stamp belongs on it.
**Acceptance:**

- WHEN the page is opened THEN the splash is painted on the first frame, before any application
  JavaScript has run
- WHEN the boot reaches a real step (initializing, bridge probe, interface start) THEN the phase
  readout names that step, and the rail and the readout show ONE value: the monotone
  `min(elapsed / floor, completed steps / total steps)` — a PERCENTAGE, gated by real steps so it
  is never ahead of boot, reading 100 exactly when the floor has elapsed AND boot is done
- WHEN boot completes THEN the phase label FADES OUT and the readout's left side is empty — there
  is no terminal `READY` label anywhere in the markup, CSS or script
- WHEN this is a cold start (no `CG_RUNTIME_SESSION` marker in `sessionStorage`) THEN the splash
  is held for at least 8000 ms; WHEN it is a warm reload THEN the floor is 3000 ms
- WHEN boot completes AFTER the floor THEN the hold extends to boot completion — the splash never
  hides a boot that is still running
- WHEN 20000 ms have elapsed since first paint THEN the splash dismisses regardless of boot state,
  and the app shows its own DISCONNECTED / error surface
- WHEN the bridge resolves to any of `live` / `offline-mock` / `disconnected` AND the app shell has
  made its first React commit THEN boot counts as done — snapshot pulls (stack / health / lock) are
  NOT part of the gate
- WHEN `window.__CG_SPLASH_DISABLED__` is set before app JS THEN the splash does not appear and boot
  is not delayed
- WHEN `prefers-reduced-motion: reduce` is set THEN the splash renders with no entrance animation
  and no fade

**Notes:** Company **APASAI**, product **CG CONTROL**; all splash copy is English. The real
APASAI mark is inlined in `index.html` (recoloured for a dark ground via three class hooks, never
by editing path data) — it is an auto-trace of a raster and must be replaced with the original
vector before any customer-facing release. **No red anywhere on the splash**: red is the sacred
air-state colour and decorative red is already forbidden across this UI ([[R-007]], `theme.ts`),
and the check is by hue band so coral is excluded with it — verified by a test, not merely
asserted. The chrome accent is APASAI's exact brand blue `#00AEEF`, a SPLASH-LOCAL value: the
app's own `--r-accent` sky is unchanged, which a test also pins. This is a display gate
layered ON TOP of the connection model — `createRuntimeBridge`, `WebSocketRuntime` and
`MockRuntime` are unchanged, and the live / offline-mock / disconnected tri-state, the
refuse-while-disconnected contract and the NOT CONNECTED / TEST MODE banners all stay as they are.
The 20 s ceiling is the safety property: a stuck splash on an on-air tool means the operator has no
door into the application at all. The test bypass is an init-script global and deliberately NOT a
URL query parameter — a query parameter is a door an operator can reach by bookmark or typo.

## [ ] R-036 — a version/shape marker on the persisted bridge configs ⟨priority: medium⟩

**What:** give the persisted bridge configuration files a marker that lets the bridge tell a
current file from one written under an older decision, and say so at boot.

**A SECOND SURFACE with the same concern, filed 2026-08-10:** [[C-022]] serves the installation's
live source list over HTTP for the plant's playout client to read. There the ambiguity is one hop
further out — a playout client must be able to tell _"this bridge does not have the feature"_ from
_"this installation has no sources"_ — so that endpoint carries a version or shape marker for the
same reason this item gives one to the files. Cross-referenced rather than merged: the mechanisms
differ (a file field vs. a response field) even though the failure they prevent is identical.

**Why:** the incident that prompted this was an office machine booting on a `count: 4` fixed-layer
bank written before the bank decision changed. Nothing was corrupt; the file was simply older than
the intent. The cheap half already shipped — the CLI prints the bank in force **and its source** at
every boot, so "which bank am I on, and why" is answerable without opening a file. **That reports;
it does not detect.**

**Costed and deliberately not built — the cost is in the design, not the field.** A
`schemaVersion` on `FixedLayerBankSchema` is the easy 10%. The other 90% is deciding what
**stale** means: the office file was schema-VALID, so a shape-drift marker would have said nothing
about the very file that caused the incident. Catching that case needs a written-at stamp compared
against a decision-changed-at constant the codebase must then carry and maintain — a different and
more invasive design than "add a version number".

**Acceptance:**

- A persisted config written before a decision change is distinguishable at boot from one written
  after it.
- The boot output says which it is, in words an operator can act on.
- A config the bridge cannot interpret degrades to a stated default rather than refusing to boot.

**DESIGN-FIRST — implementation needs an OpenSpec change before code.** It adds a field to a
persisted schema and defines what staleness means across bridge restarts, which is a migration and
a contract between the bridge and every config it has already written. Filed now so the debt is
recorded; the design is authored when the work starts.

**Notes:** do NOT ship a bare `schemaVersion` and call this done — that is the 10% that would not
have caught the reported incident. Source: `DEBT.md:195`.

## [ ] R-037 — the sequence item heading is technical, and the fix is a schema decision rather than a restyle ⟨priority: medium⟩

**What:** the remainder of `dev-b6-inspector-finish`, which landed seven of nine. Two pieces are
open and only the first is substantial:

1. **`ROTATOR — ITEM 3` reads as a constant, not as content.** The string comes from
   `sequenceItemNamespace(seq.name, index)` in `@cg/shared-schema`, where `seq.name` is the
   SEQUENCE ELEMENT's authored name. [[D-083]] already replaced the older `ROTATOR[2]` form for
   exactly this reason, so what remains is that a sequence named `ROTATOR` is itself technical.
2. **The `Split on delimiter` row's own alignment** was never separately revisited — the chip, the
   heights and the two-line gap were done to the owner's reference, that row was not.

**Why:** the Inspector heading is what the operator reads to know which item they are editing
under time pressure. A heading that shows an internal element name reads as a system label rather
than as their content.

**What is available, and why it is not a one-liner.** The COMPOSITION's authored name **is**
reachable (`child.name`, the referenced composition), but using it is a `@cg/shared-schema` change
that also moves the Designer form and the GDD — **and two items referencing the SAME composition
would then carry identical headings, which is precisely the collision D-083's index exists to
prevent.** The honest shape is probably `<composition name> — item N`.

**Acceptance:**

- A sequence item's Inspector heading names the authored content, not an internal element name.
- Two items referencing the same composition remain distinguishable from each other.
- The Designer form and the GDD move with the schema, not after it.

**DESIGN-FIRST — implementation needs an OpenSpec change before code.** It is a
`@cg/shared-schema` change with Designer and GDD ripples, not a restyle.

**Notes:** whoever takes this should also remove the `text-transform: uppercase` on the group
heading — it makes an authored `Rotator` read as a constant even after the naming is fixed.
Related: [[R-040]] is the other half of the same naming seam (two same-named sequences colliding).
Source: `DEBT.md:393` (§3) and `DEBT.md:406` (§7), inside the `dev-b6-inspector-finish` entry at
`DEBT.md:355`.

## [ ] R-038 — three clear-reason Zod enums narrow every failure to `amcp-error`, so the real code cannot ride out ⟨priority: medium⟩

**What:** `layers.clear`, `fixedLayers.clearLayer` and `playoutLayers.clear` all narrow their
failure reason to the literal `'amcp-error'` in a **Zod enum**
(`FIXED_LAYERS_CLEAR_LAYER_REASONS` and its siblings), so the real error code cannot travel to the
renderer **even though `#send` already has it**.

**Why:** the operator is told a clear failed without being told how. The wording half was already
fixed — the message is now honest ("it is not known whether…") — which was the part a
words-and-states pass could reach. The remaining half is that the channel cannot CARRY the fact,
so no amount of wording work can recover it.

**Acceptance:**

- A clear that fails with a known AMCP code reports that code to the renderer.
- A clear that fails with no known code still reports honestly, and does not manufacture one.
- The `amcp-<code>` passthrough that already works elsewhere is not weakened to accommodate this
  — it is the one place the mechanism IS known and it says so precisely.

**DESIGN-FIRST — implementation needs an OpenSpec change before code.** Widening the enums is a
`@cg/shared-ipc` change across three channels: a contract between the bridge and both renderers.

**Notes:** the honesty fix already shipped must not be "tidied" into making every failure vague —
that would trade a narrow-but-true message for a broad-but-useless one. Source: `DEBT.md:756`,
inside the `dev-offline-polish` entry at `DEBT.md:686`.

## [ ] R-039 — no E2E covers the scrub DRAG, only `arrowStep` ⟨priority: low⟩

**What:** the numeric/position inputs gained both a scrub drag and an arrow-key step. Only
`arrowStep` — the pure half — has an E2E. The drag itself lives in window pointer listeners and is
untested end to end.

**Why:** the drag is the half an operator actually uses, and it is the half that can break from a
change nowhere near the Inspector — window-level pointer handling is exactly the kind of thing a
shell or overlay change disturbs silently.

**Acceptance:**

- A Playwright spec drives the scrub drag with a `mouse.move` sequence and asserts the committed
  value.
- The existing `arrowStep` coverage is unchanged.

**Notes:** identified as worth adding at the time and not written. Source: `DEBT.md:1383`, inside
the owner UI review batch at `DEBT.md:1360`.

## [ ] R-040 — two same-named sequences produce IDENTICAL Inspector headings ⟨priority: low⟩

**What:** a sequence composition item's display label is built from the sequence ELEMENT's name
via `sequenceItemNamespace`, so two sequences both called `Sequence`, each with an item at
position 1, both render the heading `Sequence — item 1`.

**Why:** the operator cannot tell the two apart from the Inspector. **The data is fine** — the
value keys are distinct and id-based, so nothing collides or collapses; this is purely a display
limit. It is ASSERTED rather than assumed away
(`packages/shared-schema/tests/composition-fields.test.ts`, the "TWO same-named sequences" case).

**A previous comment claimed the operator disambiguates by element. They cannot** — the element
name is not shown in the Inspector, only the label. That comment has been corrected in place to
state the real limit, so this item is the fix, not the discovery.

**Acceptance:**

- Two same-named sequences produce headings an operator can tell apart.
- The existing test is updated to assert the new distinction rather than the current collision.

**Notes:** needs a wording decision before code — what the disambiguator is (position, parent, an
index) is a UI call, not a technical one. Related: [[R-037]] is the other half of this naming seam
and touches the same `sequenceItemNamespace`; a fix for either should consider both.
Source: `DEBT.md:1420`.

⭐ **THE SAME CLASS ARRIVED ON A SECOND SURFACE 2026-08-10, AND WAS FIXED THERE — read this before
assuming one fix covers both.** The owner reported two imported TEMPLATES both rendering as `seghab`
in the Inspector heading, indistinguishable. `templateDisplayName` prefers the imported FILE name,
and two packages can arrive from files called the same thing; the `templateId` that separates them
sat on the heading's `title` attribute, which is nowhere an operator looks. Fixed in
`openspec/changes/live-source-multibox/` (task 4d): the heading carries a short id STUB, shown ONLY
when another template in the registry shares the display name — a suffix on every heading is noise on
the overwhelmingly common single-template case.

🔴 **SAME CLASS, DIFFERENT ROOT CAUSE, and the distinction is why this item stays open.** The shared
class is _a display label derived from a non-unique human name, with the unique key present but
hidden_. **This** item is `sequenceItemNamespace` colliding two same-named sequence ELEMENTS inside
ONE template's field tree; that one was two same-named TEMPLATES. Neither implementation reaches the
other, so the 4d fix does not discharge this item — but its shape (disambiguate only when ambiguous,
using the key that is already in hand) is the obvious candidate for the wording decision this item
still owes.

## [ ] R-041 — no test pins the `#`-versus-alias model: divergence, alias stability, or gap-not-renumber ⟨priority: medium⟩

**What:** three properties of the layer `#` column and the default row alias are unpinned by any
test:

1. **They can DIVERGE.** `#` is plain DISPLAY ORDER — 1 at the top of the rendered list, counting
   down. The default alias is `Layer <bankPosition>` — the layer's FIXED place in the bank,
   counting down from its highest layer, so `Layer 1` is always layer 99. With the shipped bank
   (70–99 declared, top five ticked) they read identically. **Untick 97 and the third visible row
   is `#3` while still being `Layer 4`.**
2. **Alias STABILITY.** The alias must never renumber when rows are ticked or unticked — the
   owner's explicit constraint, because "`Layer 2` would mean different rows on different days".
   Divergence is the accepted cost of that stability.
3. **Gap-not-renumber.** Hiding a row leaves a GAP in the `#` sequence rather than renumbering the
   rows past it, because a positional handle that silently renumbers is worse than none.

**Why:** two derived integers on one row disagreeing about which row it is was the hazard the
owner named directly — "fire layer 2" becomes a coin flip. The behaviour is correct today and
nothing holds it there.

**⚠ WRITE THIS FROM `DEBT.md:2621`, NOT FROM `DEBT.md:1606` — the two sources state OPPOSITE
models and one is superseded.** `DEBT.md:1606` says `#` and the default alias "are ONE number by
construction" and "cannot disagree". **That reading is SUPERSEDED.** `DEBT.md:2621` is the owner's
final resolution — it opens "after two earlier readings were superseded" — and it establishes that
they are two different questions answered separately, and that they CAN diverge.

**This matters more than the usual stale-entry note.** The live debt in both sources is the same
missing test. An item written from `:1606` would commission a test asserting "they cannot
disagree" — the superseded invariant — and a green assertion pinning the wrong model into the
suite is worse than no test at all, because it would then have to be argued down rather than
merely written.

**Acceptance:**

- A test asserts that `#` and the default alias DIVERGE on a non-contiguous ticked set (untick 97;
  the third visible row is `#3` and `Layer 4`).
- A test asserts the alias does not renumber when rows are ticked or unticked.
- A test asserts hiding a row leaves a gap in `#` rather than renumbering the rows past it.

**Notes:** related to [[R-033]] (the Layers table this lives in). Source: `DEBT.md:2621` (current
model, authoritative) and `DEBT.md:1606` (superseded reading — do NOT specify from it).

## [x] R-042 — mute-before-ADD, so LOAD can run during rehearse without a brief audible leak ⟨priority: medium — reaches air⟩ — DONE 2026-08-14, `openspec/changes/live-source-multibox/` (task 6.5b)

**What:** rehearse currently REFUSES LOAD on a rehearsing row (fail closed), because LOAD on a
cleared row is the one path that can put an UNMUTED producer under a row the UI shows as
rehearsing. The better feature is to **mute as part of the load** instead of refusing it.

**THE ORDERING CONSTRAINT, and it is the whole difficulty:** on 2.5.0 the volume must land
**BEFORE** the `CG ADD`, **not after**. A bare `CG ADD` puts the template's audio on air, so an
ADD-then-mute sequence is briefly audible on air — the exact leak the mute exists to prevent, just
shorter. An implementation that gets the order wrong looks correct in every test that does not
listen.

**Why it was deferred, recorded so the cost is not re-discovered:** it puts a new
ordering-sensitive path into the mute logic, which is the one path in this feature whose failure
mode — a graphic that reaches air with sound nobody expected, or silent when it should not be —
nobody notices until someone asks why there is no sound.

**Acceptance:**

- LOAD is permitted on a rehearsing row, and the producer it creates is muted before it can be
  heard.
- The `MIXER … VOLUME` lands before the `CG ADD` on the wire, asserted on the AMCP trace and not
  only by the absence of an error.
- A mute that fails does not proceed to the ADD.

**THE OPENSPEC CHANGE EXISTS — `openspec/changes/live-source-multibox/`, task 6.5b (2026-08-08).**
The owner folded this item, [[R-029]] and [[B-121]] into one wave, under one rule (design.md §7):
every bridge-created producer is created muted, audio raised only by explicit recorded intent. The
ordering constraint above is carried verbatim into 6.5b, including the requirement that the
`MIXER … VOLUME` be asserted **on the AMCP trace** rather than by the absence of an error. Nothing
about this item's substance changed — only its home.

**DONE 2026-08-14, and one premise of this item was already STALE when it landed.** All three
acceptance bullets hold — the `MIXER … VOLUME` precedes the `CG ADD` on the trace at every one of
the four call sites, and a failed mute refuses the load with `add-mute-failed` rather than
proceeding. But the FIRST bullet was already satisfied by a different route: **LOAD stopped
refusing a rehearsing row when it became LIST-ONLY** (`loadFixed` emits no AMCP at all), and the
guard this item describes was removed then — _"a path that cannot exist beats a guard that has to
be remembered"_. What the mute actually closes is the caller that survived: the DYNAMIC `load()`,
which still emits and never had a guard, plus `setPosition`’s re-ADD and [[B-121]]’s reconnect
re-ADD. Recorded here because the per-site tables in this item, in [[B-121]] and in the design all
name `loadFixed` as the guarded site, and all three are now wrong about it.

**DESIGN-FIRST — implementation needs an OpenSpec change before code.** The command ORDER is a
contract between the bridge and the template runtime, and it is version-dependent (2.5.0), so it
belongs in a spec rather than in a comment.

**Notes — the same seam seen from three angles, and all three should be read together:**
[[R-029]] (cueing puts a graphic's audio on air before the operator takes it) is the underlying
behaviour; [[C-019]] (audio in templates, BLOCKED BY [[C-018]]) is the CasparCG-side question; this
item is the load path. Fixing one without reading the others is how the ordering gets re-broken.
Source: `DEBT.md:1832`.

## [ ] R-043 — the APASAI mark is an auto-traced raster, not production brand artwork ⟨priority: medium⟩

**What:** `apps/runtime/brand/apasai-logo.svg` is an **auto-trace of a 114×96 raster** the owner
supplied, inlined into `index.html`. Curves are polygonised. It is faithful enough to sign a boot
screen and it is **not vector artwork** — it will show its origin at large sizes or in print.

**Why:** this is the first frame of the product and the company's own mark. Shipping a traced
approximation to a customer is a brand defect, not a rendering one, and it is invisible until the
moment it is enlarged.

**Acceptance:**

- The mark is the original vector (AI / EPS / SVG), not a trace.
- `#00AEEF` is unchanged — **it is the company's exact blue and is not ours to alter**, not for
  contrast, not for consistency, not for a theme. Only the bars and the swoosh are relit for the
  dark ground.
- The three class hooks (`.apasai-bars` / `.apasai-swoosh` / `.apasai-arc`) still exist — they are
  the contract.
- `tests/splashCss.test.ts` still passes: it asserts the inlined path data equals the file's, so
  the swap must update both.

**Why this is NOT part of [[R-035]].** R-035 is `[~]` and its acceptance is entirely about splash
BEHAVIOUR — first paint, the phase readout, the monotone percentage, the 8000/3000 ms floors.
Nothing in it specifies the mark's provenance. Replacing traced artwork with a real vector is an
asset deliverable that will outlive R-035's archive, which is why it carries its own number.

**Notes:** the swap is one file plus the inlined copy in `index.html`. **Do before any
customer-facing release.** Source: `DEBT.md:1891`.

## [ ] R-044 — the migrated dialogs have no test that they still OPEN, and `Cancel` byte-identity is asserted for only one of them ⟨priority: medium⟩

**What:** two missing assertions in the E2E suite owed by `dev-modal-primitive`, which migrated
five dialogs onto a shared `Modal`:

1. **Nothing asserts the migrated dialogs still OPEN from their real entry points.** The specs
   drive `ServerSettingsPanel` and `AuditPanel` directly. Their launchers — the status bar, the
   audit button — are unchanged and typecheck clean, but nothing pins that they still work.
2. **`Cancel` leaving state byte-identical is asserted only for the config dialog** (where the
   refusal keeps the dialog open with all 30 rows intact). The task asked for it on "at least the
   destructive ones"; the confirm dialogs' cancel path is unchanged code and was never separately
   re-asserted.

**Why:** a dialog that cannot be opened is indistinguishable from a dialog that does not exist,
and "typechecks clean" is not evidence that a launcher still fires. The `Cancel` property matters
on the destructive dialogs precisely because that is where a silent state mutation costs something.

**Acceptance:**

- Each migrated dialog is opened from its real entry point in an E2E spec, not driven directly.
- `Cancel` is asserted to leave state byte-identical on the destructive dialogs, not only the
  config dialog.

**Notes:** a Linux `gate:e2e` is owed for this work regardless of these two specs — five dialogs
changed layout, and a Windows run is not authoritative for that. Source: `DEBT.md:2088` and
`DEBT.md:2091`.

## [ ] R-045 — `AWAITING_ROW_REASON` sits with the verbs instead of in the shared `reachWording` module ⟨priority: low⟩

**What:** `AWAITING_ROW_REASON` lives in `layerRowActions` alongside the verbs, like
`MISSING_TEMPLATE_REASON`, rather than in the shared `reachWording` module where the other
operator-facing refusal wordings live.

**Why:** the drift risk is real — two surfaces saying the same refusal in two words is how an
operator comes to believe they are two different conditions. **But no second consumer exists
yet**, which is why this is `low` and not `medium`: today there is nothing to drift from.

**Acceptance:**

- If and when a second surface needs to say the `awaiting` reason, the wording moves to
  `reachWording` at that moment and both surfaces read it from there.

**Notes:** deliberately filed as a _watch_ rather than as work to schedule. Moving it now would be
speculative; moving it at the moment a second consumer appears is the rule. Source: `DEBT.md:2107`.

## [ ] R-046 — `NEXT` is offered on every sequence, including ones with no next step ⟨priority: medium⟩

**What:** the `NEXT` verb is presented on rows whose template has no multi-step capability, so the
operator is offered an action that cannot do anything.

**THE RECONCILIATION IS ALREADY MADE — write it into the acceptance or an implementer will delete
the control as dead UI.** Two shipped decisions appear to conflict: R-021 stage-2b says do not ship
a control for a capability that does not exist, while the layer-UI clause 8 says keep it and
**disable** it. **The resolution is: KEEP `NEXT`, DISABLE it, and explain why in the tooltip.**
Removing the control entirely is the reading this item exists to prevent — a verb that vanishes on
some rows and appears on others is harder to learn than one that is consistently present and
sometimes unavailable.

**THE MIGRATION DECISION IS ALSO ALREADY MADE, and it is the owner's:** the default is
**"has it"**. That preserves today's behaviour for every template already delivered. Defaulting to
"does not have it" would **silently strip a capability from templates already in the field**,
which is a behaviour change nobody asked for arriving through a schema default.

**Why:** an enabled control that does nothing teaches the operator that the console lies. A
disabled control with a reason teaches them what the template can do.

**Acceptance:**

- A row whose template declares the capability offers `NEXT` enabled, as today.
- A row whose template does not declare it shows `NEXT` **present and disabled**, with a tooltip
  saying why — never absent.
- A template that predates the field defaults to **"has it"**, so no already-delivered template
  changes behaviour.

**DESIGN-FIRST — implementation needs an OpenSpec change before code.** It adds a capability flag
to the template schema and therefore crosses Designer → `.vcg` → Runtime: a contract between three
packages plus a migration default. Filed now regardless, so the debt and both decisions above are
recorded before the design exists.

**Notes:** related to [[D-031]] (multi-step templates and a real `next()`), which is the other
direction — D-031 ADDS the capability, this item governs the control where the capability is
ABSENT. They are not the same work and neither blocks the other. Source: owner report via the
`DEBT.md` sweep (no `DEBT.md` line — reported directly).

## [ ] R-047 — the splash screen shipped, but `runtime-splash-screen`'s spec-delta was never written, so the specs describe a readout the product does not have ⟨priority: medium⟩

**What:** `openspec/changes/runtime-splash-screen/` still specifies the readout model that was
designed, not the one that shipped. The change landed and the splash is on screen; its OpenSpec
artifacts were never reconciled to it.

**Why:** the spec is the memory and the prompt is ephemeral. A change dir that describes a
different product than the one running is worse than an absent one — it reads as authoritative.
The next session to touch the splash will implement against the step counter and reintroduce
exactly what was deliberately replaced. This is also what blocks the change from being archived:
folding a spec into `openspec/specs/` that contradicts the code would publish the contradiction
into the living specs.

**The divergence, measured 2026-08-03 (the code wins, and the code is the percentage):**

| surface                                                  | says                                                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/runtime-splash-screen/design.md:50`    | §5 is titled **"Three labels, a step counter — and no terminal word"**                                                                                          |
| `openspec/changes/runtime-splash-screen/design.md:54-55` | argues **against** a percentage: _"A percentage claims measured progress, and nothing here measures anything… A step counter says exactly as much as is true."_ |
| `apps/runtime/index.html:1017`                           | `var pct = Math.floor(progress * 100);`                                                                                                                         |
| `apps/runtime/index.html:1020`                           | `if (pctEl) pctEl.textContent = pct + '%';` — a **percentage**                                                                                                  |
| `apps/runtime/index.html:1016`                           | `progress = Math.max(progress, …)` — and it is **monotone**                                                                                                     |

The "no terminal word" half of §5 did survive: `index.html:1011-1012` records _"FLOOR rather than
round: a screen reading 100 while the door is still shut is the same false claim as a terminal
READY label."_ So the design's **reasoning** was carried forward into a different mechanism, while
the spec text still describes the mechanism that was dropped.

**SIZE — measured by the closing session and recorded rather than authored, which is why this is
its own item.** The reconciliation spans **four files**: `design.md` (135 lines), `proposal.md`
(68), `tasks.md` (109) and `specs/runtime-ui/spec.md` (174). The shipped model is barely
represented in any of them, so this is a re-authoring of the readout model across a design doc, a
proposal, a task list **and a capability spec** — not a small delta. Session 6 of the `DEBT.md`
sweep judged it too large to fold into a cleanup commit and declined to author it there, on the
grounds that filing a new number in the last commit of a cleanup is the anti-pattern that record
exists to name.

**Acceptance:**

- `design.md` §5 describes the **monotone floored percentage** that shipped, and the rejected step
  counter is recorded as a rejected alternative rather than as the design.
- `specs/runtime-ui/spec.md`'s scenarios assert the readout the product produces, including
  monotonicity and the absence of a terminal `READY`.
- `proposal.md` and `tasks.md` no longer describe the step counter or the placeholder brand slot.
- `pnpm openspec validate runtime-splash-screen --strict` passes, and the change is archivable —
  the fold into `openspec/specs/` would publish the shipped behaviour, not the superseded design.

**DESIGN-FIRST — this is a specification task, not a code task.** No product code changes. The
splash is shipped and is not in question here; what is owed is the written record of it. If the
reconciliation surfaces a behaviour the owner would rather change, that becomes its own item — it
does not get fixed inside this one.

**Notes:** related to [[R-035]] (the splash itself, `[~]`). This item does **not** block R-035's
delivery, which is done; it blocks its **archive**. The sweep also recorded that
`pnpm openspec validate --all --strict` was never run for the splash work (`DEBT.md:1871`) and
that a Designer-splash change dir does not exist at all (`DEBT.md:1975`) — that second one is
separate, larger, and is not folded in here. Source: `DEBT-SWEEP.md:665-672`, recorded as owed by
the sweep's closing session and left unfiled.

## [~] R-048 — swap a plate's input WHILE the template is ON AIR ⟨priority: high⟩ — ⭐ CLIENT REQUIREMENT — BUILT 2026-08-14 in [[C-015]] phase 6 (tasks 6.9–6.9f); `[~]` for ONE reason only, the unmeasured 2.3.2 substitution (6.9a), see below

🔴 **This is a CLIENT REQUIREMENT, not a preference.** Recorded as such 2026-08-10 (owner) so a
later prioritisation pass cannot read it as a nice-to-have and defer it.

**BUILT 2026-08-14 (session AG).** A PER-ITEM override — the template's assignment and the
installation's catalog are both untouched, and it never writes back. A REPLACE, never a
clear-then-add: on failure the previous producer stays, the override is not recorded, and the row is
told. The fit re-derives in the same action, the plate's audio intent survives the swap, the override
survives a bridge restart through retention, and it is reachable in two actions from the row.

⭐ **AND IT IS NOT ONLY AN EMERGENCY AFFORDANCE.** The owner's 2026-08-14 answer to the studio-plate
question (`live-source-multibox` design.md §12.6) is that the studio's address is chosen AT THE
MOMENT OF USE — so this swap is also the ONLY mechanism by which a moment-chosen source is
addressable at all on this installation. Reading it as "nice to have in a failure" under-weights it.

🔴 **WHY IT STAYS `[~]`, and it is one thing:** whether `PLAY` on an OCCUPIED layer SUBSTITUTES the
producer rather than requiring a prior clear is **unmeasured on the plant's 2.3.2**. The AMCP mock
models it as a replace, so the offline tests prove the code is self-consistent and prove nothing
about the server. Task 6.9a carries the probe; ride it with design.md §3b's `DEFER`/`COMMIT` question
and 6.3a's `CLIP` intersection probe, which are AMCP probes on the same build.

**What:** a three-plate template is on air, one input drops and its plate goes black. The operator
must be able to point **that ONE plate** at a different source, **fast**, **without taking the
graphic off air** and **without disturbing the other two plates**.

**Why THE CONFIGURATION is the WRONG lever — recorded so it is not proposed later.** The obvious
move is "point guest 2 at the spare camera" in one of the two places that configure it. Both are
wrong, and for the same two reasons. Editing the installation's SOURCE changes **every template**
that uses it; editing the template's ASSIGNMENT changes **every row carrying that template** — and
both **persist**, so an emergency substitution made at 19:58 is still in force next week.

⭐ **STATE THE LAYERING (C-015 design.md §2z / §2d), because it is what makes this item coherent:**
the template's ASSIGNMENT is the **DEFAULT** for every use of that template; this swap is the
**PER-RUN OVERRIDE** on top of it, the same shape as the existing position override — the configured
values are untouched and **only this run changes**; and the override **does NOT write back**, so an
emergency substitution can never silently become the permanent configuration.

**The mechanism, which the existing structures already support.** [[C-015]] phase 5's `#liveLayers`
ledger keys by **itemId** and holds one record per plate — `{ slot, sourceId, role, producer, fill }`
(`tools/caspar-bridge/src/live-layers.ts`). A swap **replaces `producer` on ONE record and re-issues
on that same slot**. The template's HTML is never touched, which is what makes it safe to do on air:
the graphic itself never reloads.

**Acceptance — five requirements, each with the reason it exists:**

- WHEN a plate is swapped THEN it is a **REPLACE, never a clear-then-add**: `PLAY` substitutes the
  producer in place on the occupied layer. A `CLEAR` followed by a `PLAY` that fails is exactly the
  [[B-126]] window, **arriving during an emergency** — a destructive step committed before the
  constructive one was known to succeed. WHEN the replace fails THEN the previous (black) producer
  stays and the row **says so honestly** rather than reporting a success it did not achieve.
  ⚠ **VERIFY on the plant's 2.3.2 that `PLAY` on an OCCUPIED layer substitutes rather than requiring
  a prior clear — do NOT assume it; record the measurement.** Run it in the same `amcp-poke` session
  as `live-source-multibox` design.md §3b's `DEFER`/`COMMIT` question.
- WHEN the substituted source carries a different format THEN **the fit recomputes automatically**,
  in the same action: crop-to-fill re-derives from the new source (design.md §3a's chain). The
  operator must not have a second step — under pressure, a second step is a step that does not
  happen.
- WHEN the operator had deliberately raised that plate's audio THEN **the swap re-applies it**.
  Every bridge-created producer is born muted (C-015 phase 6.5), and the intent belonged to the
  **PLATE**, not to the producer instance — a swap that silently mutes a guest is its own on-air
  fault.
- WHEN the operator applies the swap THEN the template's ASSIGNMENT and the installation's catalog
  are both **unchanged**, and the UI does not suggest otherwise — the override is this run's alone
- WHEN the bridge restarts THEN **the override survives**. Retention must carry it, or a momentary
  bridge blip silently reverts the plate to the **dead** source. This is the [[B-107]] / [[B-109]]
  class — retention dropping state it did not model — so it is stated as a requirement with a test,
  not left to be discovered.
- WHEN the operator needs it THEN it is **reachable in one or two actions from the row**. This is
  used under pressure, on air: it must not live in settings, behind a modal chain, or anywhere the
  operator must first find the item.

**Recorded as v2, deliberately NOT in scope:** a **pre-armed backup source** per plate. In a real
failure the operator often needs a source nobody predicted, and an **open list beats a pre-chosen
wrong one**. Revisit only if use shows otherwise.

**Also out of scope, and filed as its own thought rather than widening this item:** automatic
**DETECTION** of a dead input. The client asked for a fast SWAP; detection is a separate capability,
and [[C-023]]'s per-source confidence thumbnails already give the operator eyes on which plate died
and which source is healthy. C-023 is the diagnosis half; this item is the repair.

**Where it is implemented:** inside `openspec/changes/live-source-multibox/` **phase 6** (tasks
6.9–6.9f), cross-referenced both ways — the same pattern D-147 used to ride phase 1 rather than
opening a change of its own.

## [~] R-049 — a rehearse plate is COMPLETELY BLANK, so a live plate is indistinguishable from a broken render ⟨priority: high⟩ — depends on [[C-015]]'s assignment store

<!--
  PRIORITY RAISED medium → high, 2026-08-12. Not a re-estimate: the owner hit this
  in LIVE TESTING and reported that in CG Control's PVW you cannot tell a live
  plate exists at all. That is this item's own premise — "indistinguishable from a
  broken render" — confirmed in use rather than predicted, and a filed premise that
  has been met in operation is no longer a medium.
-->

**In progress:** `openspec/changes/rehearse-live-plate-placeholders/`. Linux `gate:e2e` DISCHARGED —
[run 31551511995](https://github.com/yasermostafaee/cg/actions/runs/31551511995) on commit
`455318b4`, `conclusion: success`, with the `E2E (Playwright)` job RUN (not skipped) and green.

**What:** in PVW, draw a **labelled placeholder** over each live plate's rect — procedural colour
bars carrying the **plate's name** and, when one is assigned, **the assigned SOURCE's name**. Drawn
by the **RUNTIME, OVER the rehearse frame**; the page beneath is untouched.

**Why:** an empty region is **indistinguishable from a broken render**. The operator looking at PVW
today cannot tell whether the template is fine and the live box is simply not a browser thing, or
whether the page failed to load — and cannot tell **which source sits behind which plate**. Both
questions are answerable, and the second one is answerable **only** here.

⭐ **It does what the PAGE never could: show the ASSIGNED SOURCE'S NAME.** The exported page knows
nothing about assignments — it carries a plate identifier and nothing else, by design
(`live-source-multibox` design.md §2z: the author names plates for the LAYOUT, the installation names
sources for what they ARE). **The Runtime knows the join.** That is half the confidence problem
answered with **no frame grabs and no extra channel**.

### ⚠ This does NOT reopen §12.2, and the compatibility sentence is the point

`live-source-multibox` design.md **§12.2 stands untouched**: rehearse renders the retained exported
page **VERBATIM**, and the page paints **nothing** where a Live Source is. **This item adds no second
render path and changes nothing about what is rendered** — the placeholders are an **overlay the
Runtime draws on top of the rehearse frame**, so the page's contract and §12.2's decision are both
exactly as they were. A later reader must not read these placeholders as a reversal of §12.2; they
are a thing drawn beside it.

Three consequences of that, each a reason this is cheap:

- **Nothing is needed from the export path.** No `.vcg` change, no exporter change, no new metadata.
- **No third render mode is built**, and §9's `mode: 'author' | 'output'` seam **stays unused and
  available** for a real `'rehearse'` mode if one is ever wanted.
- **The data is already there.** [[C-015]] phase 2 put each plate's rect, **in scene pixels**, on
  `TemplateInfo`'s `liveSources` block (`packages/shared-ipc/src/channels/templates.ts:153`), and the
  stage already knows its own scale.

### Acceptance

- **Procedural colour bars, NOT black.** Black is indistinguishable from a real dead feed; bars say
  "placeholder". ⚠ **Reuse the Designer's author-mode bars rather than authoring a second set** —
  **found and named:** `smpteBarsGradient()` / `SMPTE_BARS` at
  `packages/template-runtime/src/scene-builder.ts:1282-1302`, the 75 %-amplitude bars phase 1 already
  built for `'author'` mode. It is a **module-local function in `@cg/template-runtime`, not
  exported**, so reuse means **exporting it** (or lifting it beside the other shared helpers) —
  a one-line widening, and the alternative is a second copy of a seven-colour table that must then be
  kept in step. It also already carries the B-066 lesson in its own comment (explicit paired gradient
  stops, because double-position stops shipped in Chromium 72 and CasparCG's CEF is baseline 71);
  a hand-written second set would very likely lose that.
- **TWO VISUALLY DISTINCT STATES, not confusable at a glance** — because they demand **different
  operator actions**:
  - **ASSIGNED** — bars, plus **the plate's name** and **the assigned source's name**.
  - **UNASSIGNED** — a **desaturated** variant, plus an explicit **"no source assigned"**.

  WHEN an operator glances at PVW THEN the two states are distinguishable **without reading the
  label**, so "this plate is fine" and "this plate will refuse the take" are never mistaken for each
  other. (An unassigned plate refuses the take — [[C-015]]'s empty-mapping acceptance — so this is the
  operator's last chance to see it before air.)

- 🔴 **UNMISTAKABLY NOT A PREVIEW — a requirement, not a styling preference.** WHEN the placeholder is
  drawn THEN an operator must **never** be able to believe PVW is showing the real picture. A browser
  cannot display SDI or NDI (the wall §12.2 settled and [[C-023]] restates), so a placeholder that
  reads as a picture is worse than the blank region it replaces: it converts "I can't see it" into "I
  saw it and it was fine".
- **Geometry comes from the SAME transform the stage already uses** — the FIT scale on the iframe
  elements (`RehearsalStage.tsx:289`), not a second one derived beside it. **Deriving a second scale
  factor is how an overlay drifts off the page beneath it**, and the drift is invisible until the
  raster changes.
  ⚠ **Pin alignment with a test over at least one NON-16:9 raster.** On 16:9 the terms collapse and a
  wrong implementation gives the right answer — the same trap [[C-015]]'s task 6.2b names for the
  bridge's FILL contract test. Use a raster that pads on the other axis (e.g. `1440×1080` or
  `720×576`).

### ⭐ DECIDED 2026-08-12, owner — VISIBLE BEFORE PLAY, and it does NOT reopen [[D-087]]

Observed by the owner during implementation: the placeholders paint **as soon as PVW opens**, while
the template's own elements stay blank until **Play**. That is [[D-087]]'s **blank-until-play**
contract, which the rehearse frame inherits by rendering the exported page verbatim
(`body.cg-pending` hides the page's stage; `play()` clears it, settle re-adds it). The overlay sits
**outside** that page, so it was never subject to it. **Recorded here as a DECISION rather than
left as the side effect it started as:**

- **Visible before Play is CORRECT and is kept.** This item's own acceptance is the argument: an
  unassigned plate **REFUSES the take**, and PVW is "the operator's last chance to see it before
  air". A placeholder that appeared only after Play would be absent at exactly the moment it was
  filed to serve.
- **It does NOT reopen [[D-087]]**, for the same reason it does not reopen §12.2: **the page still
  paints nothing before Play.** `cg-pending` is a class on the PAGE's own `body`; the overlay is a
  Runtime layer composited over the frame and reaches into no document. The contract is untouched.
- **DURING play: it persists, entirely unchanged** — same box, same state, same words. **Verified,
  not assumed** (`apps/runtime/tests/e2e/pvw-live-plate-placeholder.spec.ts` drives a stand-in page
  carrying the real `cg-pending` contract and asserts the page blank → painting → blank while the
  marker never moves). Nothing about it changes appearance and nothing disappears, because the
  component takes **no lifecycle input at all**. That is the wanted behaviour rather than a gap: the
  hole is still a hole while the graphic runs, and the "never mistakable for a real incoming
  picture" requirement is **most** load-bearing exactly then — fading the marker at play would
  restore the original defect at the moment the frame most resembles air.

Pinned at both levels so it cannot drift silently: the E2E above for the real lifecycle, and
`apps/runtime/tests/livePlateOverlay.dom.test.ts` for the overlay's invariance under the transport.

### Cross-references, so neither is read as a duplicate of the other

- **[[C-023]]** (a confidence thumbnail per live source) answers **"is the picture good"** — it needs
  frame grabs, a consumer-less channel and [[C-016]], and it is filed with those costs. **This item
  answers "WHICH SOURCE IS WHERE"** — it needs none of them. **Related, not duplicates**, and neither
  makes the other unnecessary: a thumbnail that does not say which plate it belongs to and a plate
  label that does not say whether the feed arrived are each half an answer.
- **`live-source-multibox` design.md §12.2** — see the compatibility paragraph above. The
  placeholders are drawn by the Runtime OVER the frame; the page still paints nothing, and §12.2 is
  not reopened.

**Depends on the assignment store** ([[C-015]] phase 4, shipped), because the source NAME is what
makes the placeholder worth drawing. Without it the item degrades to bars plus a plate name — still
better than blank, but it is the name that answers the operator's actual question.

## [ ] R-050 — swap the placeholder APASAI mark and brand colours for the real ones ⟨priority: low⟩

<!-- rescoped out of R-035 (runtime-splash-screen task 8.2), 2026-08-11 -->

**What:** Replace the placeholder brand on the Runtime's startup splash with the real APASAI
mark and the real brand colours.

**Why:** the splash is the product's first frame — the thing an operator sees before anything
else — and it currently carries a stand-in. `R-035` shipped the splash deliberately with a
placeholder because the real mark did not exist yet; this item is the swap, filed so the
placeholder cannot quietly become permanent by nobody remembering it was one.

**Acceptance:**

- WHEN the real mark is dropped in THEN the ONLY file that changes is
  `apps/runtime/index.html`, at the single `<svg class="cg-splash__mark">` BRAND SLOT — the
  swap point R-035 built for exactly this
- WHEN the mark is replaced THEN the `cg-splash__mark` class, the 56×56 `viewBox` and
  `aria-hidden` are preserved, so layout and accessibility are unchanged by the swap
- WHEN brand colours are applied THEN every colour is a `--r-*` token value, never a literal —
  `apps/runtime/tests/splashCss.test.ts` already enforces this and must stay green

**Notes:** the swap point being ONE documented element is R-035's deliberate design (see
`openspec/changes/archive/2026-08-11-runtime-splash-screen/DEBT.md` §2). Do not spread brand
values across the stylesheet on the way in — that is what makes the NEXT rebrand expensive.
Blocked on the owner supplying the final mark and palette; no code question is open.

## [ ] R-051 — an in-application about / version surface that reads the ONE build stamp ⟨priority: low⟩

<!-- rescoped out of R-035 (runtime-splash-screen task 8.3), 2026-08-11 -->

**What:** Give the Runtime a place inside the app — an About dialog or a status-bar readout —
where the operator can read which build they are running, without restarting to catch the
splash.

**Why:** the build stamp exists and nothing in the app reads it. `vite.config.ts` computes it
ONCE and exposes it both as the HTML the splash paints and as the `__CG_BUILD__` compile-time
global; today only the splash uses it, so the only way to answer "which build is this?" is to
reload and read a screen that dismisses itself. On a support call that is the wrong
affordance.

**Acceptance:**

- WHEN the about/version surface renders THEN it reads `__CG_BUILD__` and does NOT re-derive a
  version, a SHA or a date — 🔴 two derivations are two answers, and the whole point of the
  stamp is that what the operator reads on the first frame and what they read in the app are
  the SAME STRING
- WHEN the project starts tagging releases THEN `v${version}` is prefixed at the ONE render
  site named in the comment beside `#cg-splash-version` in `apps/runtime/index.html`, not at a
  second one
- WHEN no release tag exists THEN the surface shows `sha · builtAt` only, exactly as the splash
  does — `0.0.0` is a placeholder, not a release identity, and showing it would be a lie about
  what is deployed

**Notes:** carries the `version` decision R-035 deferred (see
`openspec/changes/archive/2026-08-11-runtime-splash-screen/DEBT.md` §3). The Designer has the
same gap; if that surface is built too, both read their own app's `__CG_BUILD__` — one
mechanism, two call sites, never a shared re-derivation.

## [~] R-052 — one message region for every modal, enforced rather than remembered ⟨priority: medium⟩ — implemented (`e1e2d03`): `openspec/changes/runtime-modal-message-region/`; all 19 tasks ticked including the owed Linux `gate:e2e`; ARCHIVE-READY

<!-- Filed 2026-08-11 by the [~] audit. The work SHIPPED in `e1e2d03` and was fully
     specified in its change dir, but no PRD item was ever written for it — the only
     reference anywhere in docs/prd was a cross-link from the Designer counterpart
     D-148. Filed retrospectively so every open change dir resolves to exactly one
     PRD item, and so the capability is discoverable from the PRD rather than only
     from a change dir that is about to be archived. R-052 verified free against
     `dev`, `origin/main` and every file in the repo before claiming it. -->

**What:** give the Runtime's `Modal` primitive ONE message region that every dialog uses, and
make it impossible to go around:

- The region takes **DATA, not a node** — `message?: ModalMessage | ModalMessage[]` where
  `ModalMessage` is `{ role, text, detail? }` with **string** fields. There is no seam to pass
  a `style` through, so a call site cannot spell its own treatment even by accident.
- **Two roles, and the ROLE decides the treatment** — `refusal` (why it did not happen) and
  `notice` (what happened when it worked) — the same rule the action-button roles already
  follow. The treatment lives in exactly one place, `renderer/ui/Notice.tsx`.
- **A lint rule closes the placement hole** the type system cannot see: `role="alert"` inside a
  `<Modal>` subtree is banned outside `ui/`.

**Why:** the `Live sources` modal put `colors.error` (`#991B1B`) as a FOREGROUND on the modal
surface (`#111827`) — **2.13:1**, below even the 3:1 large-text floor. But the contrast number
is the symptom, not the defect. **The pattern was already solved and the new modal went around
it**: the dialog wave that introduced `Modal` gave it a message region pinned OUTSIDE the
scrolling body and immediately above the action row, precisely because _a refusal appended to
scrollable content is a refusal the operator never sees_ — he presses Apply with the list
scrolled to the top, nothing happens, and the reason is below the fold. The audit found the
pattern **half-adopted**, which is the worst state a shared rule can be in: four dialogs, four
spellings, and `Text file delimiters` rendering `<p role="alert">` as the last child of its own
scrolling body — the exact defect the region exists to prevent, in a dialog otherwise ON the
primitive.

**Acceptance:**

- WHEN any dialog that can speak renders THEN its message goes through the shared region, and a
  DOM-level census test asserts the MECHANISM rather than a colour
- WHEN a message is supplied THEN its treatment is decided by its `role`, and no call site can
  supply a style — the props carry strings only
- WHEN a developer places `role="alert"` inside a `<Modal>` subtree outside `ui/` THEN `eslint`
  FAILS, so the placement rule is enforced rather than remembered
- WHEN a validator refuses inside a genuinely scrolling dialog body THEN the message is fully
  in the viewport (`toBeInViewport({ ratio: 1 })`), asserted by an E2E that was verified RED
  against the reintroduced in-body placement
- WHEN a message carries Persian text THEN it renders `dir="auto"`

**Notes — no new colour was introduced, and that is deliberate.** `refusal` **IS**
`Candidate layers`' existing amber box, MOVED rather than redesigned; the three red spellings
were **deleted** rather than replaced, because in `theme.ts` red means error or destructive
intent and a refusal is neither — it is the ATTENTION case, which is amber.

**Partial discharge only** of the `Modal` contract debt (`DEBT.md:2079`): this covers the
MESSAGE region and its roles. The three action-button roles and the chrome migration of five
dialogs remain unspecified and still owe their own artifacts.

**Cross-reference — [[D-148]] is the Designer counterpart, and it is NOT a copy job.** The
Designer has its own `features/shell/Modal.tsx` with no message region at all, and its one
dialog message sits in the scrolling body — the same placement defect, but latent (its colour
measures 7.38:1, not 2.13:1), which is why D-148 is `low` and this was not. D-148 records
explicitly that its roles must be DERIVED from the Designer's own existing treatments, not
copied from this item's two: the Runtime's `refusal`/`notice` were an EXTRACTION of treatments
that already existed in that app.
