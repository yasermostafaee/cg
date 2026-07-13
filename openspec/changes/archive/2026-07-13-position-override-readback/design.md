# Design — position override read-back (B-072)

## 1. Diagnosis

The bug reads like a persistence failure and is not one. Three facts, each
confirmed on the code this change forks from (`e4d4c98`, B-070 merged):

**The override IS persisted on the bridge, for the item's whole life.**
`CasparRuntime` holds `readonly #positions = new Map<string, Position>()`
(`caspar-runtime.ts:181`). `setPosition` writes it (`:527`) once the R-011
refusal predicate passes. `#sendAdd` reads it (`:1221`) on EVERY ADD and
appends `?pos=<anchor>&dx=<x>&dy=<y>` to the already-resolved served URL. Both
load's `CG ADD` and take's B-039 re-ADD flow through that one construction
path, so both inherit the override. The only deletion is in `remove` (`:711`) —
"the override dies with the ITEM". Nothing is lost on air; a Play after the
Apply renders at the override, exactly as the operator saw.

**Nothing carries it back.** `stack.set-position` answers `{ ok, reason? }` —
write-only, no companion read. The two channels that carry item state to the
SPA (`stack.snapshot`, `stack.state-changed`) both carry `StackItemState[]`,
and that shape (`item-state.ts:30-40`) is `itemId, templateId, fields, status,
pending, lastIntentSeq, lastOscAt, slot, errorCode` — **no position**. The
renderer is not failing to read the override; it has nothing to read.

**So the picker seeds from the only source it has: the default.**
`PositionPicker.tsx:59` — `const seed = defaultPositionOf(item.templateId)` →
`defaultPositionStore.ts:24` — `defaults.get(templateId) ?? CENTERED`. That map
is keyed by **templateId**, holds only manifest defaults recorded at `.vcg`
import, and has no concept of a per-item override. `Inspector.tsx:152` mounts
the picker as `<PositionPicker key={pos-${itemId}} item={item} />`, so
deselect → reselect unmounts and remounts, re-running `useState(seed)`. The
re-seed is deliberate (so switching items re-seeds); the defect is that the
ONLY seed source is the default. The loss is guaranteed by construction, not a
race.

### 1.1 Why this is worse than cosmetic

The picker is not a read-only display — it has an Apply button, and after a
reselect it displays a value that is NOT what is applied. An operator who
reselects, sees the manifest default, and re-presses **Apply position** —
reasonably concluding the override never took — sends the default and
**overwrites the correct on-air override**. A stale-looking picker plus one
innocent re-Apply silently reverts a good position. The underlying defect is
display-only; its blast radius is destruction of operator state. Hence high.

## 2. The fix

Surface the stored override over the stream that already exists.

1. **Schema** — `StackItemStateSchema` gains `position: PositionSchema.optional()`.
   Optional is the back-compat contract: absent means "no override", and the
   picker falls back to the manifest default exactly as today. Every existing
   item-state producer and consumer validates unchanged.
2. **Bridge — join at the EMIT site.** The Reconciler owns item state;
   `#positions` lives on `CasparRuntime`. Do NOT move ownership to reconcile
   them — a position override is operator UI state, not reconciled server
   truth, and the Reconciler must keep answering only to acks and OSC. Instead
   join them where the state is published, in one private helper
   (`#published()`) that maps `#reconciler.snapshot()` and attaches
   `this.#positions.get(itemId)` when present. That helper backs **both**
   renderer-facing exits and nothing else:
   - `stackSnapshot()` (`:436`) → the `stack.snapshot` channel
   - `stackChanged.emit(...)` in `#markDirty` (`:1238`) → `stack.state-changed`

   The other `#reconciler.snapshot()` callers (`removeAll`, the health/lock
   paths) are internal and stay raw. Because `remove()` already deletes from
   `#positions`, a removed item's next published state simply has no `position`
   — delete-on-remove clears the field for free, with no extra code.

3. **Renderer** — `PositionPicker` seeds from
   `item.position ?? defaultPositionOf(item.templateId)`. The itemId-keyed
   remount stays; only the seed SOURCE changes. The precedence is the same one
   the on-air boot script already implements (query override, else manifest
   default, else centered), so the picker now shows what the graphic will
   actually do.
4. **Mock** — `MockRuntime.stackSnapshot()` performs the same join from its own
   `#positions` (which its `positionOf` accessor already reads). Its
   `#emitStack()` routes through `stackSnapshot()`, so one join covers both of
   its channels, matching the bridge's shape exactly.

## 3. Why NOT a renderer-side override store

The cheap fix — a Zustand/module store keyed by itemId, written on Apply — was
rejected. It is the **B-070 anti-pattern**: renderer-local truth that diverges
from the authority. It would be wrong after a page reload (the bridge still
holds the override; the renderer's store is empty), wrong after a
reconnect/resync, and blind to delete-on-remove (a removed-then-reused itemId
would resurrect a dead override). B-070's root cause was precisely a UI built
against semantics the real bridge does not have. The bridge is the truth; the
read-back must come FROM the bridge.

Equally rejected: a new `stack.get-position` IPC channel. The item-state stream
already reaches the renderer on every mutation and is already the vehicle for
per-item truth (`fields`, `status`, `slot`, `errorCode`). A second channel for
a tenth field would be a parallel, racier path to the same place.

## 4. Frozen interactions

- **R-011 `set-position`** — the refusal predicate (pending/playing/on-air/
  updating/exiting/unconfirmed ⇒ `reason: 'on-air'`; not on the stack ⇒
  `unknown-item`), the picker lock that mirrors it (`isPositionLocked`), the
  loaded-not-taken invisible re-serve, and delete-on-remove are all unchanged.
  This change adds a read; it changes no write.
- **B-064 serve contract** — untouched. The override still rides the RESOLVED
  served URL's query as the single permitted touch; a bare/never-served id is
  still never given a query; the position still never enters the data payload,
  so the ADR-0006 / B-041 AMCP escape rule is unaffected. **No AMCP verb is
  added, no command string changes.** Nothing in this change reaches the wire
  to CasparCG at all.
- **B-070** (update producer-state rule), **B-044** (intents always settle),
  **reconnect-reconciliation**, **R-009**, **R-010**, **B-056** — untouched.

## 5. Verification

Most of B-072 is verifiable without CasparCG, because the on-air half already
works and this is a read-back fix: the mock publishes the override in item
state, so the DOM path exercises the real shape. The decisive UI assertion is
the blast-radius guard — mount the picker for an item whose state carries an
override, press Apply without editing anything, and assert the value SENT is
the override, not the manifest default/CENTERED. That is the exact regression
that used to destroy a correct on-air position.

A live check is still recorded in the PRD (apply → Play renders at the override
→ deselect/reselect now SHOWS the override → re-Apply unchanged leaves air
unchanged), pending hardware.
