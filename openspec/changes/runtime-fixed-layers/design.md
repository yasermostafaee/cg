# Design — fixed operator layers (R-021): ownership composition + restore semantics

Everything here is decided against the code as it exists on `main` (cited inline). The four
product/on-air calls this design flagged (a1/b1/d1/e1) were ANSWERED by the owner on
2026-07-23 and are encoded in place below — the final section records the answers. The specs/
delta encodes what is settled. (Terminology: our concept is **Live Source** per the C-015
rename; the schema type remains `video-placeholder` / `VideoPlaceholderElementSchema` —
renaming the type is a scene migration and out of scope, per that item's Naming note.)

## a) Ownership composition — ONE resolution order over three notions

The three notions, and the order a layer's treatment is resolved in:

1. **C-015 Live Source ledger membership** — a layer the bridge's own ledger records as a
   Live Source layer is BRIDGE-OWNED regardless of its (non-html) producer kind.
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

**RESOLVED (a1, owner 2026-07-23): config-load disjointness prohibition.** The fixed bank and
any C-015 Live Source layers must not overlap; a violation is a HARD, legible startup failure
naming BOTH ranges — never a warning. Because the bank is extendable to 89, the check runs
BOTH at config load AND on any extension — an extension that would collide with Live Source
layers is refused the same way, otherwise a later extension silently recreates the overlap
the load-time check exists to prevent.

## b) OSC silence on a fixed row — unknown is shown; hard Clear IS permitted, confirm-gated

C-014 fails OPEN for allocation on a blind tap (an unobserved layer is allocatable — real
CasparCG goes silent for empty layers, B-053); R-015 REFUSES clearing on silence (silence
licenses nothing). A fixed row inherits neither automatically, so it is decided here:

- **Display:** with no fresh observation, the row shows occupancy as explicitly UNKNOWN
  ("no signal — occupancy unknown", the B-094 honesty class). It never shows "empty".
- **Hard Clear: PERMITTED under OSC silence, confirm-gated.** **RESOLVED (b1, owner
  2026-07-23)** — and deliberately NOT this design's original recommendation. Rationale,
  recorded: an absolute refusal would make R-021 NON-FUNCTIONAL on no-OSC installs, and
  C-014 already settled the precedent that silence must not cause total lockout (its
  blind-tap fails OPEN for allocation precisely so no-OSC installs aren't locked out). Being
  unable to REMOVE a wrong graphic from air is worse than being unable to place one — on-air
  RECOVERY must never be locked out. The confirmation dialog MUST state honestly that
  occupancy is unknown and MUST name the layer number explicitly (e.g. "Occupancy of layer
  72 is unknown — no OSC signal. CLEAR will destroy whatever is on it."). R-015's
  foreign-refusal is untouched OUTSIDE the fixed range; this permission exists only inside
  the operator-designated bank, and only because of the deployment invariant below.

## b′) Deployment invariant — every station declares the SAME fixed bank

b1's blind Clear is legitimate ONLY because the fixed range is territory every station has
AGREED is operator-managed: whatever is on layer 72, all stations placed it (or accept it may
be cleared) under that agreement. **All stations sharing one CasparCG MUST declare the SAME
fixed bank.** Divergent banks are the (a) overlap problem in another form: station A's
"fixed layer 75" being station B's dynamic-range or Live Source layer re-creates exactly the
cross-subsystem destruction the disjointness prohibition exists to prevent — with a blind
Clear now permitted on it.

**Runtime detectability — stated honestly: not directly detectable today.** Stations share
only the CasparCG wire (AMCP/OSC carry no config), and bridges do not talk to each other, so
a bridge cannot SEE another bridge's bank. What the implementation can and should do:

- validate the invariant WITHIN everything one bridge can see (its own config vs its own
  policy ranges and Live Source plan — the (a) checks);
- document the invariant as an INSTALLATION requirement beside the config (the same class of
  operator contract as "point `<predefined-client>` at the bridge's OSC port", C-009);
- treat repeated foreign HTML occupancy inside the fixed bank as a soft diagnostic (a hint
  the banks diverge), surfaced as information, never enforcement.

C-011's persisted/shared registry is the natural future seam if cross-station config exchange
ever exists; nothing here blocks it.

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

**Stage-4 note (stage 1's quarantine rule, restated here where the mechanism lives):** fixed
slots are NEVER quarantined and always read `allocated`, so nothing in the LayerManager records
a foreign producer on a fixed slot. Stage 4 must therefore derive `restore-blocked` from the
OCCUPANCY TAP (the same sample the sweep and the stage-2a per-slot state read), never from the
quarantine set — a fixed slot never enters it.

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
  item enters the named **`restore-blocked`** state on its fixed row (see the d1 resolution
  below). The row shows both facts honestly: the retained item waiting + the observed
  occupancy. NOTHING is sent to the wire.

**The hard case — at restore the fixed slot holds a FOREIGN (non-html) producer:**

- **Adopt in place: NO.** Adopting a video as our html item is precisely B-092's recorded
  misadoption lie (the `unverifiable` limit in the R-015 design.md) — the row would claim an
  item that is not there.
- **Clear automatically: NO.** An automatic CLEAR of a live non-html producer at restore time
  is the blind-destruction class R-015 exists to prevent; the carve-out is an OPERATOR power,
  and restore is not an operator action. Automatic paths never destroy.
- **Refuse/park: YES (decided).** The item parks on its fixed row; the row offers the normal
  (b)-governed layer verbs. Service restores via the operator's explicit, confirm-gated hard
  Clear followed by take — deliberate, two facts on screen, zero surprise.

**RESOLVED (d1, owner 2026-07-23): separate Clear-then-load steps — never one compound
action** (a compound verb would hide a destructive step behind a constructive label; the
B-100 lesson about one condition gating a destructive AND a constructive step applies to the
UI surface too). **Consequence, encoded:** when restore finds a fixed slot foreign-occupied,
the retained item lands in a NAMED, VISIBLE blocked state on that row —
**`restore-blocked` ("BLOCKED — layer occupied")**: the row shows the retained item's
identity, the observed occupancy, and that the item is waiting; it is a first-class row
state, not a silent absence. It must NOT fall through to allocate-elsewhere (forbidden on
fixed slots per R-021 and the #368 narrowing) and must NOT auto-clear. Leaving
`restore-blocked` takes an explicit operator Clear (then take), or the foreign producer
vacating (next sweep observes empty → the normal deferred re-ADD proceeds). Tests for the
state are enumerated in tasks.md (unimplemented).

## ⭐ AMENDED IN IMPLEMENTATION (stage 4, 2026-08-14) — where the branch actually went

The decision above is unchanged. Two things about it turned out to be wrong in the DETAIL,
and both are recorded here rather than silently coded around.

**1. "Fixed slot not reservable (quarantined)" is not the test, and could not be.** That
wording predates stage 1, which made `quarantine()` and `observe()` NO-OPS on a fixed slot
(a fenced slot is not an allocation candidate, and a quarantined one would break
`bindFixed`) and recorded that stage 4 would read the OCCUPANCY TAP instead. It does. But
the tap cannot be read at `#slotForRestore` time at all: a restore runs at bridge boot,
BEFORE CasparCG is necessarily reachable, which is the whole reason `#pendingRestore`
exists. So the decision splits across the two places it belongs:

- `#slotForRestore` carries the SLOT-SELECTION rule — a fixed slot is bound exactly or the
  item is skipped; `#allocate()` is unreachable for one. This is the ban.
- `#decidePendingRestores` carries the OBSERVATION — a fixed slot observed holding a
  non-html producer parks in `restore-blocked` instead of adopting. This is the state.

The item STAYS in `#pendingRestore` while blocked, and that is what makes d1's second exit
(the foreign producer vacating) work with no separate un-block mechanism: the same decision
re-runs from the sweep, sees a silent layer, and re-ADDs through the ordinary path. A
dedicated "unblock" path would have been a second copy of a rule that already exists.

**2. There is a THIRD case, and the design named only two.** A retained fixed slot can also
be already BOUND — by another restored item naming the same row. It is skipped with its own
reason (`fixed-slot-taken`), never re-homed: nothing is exhausted, so `no-layer` would
send the operator to free a dynamic layer that could not possibly help.

**3. The dynamic half was ALREADY BROKEN when stage 4 opened it (D12).** B-114 fixed the
declared row by REPLACING `reserve()` with `bindFixed()` rather than branching — so every
DYNAMIC retained coordinate lost its exact-slot restore and fell straight through to
`#allocate()`, consulting a different layer's occupancy, which is precisely the hazard
`#slotForRestore`'s own contract forbids. Test 5 below was written for a property that was
supposed to be untouched and found it already gone; it is now pinned in both halves.

**Tests this needs (planned in tasks.md, all unimplemented):**

1. Restore, fixed slot free → adopt-in-place on the SAME layer; never re-allocated elsewhere.
2. Restore, fixed slot quarantined (foreign observed) → NO allocate-elsewhere, item enters
   the named `restore-blocked` state, foreign producer survives, ZERO CLEAR on the wire.
3. Restore, fixed slot occupied by our own surviving html producer (bridge-only restart) →
   adopt WITHOUT CLEAR on the fixed slot (B-092 rule, same layer).
4. Restore, OSC silent on the fixed slot → decision defers to the healthy transition; no
   automatic CLEAR is ever sent by restore.
5. REGRESSION: dynamic (non-fixed) retained slots keep #368's fall-through to
   allocate-elsewhere unchanged.
6. Fixed-row hard Clear: observed foreign → CLEAR sent on confirm; OSC-silent → CLEAR
   available (b1), confirm dialog states occupancy is unknown AND names the layer number;
   C-012 semantics distinguish Stop (producer resident) from Clear (destroyed).
7. Config validation: fixed∩LiveSource-plan refused at LOAD and at EXTENSION, error naming
   both ranges; fixed∩policy-range refused; grow-at-end accepted live; shrink with residents
   refused, error naming the occupied slot numbers.
8. `restore-blocked` lifecycle: entered on foreign-occupied restore; exits via explicit
   operator Clear + take, AND via the foreign producer vacating (observed empty → normal
   deferred re-ADD); never exits via allocate-elsewhere or auto-clear.

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
  **RESOLVED (e1, owner 2026-07-23): REFUSED**, with an error that NAMES the occupied slot
  numbers. Truncating a row out from under a live binding either orphans the item or invites
  an implicit clear — both wrong. **Defer-until-empty was rejected because** it lets the
  declared config and the actual state diverge silently for an UNBOUNDED time — a pending
  shrink is invisible state that fires whenever a slot happens to empty, which is exactly the
  config-vs-reality ambiguity this design resolves loudly at config time everywhere else.

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
  LAYER verbs only: hard **Clear** (per (b): confirm-gated; under OSC silence the dialog
  states occupancy is unknown and names the layer — b1) and graceful
  **Stop** — with one refinement: `CG STOP` is a template verb, so Stop is offered only when
  the observed producer is `html` (another station's graphic runs its outro; the verb is
  layer-addressed so no field schema is needed). What `CG STOP` does to a non-html layer on
  real 2.3.2 is UNVERIFIED — RECON note, never assumed; until verified, non-html shows Clear
  only. **Never Take/Update for a foreign item** — there is no field schema to update with.
- **Empty** → the import+load chain (pick `.vcg` → library import → item bound to THIS slot →
  Load via the exact-slot path), plus Load-from-library.

**Stage-2a note — the wire carries FACTS, never a computed row state.** The per-slot state
channel ships exactly `{channel, layer, alias?, observed, binding}`: the occupancy observation
(`unknown` / `empty` / `producer`) and the binding (null until stage 3), nothing more. A
bridge-computed row state or verb list would be a SECOND derivation of "what may the operator
do here" that can drift from the renderer's — the exact two-copies failure mode the repo's
one-canonical-predicate rule exists to prevent. Verb derivation stays THIS section's ONE
function of `(localItem, observation)`, renderer-side; stage 4 extends `binding` additively
(`restore-blocked` rides there), never as a new top-level row state.

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

## The principle these four share

**Conflicts are resolved at CONFIG/STARTUP time, loudly — never at on-air action time.**
a1 refuses overlap at load and at extension rather than adjudicating precedence at Clear
time; d1 makes a restore conflict a named, visible state awaiting an explicit operator step
rather than an automatic resolution; e1 refuses a shrink at config time rather than letting
config and reality diverge silently. **b1 is the one deliberate exception, and it points the
other way for a reason: on-air RECOVERY must never be locked out** — the ability to REMOVE
wrong content from air outranks the ability to place it, so inside the operator-designated
bank a confirm-gated Clear works even blind. Future decisions in this area follow this spine
rather than being re-litigated case by case.

## Resolved in implementation (stage 1) — what the design left open

- **Placement (D1):** the bank SHAPE (`FixedLayerBankSchema`) lives in `@cg/shared-ipc`
  (`channels/fixedLayers.ts`, schema/types only — channels come with stage 2); the
  LayerManager mechanism in `@cg/caspar-client` takes a plain `readonly LayerSlot[]` and
  never learns the bank shape (no dependency on `@cg/shared-ipc`); validation + persistence
  in `tools/caspar-bridge/src/fixed-layers-store.ts` (the `connection-store` pattern).
- **The exact-slot path (D3):** `bindFixed(slot, templateType)` / `unbindFixed(slot)` on the
  LayerManager — NOT `reserve()`, which refuses fixed slots. A fenced-but-unbound slot
  carries no templateType, so it is absent from `allocations()` until bound.
- **Quarantine/observe (D5):** a fixed slot is never quarantined and never emits
  `collision` — a fenced slot is not an allocation candidate, and a quarantined fixed slot
  would break `bindFixed`. **Stage 4 note:** `restore-blocked` must be derived from the
  OCCUPANCY TAP, never from the quarantine set (fixed slots never enter it).
- **Present-but-unusable file (D8):** a declared fixed-layers file that cannot be used
  (unreadable / bad JSON / schema-invalid / failing validation) is a HARD boot failure
  before the WebSocket binds — deliberately diverging from connection-store's
  warn-and-ignore, because silently ignoring a declared bank leaves the operator believing
  a layer is fenced when it is not (the (e) silent-divergence refusal). An absent file means
  no bank and byte-identical behaviour to today.

## OWNER DECISIONS — all RESOLVED (owner, 2026-07-23), encoded in place above

- **(a1)** Disjointness prohibition — hard legible startup failure naming both ranges;
  checked at load AND on every extension. (§a)
- **(b1)** Hard Clear permitted under OSC silence, confirm-gated, dialog names the layer and
  states occupancy is unknown — NOT the original recommendation; rationale recorded. Depends
  on the same-bank deployment invariant. (§b, §b′)
- **(d1)** Separate Clear-then-load steps; foreign-occupied restore lands in the named
  `restore-blocked` row state — never allocate-elsewhere, never auto-clear. (§d)
- **(e1)** Shrink-with-residents refused, error names the occupied slots; defer-until-empty
  rejected as silent config/state divergence. (§e)
