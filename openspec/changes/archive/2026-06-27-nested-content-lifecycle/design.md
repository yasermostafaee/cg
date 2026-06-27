# Design — nested-composition content lifecycle (D-104)

## The "coordinator" rule (the key decision)

The runtime already builds a controller tree paralleling the composition-instance
scope tree (`ScopeNode`), and each scope self-wires a content-driven hold from its
OWN tickers/countdowns/sequences. The naive "make the parent wait for all nested
content" breaks the existing per-scope holds (e.g. a nested content-driven band that
self-settles while a manual parent stays on air; a repeater row whose countdown
drives only the ROW's hold).

So coordination keys off **content-driven-ness**:

- A scope is a **coordinator** iff `effectivePlayout.mode !== 'manual'` and
  `holdSource === 'content-driven'`.
- A coordinator starts + awaits its OWN content drivers **plus** the content of
  every _non-coordinator_ descendant (recursing through the composition-instance
  tree, **stopping at** any coordinator descendant — that descendant owns its own
  subtree and self-settles).
- A non-coordinator scope **under a coordinator ancestor** does NOT start its own
  content (the coordinator ancestor resets+starts it at the coordinator's
  hold-start). With **no** coordinator ancestor it keeps today's behavior (starts
  its own content at its own hold-start — the content just runs, nothing awaits it).

Why this is right:

- **D-104 bug case** = coordinator parent + non-coordinator nested content → now
  aggregated and gated → parent holds for it; it starts at the parent's hold-start.
- **No regression**: existing content-driven nested comps in tests are THEMSELVES
  content-driven (coordinators), so the parent skips them — unchanged. Repeater rows
  and sequence composition-items are separate subtrees (`wireScopeSubtree`), each
  with a fresh coordinator context, so a row's content-driven hold stays the row's.
- **Infinite** nested content → its `whenComplete()` never resolves → the
  coordinator's aggregate never resolves → holds until `stop()`.

## Mechanics

`wireScope(scope, path, isSubtreeRoot, hasCoordinatorAncestor)`:

- compute `effPlayout` once; `isCoordinator = effPlayout.mode !== 'manual' &&
effPlayout.holdSource === 'content-driven'`.
- `startOwnContent()` — reset+start own tickers/clocks/sequences (today's
  `onHoldStart` body); `ownContentWait()` — `Promise.all` of own tickers + own
  countdown clocks + own sequences `whenComplete()`, or `null`.
- `ScopeNode` gains `isCoordinator`, `startOwnContent`, `ownContentWait`, and
  `instanceChildren` (the `scope.children` ScopeNodes ONLY — NOT repeater rows,
  which are pushed to `node.children` for the cascade).
- module-level recursion over `instanceChildren`, skipping coordinator children:
  `startContentTree(node)` and `contentTreeWait(node)` (used for the recursive
  descent into child nodes).
- controller wiring (coordinator only; non-coordinators supply no `waitForContent`,
  and self-start their content only with no coordinator ancestor):
  - `waitForContent`: `isGlobalRoot && options.contentHold` wins; otherwise
    aggregate `ownContentWait()` with each non-coordinator child's
    `contentTreeWait(child)`.
  - `onHoldStart`: `startOwnContent()` then `startContentTree(child)` for each
    non-coordinator child.
- `instanceChildren` (the `scope.children` map) is built BEFORE the controller — it
  doesn't depend on the controller — so the lazy content closures close over it
  directly (no forward reference; `node` stays a plain `const`).
  `hasCoordinatorAncestor || isCoordinator` is threaded to `scope.children`;
  `wireScopeSubtree` always passes `hasCoordinatorAncestor = false` (fresh per
  subtree).

## Risks / edges

- A non-coordinator covered child set to a finite TIMED auto-out stops its own
  drivers (`onSettle` → `stopScopeContent`) on its own outro before they complete,
  so the coordinator's captured `whenComplete()` never resolves and the parent is
  stranded ON AIR until an external `stop()` (a frozen graphic, not merely a longer
  hold — confirmed by adversarial review). The authoring norm is a manual/default
  nested holder, so this is an accepted edge: NOT handled here. **Follow-up guard**
  to consider: when a covered child's controller settles, resolve (or drop) the
  coordinator's wait on that child so the parent can play out.
- Absolute (wall/countup) clocks aren't content and already get reset+started at
  hold entry by today's `onHoldStart`; `startContentTree` preserves that.

## Reframed test

`ticker-runtime` "a finite root self-settle exits a nested infinite ticker": the
nested comp becomes content-driven (a coordinator) so the root still self-settles
(it skips the coordinator child → zero-length) and cascades the teardown — the
scenario's intent, now correct under the coordinator rule. A NEW test covers the
non-coordinator nested infinite ticker (parent holds until stop).

## Out of scope

No schema change. Sequence composition-ITEMS (D-083) keep their own show/hide-driven
content lifecycle. Deep both-content-driven nesting beyond the coordinator boundary
is intentionally independent.
