# Design — fixed operator layers (R-021): ownership composition + restore semantics

Everything here is decided against the code as it exists on `main` (cited inline). Where a
question is a genuine product/on-air call, the recommendation is stated and marked
**OWNER DECISION** — those are collected in the final section so the owner can answer them in
one pass. The specs/ delta encodes ONLY the settled parts.

## a) Ownership composition — ONE resolution order over three notions

The three notions, and the order a layer's treatment is resolved in:

1. **C-015 Live Source ledger membership** — a layer the bridge's own ledger records as a
   Live Source (plate) layer is BRIDGE-OWNED regardless of its (non-html) producer kind.
2. **Fixed-range membership** — a layer inside the configured fixed range is
   OPERATOR-DESIGNATED territory: the R-021 carve-out of R-015's foreign-refusal applies
   (observed-producer hard Clear allowed on ANY kind — see (b) for the silence rule).
3. **Producer-kind discriminator** — everywhere else, R-015 / C-014 / R-009 apply exactly as
   today: non-`html` (and unobserved) refuses Clear; html orphans keep their confirm-gated
   Clear; allocation skips quarantined layers.

**The composition is made trivial by construction: notions 1 and 2 are FORBIDDEN to
intersect.** The fixed range and C-015's Live Source layer plan must be DISJOINT, validated at
CONFIG LOAD — never adjudicated at Clear time. A config whose Live Source sub-range (C-015's
"reserved sub-range below the template's layer" plan, a design.md decision on that item)
intersects `[fixedStart, fixedEnd]` is refused with a legible error before anything runs.
Rationale: precedence-at-Clear-time would let one operator action (a fixed-row hard Clear)
destroy a layer another subsystem (C-015) owns and must immediately re-establish — two
subsystems fighting over one layer on air. Prohibition costs one config check; precedence costs
a standing hazard. The same load-time validation refuses a fixed range that overlaps any
dynamic template-type range in the `LayerPolicy` (default policy ends at `custom` 60–69 with
`logo-bug` at 90–99, so the default 70–79 is naturally free —
`packages/caspar-client/src/layers/layer-manager.ts:33-40`).

With the intersection empty, the order above degenerates to: fixed range → carve-out rules;
C-015 ledger → bridge-owned rules; everything else → producer-kind rules. A routed/DECKLINK
producer that some OTHER system parks INSIDE the fixed range is exactly the carve-out's case:
the fixed row shows it honestly and observed hard Clear is available (owner-approved; the fixed
range is the operator's territory).

**OWNER DECISION (a1):** confirm the disjointness prohibition (recommended) over an explicit
precedence rule. Everything downstream assumes prohibition.

## b) OSC silence on a fixed row — unknown is shown; blind Clear does not fire

C-014 fails OPEN for allocation on a blind tap (an unobserved layer is allocatable — real
CasparCG goes silent for empty layers, B-053); R-015 REFUSES clearing on silence (silence
licenses nothing). A fixed row inherits neither automatically, so it is decided here:

- **Display:** with no fresh observation, the row shows occupancy as explicitly UNKNOWN
  ("no signal — occupancy unknown", the B-094 honesty class). It never shows "empty".
- **Hard Clear:** does NOT fire blind. On silence the layer verb refuses exactly as
  R-015's silence rule does, with the reason on the row. **Failure direction, stated
  plainly: this fails toward LEAVING unknown content on air.** The cost of that failure is
  an operator walking to another station or the server console; the cost of the opposite
  failure (blind CLEAR on a shared CasparCG) is killing another station's LIVE graphic that
  the silent tap could not see. The two are not symmetric; we choose the recoverable one.
  The carve-out is about OBSERVED foreign producers, not about firing into the dark.

**OWNER DECISION (b1):** one narrow exception is plausible and deliberately NOT assumed: when
the silent fixed slot holds THIS bridge's own retained intent (we placed it; our own ledger
substitutes for observation), a confirm-gated "Clear anyway" could be offered. Recommendation:
ship v1 WITHOUT the exception (absolute refusal on silence), add it only if operators hit the
wall in practice.

## c) Pinned mechanism — the exact code seam

`LayerManager` already has the primitive: pinned slots
(`LayerManagerOptions.pinned`, `layer-manager.ts:47-55`) are constructed `status: 'allocated'`
(`:104-113`), so `allocate()`'s scan can never return them (`:129-138` — only `free` slots
allocate) and `deallocate()` explicitly never releases them (`:165-174`). Fixed slots ride the
same fence — with one distinction: today's `PinnedSlot` is TEMPLATE-pinned (`templateId` +
`autoStart`, the logo-bug model, auto-played by the session). A fixed operator slot has NO
bound template until the operator binds one, so it must not inherit auto-start semantics.

**Seam:** a parallel `fixed: readonly LayerSlot[]` option beside `pinned` in
`LayerManagerOptions`, same allocated-from-birth fencing, plus `isFixed(slot)` beside
`isPinned(slot)` (`:183-185`). Dynamic allocation NEVER lands on a fixed slot for two
independent reasons: the born-allocated status (mechanism) and the (a) config validation that
keeps fixed out of every policy range (invariant). Binding an item to a fixed slot goes through
an exact-slot call of the `reserve()` class (`:155-162`) that consults the fixed set — not
`allocate()`.

**R-009 exclusion:** fixed layers are excluded from the orphan sweep's candidate set
(`tools/caspar-bridge/src/orphan-tracker.ts`) — a fixed layer's PERMANENT ROW is its occupancy
surface; surfacing it in the orphan banner too would double-report the same fact in two tones,
and an R-009 "reclaim" Clear there would bypass (b)'s rules. The filter consults the same fixed
config (single source; never a second local copy — the B-100/P-012 lesson).

## d) Restore / adopt-in-place vs #368 — where the branch goes, and the hard case

**The branch point is `#slotForRestore`
(`tools/caspar-bridge/src/caspar-runtime.ts:814-824`).** Today: `reserve(retainedSlot)` →
on `false` (slot quarantined/taken) → falls through to `#allocate()` — allocate-elsewhere,
which #368 introduced deliberately for DYNAMIC slots (its hardware-validated check #2). On a
FIXED slot that fall-through is FORBIDDEN (R-021 acceptance: "the item survives ON THE SAME
layer"): an item bound to layer 72 restoring onto layer 61 silently breaks the whole promise
("layer 72 is the clock").

**New branch:** if the retained slot is fixed → never `#allocate()`. Two sub-cases:

- **Fixed slot reservable** (free in the manager's book): reserve it exactly, then the
  standard B-092 deferred adopt-vs-re-ADD decides at the healthy transition against real
  occupancy — occupied-by-html adopts WITHOUT CLEAR; observed-empty re-ADDs. Unchanged B-092
  machinery, same slot.
- **Fixed slot not reservable** (quarantined — a foreign producer was observed there): the
  item PARKS on its fixed row as retained-pending. The row shows both facts honestly: "retained
  item waiting" + the observed occupancy. NOTHING is sent to the wire.

**The hard case — at restore the fixed slot holds a FOREIGN (non-html) producer:**

- **Adopt in place: NO.** Adopting a video as our html item is precisely B-092's recorded
  misadoption lie (the `unverifiable` limit in the R-015 design.md) — the row would claim an
  item that is not there.
- **Clear automatically: NO.** An automatic CLEAR of a live non-html producer at restore time
  is the blind-destruction class R-015 exists to prevent; the carve-out is an OPERATOR power,
  and restore is not an operator action. Automatic paths never destroy.
- **Refuse/park: YES (decided).** The item parks as retained-pending; the row offers the
  normal (b)-governed layer verbs. Service restores via the operator's explicit, observed,
  confirm-gated hard Clear followed by take — deliberate, two facts on screen, zero surprise.

**OWNER DECISION (d1):** whether the row may offer "Clear and load retained item" as ONE
confirm-gated compound action (convenience) or the two steps stay separate (recommended for
v1: separate — the compound verb hides a destructive step behind a constructive label).

**Tests this needs (planned in tasks.md, all unimplemented):**

1. Restore, fixed slot free → adopt-in-place on the SAME layer; never re-allocated elsewhere.
2. Restore, fixed slot quarantined (foreign observed) → NO allocate-elsewhere, item parked,
   foreign producer survives, ZERO CLEAR on the wire.
3. Restore, fixed slot occupied by our own surviving html producer (bridge-only restart) →
   adopt WITHOUT CLEAR on the fixed slot (B-092 rule, same layer).
4. Restore, OSC silent on the fixed slot → decision defers to the healthy transition; no
   blind CLEAR ever sent.
5. REGRESSION: dynamic (non-fixed) retained slots keep #368's fall-through to
   allocate-elsewhere unchanged.
6. Fixed-row hard Clear: observed foreign → CLEAR sent on confirm; silent → refused with the
   (b) reason; C-012 semantics distinguish Stop (producer resident) from Clear (destroyed).
7. Config validation: fixed∩LiveSource-plan refused at load; fixed∩policy-range refused;
   grow-at-end accepted live; shrink with residents refused naming the slots.

## e) Config shape — and what a live change does

```
fixedLayers: {
  channel: number;            // one channel per fixed bank (v1)
  start: 70;                  // never moves
  count: 10;                  // default TEN → 70–79; extendable ONLY at the end, max 20 (→ 89)
  aliases?: Record<number, string>;  // layer → operator-facing name, display-only
}
```

Default 70–79 because the default policy's dynamic ranges end at `custom` 60–69 and nothing
uses 70–89 except `logo-bug` at 90–99 (`layer-manager.ts:33-40`) — hence the hard ceiling at 89. Never renumbered mid-session: `start` is immutable at runtime; changing it requires a
bridge restart with an empty fixed bank (validated).

**Config change while items are resident:**

- **Grow at the end** (count 10 → 12): applies LIVE; new empty rows appear. Always safe —
  existing bindings unmoved.
- **Alias change:** applies live; display-only.
- **Shrink / renumber while ANY affected slot has a resident item or retained intent:**
  REFUSED with a legible error naming the occupied slots. Truncating a row out from under a
  live binding either orphans the item or invites an implicit clear — both wrong.
  **OWNER DECISION (e1):** refuse (recommended) vs "defer until empty" (the shrink applies
  automatically once the affected slots empty). Recommendation: refuse — deferred config is
  invisible state.

Storage: the bridge-side install-config class (the `connection-store.ts` precedent — same
persistence family R-025 names); R-023 extends the SAME config with per-slot shortcuts.

## f) Row verb surface — declared once (R-013 pattern)

One module builds `RowAction[]` per fixed row from `(localItem, observation)`
(`apps/runtime/src/renderer/ui/rowAction.ts` — declared once, rendered as buttons AND
context-menu items so gating/handler/wording cannot diverge; `toMenuItems` `rowAction.ts:66`).

- **Resident item is THIS bridge's** → the full item verb set, C-012 semantics precisely:
  Take (PLAY), Update, **Stop = `CG STOP`** (graceful outro, PRODUCER STAYS RESIDENT, OSC
  still reports `html`), **Clear = `CLEAR`** (producer destroyed, OSC goes silent). Same
  handlers as the stack row's — shared declarations, not copies.
- **Occupied by anything else** (another station's html graphic, or a non-html producer) →
  LAYER verbs only: hard **Clear** (per (b): observed only, confirm-gated) and graceful
  **Stop** — with one refinement: `CG STOP` is a template verb, so Stop is offered only when
  the observed producer is `html` (another station's graphic runs its outro; the verb is
  layer-addressed so no field schema is needed). What `CG STOP` does to a non-html layer on
  real 2.3.2 is UNVERIFIED — RECON note, never assumed; until verified, non-html shows Clear
  only. **Never Take/Update for a foreign item** — there is no field schema to update with.
- **Empty** → the import+load chain (pick `.vcg` → library import → item bound to THIS slot →
  Load via the exact-slot path), plus Load-from-library.

## g) Multi-station — which state is local, which is derived

The RULE is identical on every station; the STATE is not shared, and the design says so
honestly rather than pretending:

- **Derived from OSC (shared truth):** occupancy, producer kind, on-air-ness per fixed layer —
  every station's tap sees the same wire.
- **Local to the loading station:** the item BINDING — templateId, field values, drafts,
  retained intent (browser-local retention per B-092; the loading bridge's reconciler).

Consequence: the station that loaded layer 72 shows ITEM verbs; every other station shows the
SAME row with honest occupancy and LAYER verbs (Clear / Stop-if-html) — which is exactly the
R-021 promise ("always able to manage or clear a known layer", not "always able to edit
another station's fields"). Verb derivation is one function of `(localItem, observation)`, so
behavior is identical whichever station issued the load — same inputs, same rule. C-011's
persisted registry could later widen "local" toward "shared"; nothing here blocks that.

## h) Forward compatibility

- **R-023 (per-fixed-layer shortcuts):** a shortcut dispatches THE SAME `RowAction` handler
  the row's button runs — keyed `(slot, verbKey)` against (f)'s single declaration point, so a
  key can never be a second unguarded door (the R-013 principle extended to keys). Shortcut
  config lives in (e)'s install config; combos match the physical key (`e.code`) per the
  design-system rule.
- **R-024 / C-002 (rundowns / presets):** a rundown captures fixed-layer bindings as
  `(item → {channel, layer, alias-at-save})`. Import re-binds via the exact-slot path;
  a missing/mismatched fixed slot at import is a legible PER-ITEM error (R-024's own
  acceptance), never a silent rebind to a different layer; an alias difference is a warning
  only. Presets (C-002) reference slots the same way — the binding shape is defined once here
  so neither item invents its own.

## OWNER DECISIONS — collected for one pass

- **(a1)** Fixed range and C-015 Live Source layer plan: config-level DISJOINTNESS prohibition
  (recommended) vs precedence rule.
- **(b1)** Blind hard Clear on a silent fixed slot: absolute refusal in v1 (recommended) vs a
  confirm-gated own-retained-intent exception.
- **(d1)** Foreign-occupied fixed slot at restore: separate Clear-then-load steps
  (recommended) vs one compound confirm-gated action.
- **(e1)** Shrinking the fixed bank while slots are resident: refuse (recommended) vs
  defer-until-empty.
