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

## [~] R-018 — feed field values from a text file (whole-text default, OPTIONAL split; manual reload) ⟨priority: medium⟩ — manual-reload half implemented: `openspec/changes/runtime-field-from-file/`; local gate green; no CasparCG hardware pass owed (renderer-only over the EXISTING field-update path — same `stack.update` wire and value shapes as hand edits, no new AMCP verbs, `@cg/template-runtime` untouched); OWES one Linux `pnpm gate:e2e` (FULL suite — a Linux run is owed for any UI/layout/rendering change, not only spec edits: the new FromFileControl mounts inside the Inspector and changes its content height, and nine existing specs interact with the Inspector plus the content-height-sensitive `panel-scroll.spec.ts`; run once WSL lands, alongside the #369/#370 Linux-gate debt); the Windows `gate:e2e` 22/22 (0 cached) pass is recorded as non-authoritative EVIDENCE, not discharge (~19px render-geometry delta); the WATCH half moved out to [[R-026]] (recon-first); remaining to reach [x] + archive: the Linux `gate:e2e` run + owner runs it

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

## [~] R-020 — Persian-keyboard digits accepted in numeric inputs, normalized to canonical digits ⟨priority: medium⟩ — `openspec/changes/runtime-persian-digit-input/`; local gate green; no on-air behavior change (wire values unchanged) so no CasparCG hardware pass is owed; OWES one Linux `gate:e2e` (the edited spinbutton→textbox role assertion in `stage-inspector-edits.spec.ts` has not executed anywhere — WSL not installed; run once WSL lands, per the #369/#370 Linux-gate debt); remaining to reach [x] + archive: the Linux run + owner runs it on the owner machine

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

## [~] R-021 — fixed operator layers: aliased pre-defined slots with on-row import+load and layer-level control ⟨priority: high⟩ — STAGES 1 + 2a landed (`openspec/changes/runtime-fixed-layers/`, see its STAGE MAP). Stage 1: install config + the LayerManager fixed mechanism + the R-009 orphan-sweep exclusion. Stage 2a (wire contract): the five `fixedLayers.*` channels (config read/update with the validator's own reason codes, single-sourced; per-slot state as FACTS — observed occupancy per the D3 honesty rules + a stage-3 `binding` field), bridge routes + publish-on-change from the existing sweep tick, LIVE bank changes via `LayerManager.applyFixed`, persistence on applied change, the typed `RuntimeBridge.fixedLayers` seam + `WebSocketRuntime` impl + `MockRuntime` parity (offline occupancy honestly UNKNOWN). Still no renderer/UI, still no on-air behaviour change (no bank ⇒ config null / state [] / zero publishes, test-pinned), R-015's clear refusal untouched. No CasparCG hardware pass and no Linux `gate:e2e` owed for the 2a slice — every touched path checked against `UI_RENDER_PATTERNS` in `tools/gate-hook/src/gate-decision.mjs`, none matches (packages/shared-ipc, packages/caspar-client, tools/caspar-bridge, apps/runtime src/shared + src/platform + non-e2e tests, docs, openspec). **Stage 2b (renderer) landed:** the fixed-bank panel above the stack (idle-quiet — no bank, no panel, byte-identical column), permanent rows with alias + layer number and honest occupancy (explicit UNKNOWN never shown as empty, B-094; a dead SPA↔bridge link masks EVERY row to unknown over the frozen snapshot, the B-087 class), verb derivation as the ONE pure `fixedRowActions` declaration point — stage 2b's ONLY verb is a confirm-gated layer CLEAR on an OBSERVED `html` producer (the b1 blind-Clear-under-silence and the non-html carve-out are DELIBERATELY stage 4/task 4.3: today's bridge refuses both and an enabled control must never invite a click that only rejects), the declaration-time confirm gate (`withConfirm` + the `cancelled` async path — cancel is no success flash and no toast) shared by buttons and context menu, the bank config modal (count/aliases live; channel/start read-only; refusals surface the validator's mapped reason + its message), the b′ same-bank invariant documented (operator guide + `fixed-layers-store.ts` header; the divergence HINT is deferred to stage 3 — with `binding` null, every html producer is indistinguishably foreign and the hint would carry no information), and the `CG_E2E_FIXED_BANK` mock seed + unit/DOM/E2E coverage (the "import+load lands on the exact slot" E2E moved to stage 3 beside 5.3). **Stage 2b OWES, recorded as OWED not done:** (1) a Linux `gate:e2e` run — this slice touches `apps/runtime/src/renderer/**` + `tests/e2e/**`, which match `UI_RENDER_PATTERNS`; the Windows `gate:e2e` result is a Windows signal only, NON-authoritative for render geometry (~19px delta class); (2) a real-hardware pass on CasparCG 2.3.2 for the one on-air path this stage adds — with a bank declared and a foreign html graphic on a bank layer, the fixed row's Clear takes it off air, the row settles to empty on the next sweep, and nothing else on the channel is disturbed. Remaining: stages 3, 4 per the STAGE MAP

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

## [ ] R-028 — one layer surface: declared rows replace the dynamic stack (supersedes R-021's parallel-bank framing) ⟨priority: high⟩

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

## [ ] R-029 — cueing a graphic puts its audio on air before the operator takes it ⟨priority: high⟩

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
placement is output-only **by construction**. The gap is documented in that file's own comment:
`OUTPUT_FRAME` is hardcoded `{ width: 1920, height: 1080 }` at `position.ts:25`, and
`applyOutputPosition` force-sizes `html`/`body` to it at `position.ts:110-111`. **The seam is
already there** — `outputTranslate` takes a `frame` parameter with a default
(`position.ts:80`), so the plumbing is a matter of supplying it rather than inventing it.

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

## [ ] R-034 — the delimiter list is CONFIGURABLE in settings, not hard-coded in the control ⟨priority: medium⟩

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

## [~] R-031 — a startup splash screen: the product's first frame ⟨priority: medium⟩

<!-- change: openspec/changes/runtime-splash-screen/ -->

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
  readout names that step and the rail advances by COMPLETED PHASE, with a step counter (`2 / 3`)
  and never a percentage
- WHEN boot completes THEN the phase label FADES OUT and the readout's left side is empty — there
  is no terminal `READY` label anywhere in the markup, CSS or script
- WHEN this is a cold start (no `CG_RUNTIME_SESSION` marker in `sessionStorage`) THEN the splash
  is held for at least 5000 ms; WHEN it is a warm reload THEN the floor is 600 ms
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

**Notes:** Company **APASAI**, product **CG CONTROL**; all splash copy is English. The logo and
brand colours are NOT final — the placeholder mark is a single documented SVG slot in
`index.html`. **No red anywhere on the splash**: red is the sacred air-state colour and decorative
red is already forbidden across this UI ([[R-007]], `theme.ts`), so the accent is the existing
sky — checked by a test, not merely asserted. This is a display gate
layered ON TOP of the connection model — `createRuntimeBridge`, `WebSocketRuntime` and
`MockRuntime` are unchanged, and the live / offline-mock / disconnected tri-state, the
refuse-while-disconnected contract and the NOT CONNECTED / TEST MODE banners all stay as they are.
The 20 s ceiling is the safety property: a stuck splash on an on-air tool means the operator has no
door into the application at all. The test bypass is an init-script global and deliberately NOT a
URL query parameter — a query parameter is a door an operator can reach by bookmark or typo.
