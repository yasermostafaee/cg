# Design — one layer surface (R-028): declared rows, three writers, and what that costs

Everything here is decided against the code as it exists on `main` at `befbe41` (cited inline).
Where a question could only be answered by hardware or by the owner, it is marked RECON or OPEN
rather than reasoned to a conclusion.

## a) Where the live state ACTUALLY lives today — verify this before sizing anything

The owner asked whether this redesign merely re-presents what the bridge already has, or has to
MOVE state across a boundary. **The answer is different for the two halves, and that split is the
single most important fact in this document.**

**The STACK is already bridge-owned and bridge-published — re-presenting it is free.** The
Reconciler in `tools/caspar-bridge` owns item state; every mutation publishes a full snapshot on
`stack.state-changed`, and `stack.snapshot` serves a pull (`caspar-runtime.ts` `#published()`).
The browser keeps a retained copy ONLY as restore intent for B-092, and `WebSocketRuntime.snapshot()`
returns `#retainedProjection()` **only when the link is not live** — a display-time fallback,
explicitly "DISPLAY ONLY: this sends nothing, commands nothing". So two browsers on one bridge
already see the same stack. Nothing moves.

**The LIBRARY is browser-local, and that is the boundary this redesign runs into.** B-085 made
`LibraryStore` (persisted per browser via `initRuntimeWorkspace()`) the SOURCE OF TRUTH:
`WebSocketRuntime.templates.*` are served from it "with no bridge round-trip, so they work with
the bridge down", and `#resync()` re-delivers `#library.entries()` to the bridge on every
reconnect, local-wins. The bridge's own `TemplateRegistry` is **in-memory, not persisted, empty on
restart** (`template-registry.ts` header) and is a serve/delivery target, not a catalogue.

Consequence, stated plainly: **operator B does not see the templates operator A imported.** Under
the current design that was tolerable — the library was a per-operator convenience. Under "one
bridge, many browsers, every row loaded by whoever is at a desk", it is a defect. This is the same
fact as the local-file consequence in §h, and it is the one place this redesign must move state
rather than re-present it.

## b) The operating model

1. **No dynamic stack.** Every on-air item sits on a declared row. `LayerManager.allocate()` stops
   being the path that puts operator graphics on air (§j says what happens to it).
2. **The template is not stored in config.** The operator picks a `.vcg` each time. But **while
   the bridge is up and the item is on the layer, the BRIDGE knows what is there and tells every
   browser the same thing.** "Does not remember" applies ONLY across a bridge restart. The source
   of truth is the bridge, never a browser. This is already true of the stack (§a) and is what
   makes "an item another browser loaded is not foreign" work.
3. **Config declares a FIXED ceiling of candidate layers**, which never grows or shrinks at
   runtime. A per-layer tick controls only whether that row is DISPLAYED. Rejected: a mutable
   `count`, because it turns every visibility change into a live config change subject to the
   grow/shrink/renumber rules R-021 (e1) had to invent.
4. **Every candidate layer is fenced from automatic allocation regardless of its tick.**
   Visibility and fencing are separate concerns; unticking must NEVER return a layer to an
   allocatable pool. Mechanically this is R-021's born-allocated fencing applied to the whole
   ceiling, not to the visible subset.
5. **The real CasparCG layer number is always visible on the row.** An operator may need it to
   clear that layer by hand over AMCP. A display index may sit BESIDE it, never instead of it.
6. **A ticked row that is occupied cannot be unticked** — config must show it is not empty. To
   untick, remove its template first; that affordance may live in the config modal, and removal
   implies clear (today's behaviour). Consistent with R-021's e1.

## c) Layer ranges — and what VERIFICATION found

Plan: playout **60–69**, Runtime rows **70–99** (30 rows). The owner is declaring 60–69 to the
playout team.

**70–89 is free today.** The default `LayerPolicy` (`layer-manager.ts:33-40`) ends its dynamic
ranges at `custom` 60–69, and nothing occupies 70–89.

**90–99 — VERIFIED, with one entanglement the plan must absorb.** `logo-bug` is NOT purely an
allocation range:

- It IS a `LayerPolicy` range — `'logo-bug': [90, 99]` (`layer-manager.ts:34`).
- It is ALSO a first-class **`templateType`** in the scene schema
  (`packages/shared-schema/src/scene.ts:123`, mirrored in
  `packages/shared-ipc/src/channels/projects.ts:36`). A Designer scene can declare
  `templateType: 'logo-bug'` and that value travels in every `.vcg`.

So freeing 90–99 frees the RANGE but does not retire the TYPE. Under this model that is
harmless — with no dynamic allocation, a `templateType` no longer selects a layer range at all;
it becomes descriptive metadata. But it must be stated, because a future reader deleting
`'logo-bug': [90, 99]` from the policy could reasonably think the type went with it.

**A second finding, in the plan's favour:** the policy comment says
`logo-bug : 90–99 (pinned, rarely dynamic)`, but `pinned` **is never populated by any caller.**
`LayerManagerOptions.pinned` is declared and consumed inside `layer-manager.ts` only; a search of
every `src/` tree finds no site that passes a `pinned:` option. The "pinned logo-bug" model was
designed and never wired. So 90–99 carries no live reservation, and taking it costs nothing at
runtime.

## d) The verb set — our names, Cinegy's layout

**Verbs:** LOAD (`CG ADD`) · PLAY · NEXT · UPDATE · STOP · CLEAR · REMOVE. They map onto the AMCP
commands themselves.

**The label trap, recorded because it is a 2 a.m. hazard.** Cinegy's vocabulary COLLIDES with ours
with inverted meanings:

| action                      | ours (KEEP)      | Cinegy |
| --------------------------- | ---------------- | ------ |
| graceful exit, outro plays  | **STOP** (C-012) | EXIT   |
| hard kill, no outro         | **CLEAR**        | STOP   |
| take the template off a row | **REMOVE**       | CLEAR  |

Adopting Cinegy's labels would INVERT the meaning of STOP: an operator who knows STOP as "take it
out with its outro" would hard-cut on air. **Take Cinegy's LAYOUT — fixed positions, always
present, enabled or disabled by state, with icons — never its vocabulary.**

## e) Verb density — seven verbs across thirty rows

Thirty rows × seven verbs is 210 controls if every verb is a button. The split must come from the
ONE declaration point, not from a second list:

- `apps/runtime/src/renderer/ui/rowAction.ts` already derives buttons AND the context menu from
  the SAME `RowAction[]` (`toMenuItems`), with the confirm gate attached at declaration time
  (`withConfirm`). That property is what makes a menu an alternate entry point rather than a
  second, unguarded door (R-013).
- **Decision:** add ONE optional field to `RowAction` — a surface hint (e.g.
  `surface: 'button' | 'menu'`, default `'button'`) — and let the row render buttons from the
  filtered list while `toMenuItems` continues to receive the WHOLE list. Gate, handler and
  wording still come from one declaration; only PLACEMENT is derived. A second array of
  "menu-only actions" is explicitly rejected: that is the drift `rowAction.ts` exists to prevent.
- **Proposed placement** (open to change; the mechanism is what is being decided here): buttons =
  PLAY · STOP · CLEAR (+ LOAD on an empty row); menu = NEXT · UPDATE · REMOVE. UPDATE stays in
  the menu because the Inspector's Apply is its primary surface (§g).

## f) NEXT — it exists in the template, not on the wire

**Verified present in the template contract:** `window.next` is set by the exporter
(`docs/phases/phase-4-export-architecture.md:65`), `next()` is one of the CasparCG globals
(`packages/template-runtime/src/adapters/caspar-globals.ts:6`), and `runtime.next()` dispatches
per scope to sequence drivers (`runtime.ts:1522-1532`, `sequence-driver.ts:17` cites `CG NEXT`).

**Verified ABSENT on the wire:** `tools/caspar-bridge/src/command-builder.ts` has **no NEXT
verb**. The bridge cannot currently send `CG NEXT` at all. This is a gap, not an oversight to
paper over — it is OPEN CALL **(o2)**: whether closing it is in this change's scope or a
follow-up.

**When is NEXT enabled?** A row must know whether its loaded template HAS a next step. The bridge
knows `TemplateInfo` (fields, groups) — not whether the scene contains sequence drivers. The
answer has direct precedent: R-011's `defaultPosition` and R-018's `listFieldTargets` are both
derived at IMPORT, the one moment the app holds the unpacked scene, and recorded alongside the
template. **Decision:** derive a `hasNext` bit the same way, at the same moment, in
`produceTemplateDelivery`. Rejected: always-enable-and-let-it-no-op, because an enabled control
that can only do nothing is the exact anti-pattern R-021 stage 2b established ("an enabled button
must never invite a click that only rejects").

## g) The row, and what stays

ONE list of layer rows, ordered **DESCENDING by layer** so the list mirrors on-air z-order. No
Library panel, no separate Stack panel. Each row: alias · the real layer number (§b5) · template
name · a Description line · a state indicator (playing / stopped / empty).

**ONE Load button does the whole chain** — pick a `.vcg`, register it, bind to that exact slot,
load. That chain already exists and shipped in #419
(`importVcgFile` → `fixedLayers.load` → `LayerManager.bindFixed`); this model makes it the
primary path rather than a special case.

**The Inspector STAYS**, driven by row selection. It carries position (R-011) and the full field
set including nested composition groups (B-067), so it is strictly richer than Cinegy's per-row
expander. Keeping it is also what lets UPDATE leave the button row (§e).

## h) The local-file consequence — OPEN CALL (o1)

If Load means "pick a `.vcg` from your own machine", then a second operator on a different
computer needs that same file locally. Combined with §a's finding — the library is browser-local —
this is not hypothetical: operator B cannot load what operator A imported, and cannot even see it.

Two routes, both real, and the choice is the owner's:

1. **Upload once, serve from the bridge.** The bridge already serves template HTML over HTTP
   (`template-http-server.ts`) and already receives the produced HTML on `templates.import`. This
   route makes the bridge's registry the catalogue: it must gain PERSISTENCE (it is in-memory and
   empty on restart today) and a list channel that every browser reads. Largest change, correct
   end state, and it subsumes §a's defect.
2. **Shared filesystem.** Templates live on a share both machines mount; Load reads from a path.
   Cheaper, but it moves the problem into deployment and gives the bridge no catalogue — a
   restart still leaves rows whose templates the bridge cannot re-serve.

**Recommendation: (1).** It is the only one that makes "the bridge knows what is on the layer and
tells every browser the same thing" (§b2) true across a restart of a BROWSER, and it retires the
browser-local split rather than working around it. **Not decided here** — it changes
`runtime-template-library` and is an owner call.

## i) Playout-owned rows — visible, read-only, and DECLARED

Rows in the playout range are shown with honest occupancy and **no operator verbs**, labelled as
playout-owned. An operator must not accidentally take down what automation put up.

**Declared, never detected — and the harm of not declaring is concrete.** The wire carries only
`{ kind: 'producer', producer }` (`caspar-runtime.ts` `#computeFixedState`): OSC gives producer
KIND, not identity. A playout graphic and one of ours are both `html`. So:

- **Detection is impossible.** There is no signal that distinguishes them.
- **Without declaration, R-009's orphan sweep flags healthy playout graphics as ORPHANS** — the
  bridge sees an `html` producer on a layer it does not own and surfaces it as reclaimable. That
  is an operator being invited to clear live automation output.

**Mechanism:** C-015's existing `reservedLayers` seam. `validateFixedBank` already refuses
fixed∩reserved (`fixed-layers-store.ts:79` type, `:127` the overlap check) — it is `[]` at both
call sites today (`bridge.ts:194`, `caspar-runtime.ts:1370-1373`). Wiring a real value there, from
config, is the whole mechanism. This is why C-015 stops being distant and becomes a prerequisite.

## j) Template identity for a genuinely foreign layer — RECON, not reasoning

For a layer written by "anything else" (§the third writer), the row should state what it knows and
never guess. Today it can only say `producer: html`.

**Whether CasparCG's OSC exposes more than producer kind is UNOPENED.** It must be answered by
probing real 2.3.2 with `tools/caspar-amcp-probe`, never by reading our own code or reasoning from
the schema. Until probed, the row states the producer kind and that the template is unknown — and
`INFO`-family AMCP queries are the obvious probe target alongside the OSC tree.

## k) Fate of the dynamic machinery — each existed for a reason

| piece                             | reason it exists                                                           | fate under this model                                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LayerManager.allocate()`         | pick a free layer in a template-type range                                 | **No longer the operator path.** Keep the code (rundowns/presets and any non-row loader may still need it) but it must have NO caller that puts an operator graphic on air.                                                  |
| R-009 orphan sweep                | surface unowned on-air layers so they can be reclaimed                     | **Narrowed, still running.** With 60–99 declared (rows + reserved), its candidate set shrinks to layers nobody declared — which is exactly its honest job. §i is why the reserved half must be declared BEFORE this narrows. |
| R-015 foreign-refusal             | never CLEAR a layer we cannot prove is ours                                | **Still running underneath**, unchanged outside declared ranges. Inside a declared row, R-021's operator-territory carve-out (b1) already governs.                                                                           |
| B-092 / #368 restore fall-through | a retained item whose slot is taken lands somewhere rather than being lost | **Forbidden for declared rows** — this is R-021 stage-4 task 3.1, and it stops being an edge case (§l).                                                                                                                      |
| `LayerPolicy` ranges              | map template type → layer range                                            | **Descriptive only** once allocation is not the operator path (see §c on `logo-bug`).                                                                                                                                        |

## l) Effect on R-021 stage 4 — it becomes load-bearing, not superseded

Stage 4 (tasks 3.1–3.3, 4.3, 4.4) is NOT superseded. It becomes more critical, and the reason is
arithmetic: under R-021's original framing, a restore that fell through to allocate-elsewhere
affected only items bound to the ~10-slot fixed bank — an edge case. Under this model **every item
lives on a declared row**, so that fall-through would misplace EVERY item after a bridge restart.
Task 3.1's "fixed retained slot → NEVER `#allocate()` fall-through" moves from a corner-case guard
to the restore path's main rule. Likewise 4.3's Clear carve-out is now the ONLY way to free a row
whose producer is not ours.

**Ordering consequence, recorded:** #419 shipped a reachable binding while 3.1 is still open, so a
bridge restart today can bring a row's item back on a dynamic layer (recorded as D11 in
`runtime-fixed-layers/tasks.md` and as an operator warning in `docs/operator-guide/README.md`).
This change makes closing 3.1 a prerequisite, not a follow-up.

## m) Migration

Existing installs have items on dynamic layers right now. The change must state what happens to
them at the version boundary; **decided:** nothing is auto-moved. An item on a dynamic layer keeps
running where it is until it is removed; the new row surface shows declared rows only. Auto-moving
live graphics between layers at upgrade time would be an unattended on-air action, which this
repo's whole restore doctrine forbids (`design.md` §d of R-021: automatic paths never destroy).
The upgrade note tells the operator to clear and reload onto rows at a safe moment.

## OPEN CALLS — ANSWERED (owner, 2026-07-29; implemented in part A)

- **(o1) Where template files live — DECIDED: route 1, upload once, serve from the bridge.**
  The bridge's registry persists to disk (one JSON file per template under `--templates-dir`)
  and is hydrated at boot; a `templates.changed` publish carries the full catalogue to every
  browser; `templates.list/get` are bridge-served while the link is live, with the
  browser-local `LibraryStore` demoted to offline fallback + reconnect re-delivery source.
  Every browser sees the same library, and a bridge restart does not empty it.
- **(o2) The `CG NEXT` wire gap IS in scope — DECIDED: yes.** `command-builder.ts` gained the
  NEXT verb in part A; the channel/UI wiring lands in part B with the rest of the verbs.

## RECON owed before implementation

- **Does CasparCG 2.3.2 expose template identity** beyond producer kind, over OSC or `INFO`?
  (§j) — `tools/caspar-amcp-probe` against real hardware. **STILL UNRUN (no hardware in the
  part-A session), and no longer load-bearing for OUR row identity: with (o1) answered,
  identity comes from the bridge's own records + persisted registry, never from what CasparCG
  reports. It still matters only for the FOREIGN-row wording (task 5.3, part B) — see this
  change's `DEBT.md`.**
