# @cg/template-runtime

The rendering + playout engine for broadcast HTML graphics. Given a `Scene`
([`@cg/shared-schema`](../shared-schema)) it builds the DOM, binds live data,
animates keyframed properties, and drives the broadcast lifecycle (entrance →
hold → exit, with auto-out / loop cycles with timed or content-driven holds) —
including across **nested composition instances**, each with its own
independent lifecycle.

The **same code** runs in the Designer preview, the exported `.vcg`, and the
single-file CasparCG HTML, so what the Designer shows is what airs. For where this
sits in the platform, read [`docs/engines/overview.md`](../../docs/engines/overview.md)
first.

- **This doc = _how it's built_** (structure, contracts, invariants, extension
  points).
- **The behavioural contract = _what it does_** lives in the OpenSpec living specs
  and changes under [`openspec/`](../../openspec) (e.g.
  `add-animation-lifecycle-timing`, `add-hold-idle-loop`,
  `add-nested-lifecycle-cascade`, `add-nested-composition-field-scoping`). When a
  WHEN/THEN rule is what you're after, go there — don't rely on this prose.

## Public surface

Everything consumers use is re-exported from [`src/index.ts`](./src/index.ts):

| Export                                                       | Role                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `createRuntime(scene, options?)`                             | Build + own a runtime; returns the `TemplateRuntime` (`play`/`update`/`stop`/`pause`/`resume`/`remove`/`tick`/`on`).               |
| `installCasparGlobals(runtime, win?)`                        | Wire CasparCG's bare `window.play/update/stop/next/remove` to the runtime. Returns an uninstaller.                                 |
| `buildScene(scene, doc?)`                                    | Pure DOM builder → `{ container, elementMap, textOriginals, scopeTree }`.                                                          |
| `applyFieldValues` / `applyScopedFieldValues`                | Apply field values onto built DOM via the scene's bindings (flat / nested-scope).                                                  |
| `applyAnimationAtFrame`, `collectAnimatedElements`           | Per-frame animation application.                                                                                                   |
| `interpolateAtFrame`, `applyEasing`, `lerpHexColor`          | Keyframe math.                                                                                                                     |
| `FrameDriver`, `PlayoutController`                           | The timing primitives (normally owned by `createRuntime`).                                                                         |
| `TickerDriver`, `tickerDriverFor`, `coerceTickerItems`       | The ticker/crawler treadmill — inner repeat loop + `whenComplete()` content completion (D-028; normally owned by `createRuntime`). |
| `ClockDriver`, `clockInitialText`                            | The digital-clock driver — wall/countup/countdown repaint + countdown `whenComplete()` (D-027; normally owned by `createRuntime`). |
| `formatWallClock`, `formatCountClock`                        | The pure clock format-string engine (tokens, overflow absorption, digit mapping).                                                  |
| `SequenceDriver`, `sequenceDriverFor`, `coerceSequenceItems` | The now/next rotation — dwell/advance/passes, `next()`, reconcile + `whenComplete()` (D-029; normally owned by `createRuntime`).   |
| `edgeOffset`, `sampleTransition`, `transitionTotalMs`        | The pure sequence motion mapper (edge → vector, simultaneous/sequential composition, shared easing).                               |
| `RepeaterDriver`, `repeaterDriverFor`, `coerceRepeaterItems` | Data-driven rows — stamp-at-play / live-values (model B), NOT a content source (D-030; normally owned by `createRuntime`).         |
| `buildRepeaterRows`, `clampRowCount`, `repeaterItemValues`   | The row builder (flow cells + fresh row scopes) and its pure helpers.                                                              |
| `LifecycleStateMachine`, `EventBus`, `applyTransform`        | Lifecycle state, events, value transforms.                                                                                         |

## How it's built — module map

```
createRuntime (runtime.ts)  ─ the orchestrator
 ├─ buildScene (scene-builder.ts)         Scene → DOM + scope tree
 ├─ applyScopedFieldValues (bindings.ts)  field values → DOM (per scope)
 ├─ PlayoutController (playout-controller.ts)   one per scope: in→hold→out
 │    └─ FrameDriver (frame-driver.ts)          rAF playhead for one range
 │         └─ applyAnimationAtFrame (animation-applier.ts)
 │              └─ interpolateAtFrame (keyframe-eval.ts)
 ├─ TickerDriver (ticker-driver.ts)       one per ticker element: the crawl
 │      treadmill + the scope's self-wired content completion (whenComplete)
 ├─ ClockDriver (clock-driver.ts)         one per clock element: per-second
 │      time repaint; a countdown joins the content completion (whenComplete)
 │      └─ clock-format.ts                pure format-string engine
 ├─ SequenceDriver (sequence-driver.ts)   one per sequence element: now/next
 │      rotation (dwell + next()); a finite run joins the content completion
 │      └─ sequence-motion.ts             pure transition motion mapper
 ├─ RepeaterDriver (repeater-driver.ts)   one per repeater element: stamps a
 │      ROW SUBTREE per data item through wireScopeSubtree (count at play,
 │      values live); not a content source
 ├─ LifecycleStateMachine (lifecycle.ts)  pending→playing→on-air→exiting→stopped
 ├─ EventBus (event-bus.ts)               play.start / stop.end / ready / …
 └─ installCasparGlobals (adapters/caspar-globals.ts)   window.* → runtime
transforms.ts · css.ts   value formatters · baseline stylesheet
```

### scene-builder — `Scene` → DOM + the scope tree

`buildScene` walks layers (sorted by `zIndex`) and creates one node per element
(`text` / `ticker` / `clock` / `sequence` / `image` / `shape` rendered;
`container` / `lottie` / `video-placeholder` emit a tagged placeholder div so
layout and ids survive). It returns a **`scopeTree`** (a `FieldScope`): each
composition instance owns its **own** `elementMap`, `textOriginals`, container,
`animated` list, `tickers` + `clocks` + `sequences` lists, and lifecycle
`source`.

An `image` element builds as `<img data-cg-asset-id>` with **no `src`** — the
runtime doesn't own asset bytes; the **host** wires `src` (D-062). `createRuntime`
takes a `RuntimeBootOptions.assetUrls` map (`assetId → url`) and, after build, sets
each image's `src` from it. The exporters bake the map (`.vcg`: packaged relative
paths; single-file HTML: base64 `data:` URIs) so exported images render; the
Designer preview passes no map and wires `src` itself host-side (its
`applyAssetUrls`). Both exporters resolve bytes through the source-aware
`resolveImageAsset` seam in `apps/designer/src/platform/image-export.ts` (the
single spot the shared image library, D-040, will add a `'shared'` source).

A `ticker` element builds as a clipped band + an inner `track` (the driver's
crawl surface) + a static flex-row authoring layout (so the Designer canvas
shows the items with zero measurement; the driver removes it when the crawl
starts), and registers `{ element, band, track }` on `scope.tickers` for the
runtime to instantiate the driver.

A `clock` element builds as a flex box styled with the ticker band's subset
plus one LTR-isolated, `tabular-nums` time span, painted with a STATIC initial
value (wall = now at build, countdown = the full target remaining, countup =
zero) so the canvas is truthful without a driver; the span is registered as
`{ element, node }` on `scope.clocks`.

A `sequence` element builds as a clipped single-cell GRID box (`align-items`
centres; `justify-items` maps `align` 1:1; two items stack in the one cell
during a transition) with item 1 statically rendered through the driver's
shared item-node factory (bidi-isolated per `direction`); registered as
`{ element, host }` on `scope.sequences`.

A `repeater` element builds as the clipped outer box, registered as
`{ element, host, depth, visited }` on `scope.repeaters` (the build-context
guards travel with it so runtime row stamping keeps the cycle/depth limits).
`buildRepeaterRows` stamps flow-positioned cells (column = width-fit, row =
height-fit by `flow`, aspect preserved, zero-resolution guard) each holding a
FRESH row scope built from the child's layers. CRITICAL distinction: row
scopes join the WIRING tree only — they are never pushed into
`scope.children`, the D-025 NAMESPACE tree that feeds field aggregation and
GDD namespaces; the repeater's single bound `list` field is the data surface.

**Invariants**

- Element ids are unique **within a scope**, not globally — the same child
  composition instanced twice (`home`/`away`) yields two scopes with two element
  maps, so bindings and animation can't bleed across instances.
- Composition recursion is bounded by `MAX_COMPOSITION_DEPTH` **and** a visited-set
  (cycle guard); a missing/over-deep/cyclic reference renders as an empty clipped
  box rather than looping forever.

### bindings — field values → DOM

`applyFieldValues` (flat) and `applyScopedFieldValues` (nested) walk the scene's
declared `bindings`, look up each `fieldId` in the supplied values (falling back to
the field's `default`), run the optional `transform` (`transforms.ts`, e.g.
`persian-digits`, `date-fa`), and write to the DOM by `target.kind`
(`text` / `image` / `color` / `visible` / `transform` / `scene-background` /
`lottie-override` / `ticker-items` / `sequence-items` / `repeater-items` —
the last three route a `list` value to the element's driver via the
`tickerDriverFor` / `sequenceDriverFor` / `repeaterDriverFor` registries,
which reconcile by
stable item id).

**Invariants**

- **Idempotent + stateless** — safe to call at build, then on every `update()`.
- **One-way** — field → DOM only; the renderer never writes values back.
- Text caps to the field's `maxLength` **by code point** (a surrogate pair / ZWNJ
  counts as one and is never split).
- Nested values route by namespace: `values[instanceName]` descends into that
  child scope (D-025).

### FrameDriver — the playhead (time-based, `once` / `loop`)

A rAF loop that converts **elapsed wall-time** to a frame index via the scene's
`frameRate` — it does **not** count ticks, so a dropped frame doesn't desync
playback. Two modes:

- **`once`** — plays `[in, out]` a single time, holds at `out`, fires `onEnd`. The
  building block for IN→hold and OUT.
- **`loop`** (legacy default) — wraps back to `in` at `out` forever.

`start()` emits the in-frame **synchronously** (so first paint matches the playhead
before the first rAF). `pause()` freezes by remembering elapsed-ms; `resume()`
back-dates `startedAt` so the playhead continues from the frozen frame rather than
jumping forward by the paused span. The clock (`raf`/`cancel`/`now`) is injectable
for deterministic tests.

### PlayoutController — one composition's lifecycle (intro / hold / outro)

Owns the `FrameDriver` and the hold timer for **one scope**. Default is
**play-once-and-hold**: `play()` runs `[active.in → outPoint]` once and holds
(frozen) at `outPoint`; `stop()` runs `[outPoint → active.out]` and settles hidden.
An **absent `outPoint`** is the last active frame — so a composition with no marker
plays its whole timeline once and holds the last frame; **it does not loop**.

**Terminal model — Stop = CLEARED, Remove = destroy (D-085).** `stop()` plays the OUT
then settles into a **cleared** state: the runtime adds `body.cg-pending`
(`.cg-stage { visibility: hidden }`) and the root settle (`onRootSettled`) **halts every
driver** — ticker / clock / sequence / repeater — by cancelling its animation frame, and
hides every nested child via the body class. So content-driven elements (which carry no
opacity-out) **go away with the composition** rather than lingering frozen on the last
frame; an empty outro clears immediately. This is a **visibility** clear (hide + halt) —
the element nodes stay **mounted**, so `play()` re-reveals (`cg-pending` removed) and
re-inits the drivers from a fresh state. `remove()` is the separate **destroy** path: it
tears every subtree down and unmounts the stage (`cg-removed`). It mirrors CasparCG **CG
STOP** (out + cleared, re-playable) vs **CG REMOVE** (gone).

Playout **modes** (`scene.playout.mode`):

| Mode                 | Behaviour after the intro reaches `outPoint`                        |
| -------------------- | ------------------------------------------------------------------- |
| `manual` _(default)_ | hold frozen until `stop()`                                          |
| `auto-out`           | hold once, then run the outro automatically                         |
| `loop-cycle`         | repeat IN → hold → OUT for `repeat` cycles (`'infinite'` = forever) |

What ends each hold is the orthogonal **`holdSource`** axis (`auto-out` and
`loop-cycle`; ignored by `manual`): `'timed'` (default) holds for `holdMs`;
`'content-driven'` holds until the controller's `waitForContent` promise
resolves — the scope's CONTENT SOURCES complete: its tickers, its countdown
clocks, AND its sequences (an infinite ticker or infinite sequence ⇒ until
`stop()`; wall/countup clocks are NOT content sources and never extend the
hold; no content sources ⇒ a zero-length hold, deferred like a 0ms timer).
There is **no** `content-driven` mode — a stored legacy
`mode: 'content-driven'` normalizes to `loop-cycle` +
`holdSource: 'content-driven'` (`@cg/shared-schema`'s `PlayoutSchema`
preprocess / `playoutOf`).

There is **no separate continuous-loop mode** — a looping logo is `loop-cycle` with
`repeat: 'infinite'` (and `holdMs: 0` to loop the whole timeline).

`onHoldStart` (optional) fires at **every** hold entry, before the hold timing —
the runtime RESETS + STARTS the scope's ticker treadmills, clocks, AND
sequences there, so each composition open/close cycle replays the crawl from
its entering edge / re-runs the count from the top / restarts the rotation
from item 1 (a fresh run per cycle) and a `content-driven` wait always awaits
the run it just started.

**Invariants**

- `pause()` / `resume()` freeze and continue **both** the driver and the hold-timer
  countdown.
- A **settled** controller (its lifecycle finished: `auto-out` exited, or a finite
  `loop-cycle` ran out of cycles) is a **no-op on `stop()`** — a cascaded parent
  `stop()` must not replay the exit on a child that's already done. An infinite
  loop / manual hold / paused scope is _not_ settled and still exits.
- A stale `waitForContent` resolution (after `stop()`, or from an earlier
  cycle's hold) is ignored via a **hold token** — it can never replay the
  outro or settle the scope a second time.
- `onExitStart` fires **exactly once** per exit, before `onSettle`.

### The scope tree + the nested-lifecycle cascade

`createRuntime` builds a **controller tree that parallels the scope tree** — one
`PlayoutController` per scope, all on the single project `frameRate`. Each scope
runs its **own** `activeRange`/`lifecycle`/`playout` (merged with any per-scope
override) on its **own** timeline.

- **Cascade:** `play`/`stop`/`pause`/`resume`/`remove` apply parent-first to every
  controller, so a parent `play()` starts every nested instance and a parent
  `stop()` exits them — while each child still runs its own in→hold→out
  independently (D-026).
- **Only the root** drives the global `LifecycleStateMachine` + `EventBus` (one
  `stop.start`/`stop.end` per template exit); children use no-op hooks.
- **Per-scope overrides** are keyed by the instance-name **path** (`''` = root,
  `'home'` a child, `'home.inner'` a grandchild) so a preview/rundown can time each
  instance independently without touching the stored template.
- `tick(frame)` paints one shared frame across the **flattened** animated list — for
  the Designer scrubber, separate from the on-air per-scope drivers. The **ticker
  crawl, the clock, and the sequence are wall-clock-driven and have no
  representation in `tick()`** — scrubbing moves none of them (by design;
  D-028/D-027/D-029).
- **Per-element lifespan visibility** (a `lifespan {in,out}` from a timeline start/end
  trim) is evaluated by `applyLifespanGatesAtFrame(frame)`, called from BOTH `tick` (the
  scrubber) AND the root scope's per-frame `applyFrame` (on-air playback). So a
  start-trimmed clock/ticker/sequence (`lifespan.in > 0`) appears at/after its in-point
  and plays — it is **not** dropped just because it is absent at the open-time scrub frame
  (B-029). The gate restores each node to the `display` it had when the scene was built.

### TickerDriver — the crawler treadmill + content completion (D-028)

One driver per ticker element, instantiated by `createRuntime` per scope. It
virtualizes the item stream: nodes are fed just ahead of the entering edge,
recycled after they exit, positioned absolutely from measured widths (first
measured at/after `play()`, which awaits `document.fonts.ready`, and
**re-measured once per content cycle** — the per-pass self-heal that corrects
a width measured mid-font-swap within one lap, since `update()` never
re-awaits fonts), and moved by a single `transform: translateX` per frame. Items are bidi-isolated spans; the
element's `direction` is the **reading** direction (`'rtl'`: RTL layout, track
moves visually left→right — the Persian crawl).

The driver owns the **inner repeat loop**: `repeat: 'infinite' | N` (default
`'infinite'`) crawl passes per run, with `cycleBoundary: 'seamless' | 'drain'`
deciding the seam between passes. A finite run ends **cleanly** — feeding
stops after the Nth pass's last item, and `whenComplete()` resolves once that
item has fully exited the band (never cut mid-scroll; `'drain'` additionally
empties the band BETWEEN passes).

**Self-wired completion:** a scope whose composition contains CONTENT SOURCES
(tickers, countdown clocks, and/or sequences) gets an internal
`waitForContent` = `Promise.all` over those drivers' `whenComplete()` — a
`content-driven` hold ends when ALL the scope's finite tickers, countdown
clocks, AND finite sequences complete; an infinite ticker or infinite
sequence never resolves, holding the scope until `stop()`; wall/countup
clocks are excluded by construction. So preview, the single-file export, and
`.vcg` need **no boot wiring**, and a content source nested in a child
composition governs _its own_ scope. An **explicit**
`RuntimeBootOptions.contentHold` still overrides the root scope (external
override/test seam).

**Invariants**

- The treadmill rolls continuously **within one hold**; each composition
  open/close cycle gets a **fresh run** (the controller's hold entry does
  reset + start), and a fresh `play()` resets it too (removing the static
  authoring layout, so every intro shows the same band).
- `pause()`/`resume()` freeze/continue it in lockstep with the hold timer;
  settling stops it (frozen at the exact boundary). A ROOT self-settle cascades
  `stop()` to nested scopes and freezes every crawl — nothing rolls under a
  hidden stage.
- `setItems()` (the `update()` path) reconciles by stable id: entered nodes
  keep their position; an entered item with changed text is corrected **in
  place** (re-measured, leading edge fixed, downstream content shifted by the
  width delta); the unseen fed tail is dropped and re-fed from the new list —
  removed items are never re-fed, and a re-feed never pops in behind the
  entering edge.
- `RuntimeBootOptions.tickerMeasure` injects width measurement (happy-dom has
  no layout); `RuntimeClock` injects the rAF/now clock. The default measure is
  the fractional computed width (offsetWidth would round every boundary).

### ClockDriver — the time-text driver (D-027)

One driver per clock element, instantiated by `createRuntime` per scope, on
the ticker's self-wire pattern (lifecycle surface
`start`/`pause`/`resume`/`stop`/`reset`/`destroy`/`whenComplete`, injectable
`RuntimeClock`). An rAF loop recomputes the formatted string each frame (the
pure `clock-format.ts` engine: `HH H hh h mm m ss s A a` tokens,
longest-token-first, literals pass through, the LARGEST unit present absorbs
overflow, digits mapped LAST via `@cg/text-shaping`) and writes the DOM **only
when it changes** — ≈1 write/second.

Two time bases, chosen per mode: RELATIVE (`countup`, `countdown` with a
`duration` target) advances by accumulated ACTIVE time — `pause()` freezes,
`resume()` continues with no jump; ABSOLUTE (`wall`, `countdown` with a
`datetime` target) computes from `clock.now()` each paint — `pause()` merely
stops painting and `resume()` shows the TRUE current value (a real deadline is
never delayed). The driver's `now` defaults to `Date.now()` (the absolute
modes need a real epoch; the ticker's clock is performance-style).

**Invariants**

- A countdown clamps at 0 (never negative) and resolves `whenComplete()`
  exactly once per run when 0 paints; `reset()` mints a fresh promise, so each
  loop-cycle hold entry re-runs the full count. A past `datetime` target
  paints 0 and resolves immediately on its run start (zero-length content
  hold). `wall`/`countup` never resolve — not content sources.
- Absolute clocks (wall, datetime countdown) are also started at `play()`
  (`isAbsolute`), so they tick during the intro; relative counts display their
  initial value until their hold-entry run begins.
- `reset()` repaints the initial value by the same RULE the scene-builder's
  static render uses (wall = now, countup = zero, countdown = the target
  remaining now), so the authoring canvas and a between-runs stage can't drift
  in semantics. The time-dependent cases are recomputed at reset time by
  design — a datetime deadline is absolute and keeps approaching while the
  template idles; only a duration countdown repaints a constant.

### SequenceDriver — the now/next rotation + next() dispatch (D-029)

One driver per sequence element, instantiated by `createRuntime` per scope,
on the established self-wire surface
(`start`/`pause`/`resume`/`stop`/`reset`/`destroy`/`whenComplete`, injectable
`RuntimeClock`) plus `next()` and `setItems()`. ONE item is on stage at a
time; the move between items is mapped by the pure `sequence-motion.ts`
module over the DECOMPOSED transition (IN edge / OUT edge / timing — each
motion `transitionMs`, eased with the shared `ease-in-out`, transform-only
inside the clipped grid box). The decomposition is the extension seam: a
future style (fade, crossfade) is new enum member(s) + a mapper case —
additive, no schema break.

Dwell and transition progress are accumulated ACTIVE time — `pause()`
freezes the dwell AND an in-flight transition mid-motion; `resume()`
continues both with no jump. `advance: 'auto'` advances on each item's
`dwellMs` (falling back to `defaultDwellMs`) and on `next()` (which restarts
the new item's dwell); `'manual'` runs no timers. Advancing past the last
item of pass N (`repeat: N`) — by timer or `next()` — completes the run
exactly once: the LAST item stays on screen and `whenComplete()` resolves;
`reset()` mints a fresh promise and returns to item 1.

**`runtime.next()` is implemented here**: a per-scope dispatch, parent-first
over the scope tree, calling each scope's sequence drivers' `next()` and
resolving immediately — a safe no-op without sequences. The CasparCG
`CG NEXT` global (caspar-globals) already routes to it. This dispatch is
DELIBERATELY the seam the D-031 authored steps model will join (steps
register as another per-scope consumer, defining their precedence vs.
in-scope sequences in that change).

**Invariants**

- A `next()` before `start()` (during the intro) is IGNORED — no queueing;
  and a `next()` while a transition is in flight is ignored too (v1 — no
  mid-motion restarts).
- `setItems()` (the `sequence-items` binding path) reconciles by stable id:
  the CURRENT item is never yanked mid-display — a text edit corrects it in
  place; a removal takes effect at the next advance (the driver remembers
  the successor position); item order and per-item `dwellMs` come from the
  new list value.
- An empty items list is complete by definition at `start()` (the ticker's
  zero-content parity). Transition edges are PHYSICAL — `direction` drives
  per-item bidi isolation only, never mirrors motion.

### wireScopeSubtree + RepeaterDriver — dynamic scope wiring (D-030)

`createRuntime` wires every scope subtree through ONE factory:
`wireScopeSubtree(scope, path, isRootSubtree) → WiredSubtree { node,
tickers, clocks, sequences, repeaters, destroy }` — driver instantiation +
the controller tree for that subtree, with SYMMETRIC teardown (rows, then
controllers, then drivers). A `subtrees` set is what every runtime cascade
iterates (play resets, pause/resume, settle freeze, `next()` dispatch,
`remove()`), kind-major in wiring order. The static scene is the first
subtree; the factory exists so DYNAMIC scopes can join and leave the run
with exactly the same machinery — this is the extension seam for anything
that stamps scopes at runtime.

`RepeaterDriver` is its first consumer (liveness model B):

- **Count at fresh play:** `play()` resets repeaters FIRST — each tears its
  rows down and re-stamps from the CURRENT effective items (the bound list's
  retained value incl. a pre-play `update()`, else the authored items),
  clamped by `maxItems`. Every row is `buildRepeaterRows` + value apply (the
  per-scope `applyScopedFieldValues` path, item keys minus `id` = the
  child's field values) + `wireScopeSubtree` + attach under the hosting
  scope's `ScopeNode` — so the controller cascade reaches rows exactly like
  authored children (own out-point hold, own outro, pause/resume, own
  content-driven hold from the row's content sources).
- **Values live mid-hold:** `setItems()` applies positionally (row i ←
  item i; reorder is live). A SHORTER list hides surplus cells (display
  only — scopes persist); regrowth within the stamped count re-shows them;
  a LONGER list defers to the next fresh play (no mid-run scope creation).
- NOT a content source (no `whenComplete`); `tick(frame)` walks the live
  rows so scrubbing paints them like authored instances; teardown is
  leak-checked (no orphan rAF/timers after `remove()`).

### animation-applier + keyframe-eval — per-frame writes

`applyAnimationAtFrame` walks an element's `animation.tracks` and writes the
interpolated value for each animatable property at `frame`, batching transform axes
(position/scale/rotation) into single `left`/`top`/`transform` writes and reusing
the element's static transform for any un-tracked axis. Composite properties
(shadow, filter, stroke) **recompose the whole CSS declaration** from static +
animated components so animating one sub-property keeps the others.

**Box style (D-042).** Every background-capable kind — shape, text, ticker, clock,
sequence (the shared `BoxStyleSchema`) — renders a `stroke` border and a uniform
or per-corner `cornerRadius` (`scene-builder` emits the four-value `border-radius`
for a `[tl,tr,br,bl]` tuple). `applyAnimationAtFrame` is tuple-aware: it recomposes
`border-radius` each frame from the per-corner sub-tracks `cornerRadius.tl/tr/br/bl`
(each corner falling back to the static tuple), which also fixed the previously
broken animated-tuple path. cornerRadius animation applies to shape + text only. Per
**D-056**, the content-driven kinds (ticker / clock / sequence) carry no box: the
runtime paints/animates no background, stroke, border-radius, or padding for them —
only their text, text colour (incl. gradient via `colorFill`), and text-shadow (the
shadow appliers write `text-shadow` from `el.textShadow` for them, as text does).
Shape and text box styling is unchanged; text stroke stays static.

**Gradient text (B-016 / B-017).** A `background-clip: text` gradient fill cannot share a
node with the box background (it overwrites + clips it, B-016), nor sit under a
`text-shadow` (which paints over the clipped gradient, B-017), and — because the clip uses
the node's full background box — it must sit on a node **sized to the text**, or a box
wider than the text shifts which gradient stop falls on each glyph (B-016, width case). So
when the text colour is a **gradient** (linear/radial):

- **Text:** the gradient + `background-clip: text` + `color: transparent` + the glyph
  shadow as `filter: drop-shadow(...)` live on a dedicated **inner node** marked
  `data-cg-text`, while the box background / border / radius / padding / box-shadow stay on
  the host. The inner node is **content-sized** (`max-width: 100%`, auto width); the host
  is a flex column that positions it (`align-items` from `align`, `justify-content` from
  `verticalAlign`) so its width tracks the text.
- **Clock / sequence:** no box, so the gradient + clip + transparent colour go on the
  already content-sized **time span** / **item nodes** (so the gradient maps to the
  time/item text), and only the glyph `drop-shadow` is composed onto the host `filter`
  (alongside `element.filter`) — because the animation applier writes the host, and a
  filter there shadows the composited gradient text.

A **solid** text colour is unchanged — `color` + `text-shadow` on the host.
`text-render-node.ts`'s `textRenderNode(host)` resolves the text element's glyph node (the
`data-cg-text` child when gradient, else the host) so the scene builder, the field bindings
(text / colour writes), and the animation applier (colour + shadow) all target the same
node — including across a solid↔gradient switch (the inner node is created/removed on
rebuild and every writer follows it).

`interpolateAtFrame` contract: `frame ≤ first` → first value (no pre-roll
extrapolation); `frame ≥ last` → last value; otherwise interpolate between the two
surrounding keyframes using the **earlier** keyframe's outgoing easing (`step`
holds; a per-keyframe cubic `bezier` overrides the named easing). Numbers lerp;
`#RRGGBB(AA)` colours lerp componentwise.

### caspar-globals — the CasparCG adapter

Installs `window.play/update/stop/next/remove` and `window.cg`, returning an
uninstaller that restores prior globals. Payloads are coerced: a JSON **or** legacy
template-data **XML** string, or an already-parsed object (direct console use);
unknown keys are harmless (bindings only apply declared fields); unparseable
payloads are dropped silently (a broadcast frame can't write logs).

## Extension points — "how do I add X"

> Every change here should also add/extend the matching unit tests in
> [`tests/`](./tests) and an E2E test if it changes user-facing Designer behaviour
> (see the E2E rule in [`CLAUDE.md`](../../CLAUDE.md)). Update this doc when you
> change structure/contracts (doc-sync rule).

### Add a new element type

> Worked examples: the **ticker** (D-028) — schema variant
> `TickerElementSchema`, `buildTicker` in `scene-builder.ts`, and a per-element
> runtime driver (`ticker-driver.ts`) wired by `createRuntime` — the
> **clock** (D-027), the smallest driver-backed element on the same pattern
> (`ClockElementSchema`, `buildClock`, `clock-driver.ts` + the pure
> `clock-format.ts`) — and the **sequence** (D-029), which adds a structured
> binding (`sequence-items`) AND a command surface (`next()`) on top of it
> (`sequence-driver.ts` + the pure `sequence-motion.ts`).

1. **Schema** — add the element variant to `@cg/shared-schema`
   (`packages/shared-schema/src/elements.ts`) and the `Element` union.
2. **Render** — add a `case` in `buildElement` (`scene-builder.ts`) and a
   `buildXxx(element, doc)` that sets `dataset['cgElementId']`, calls
   `applyBaseStyles`, and renders the type-specific look. Until it's supported it
   falls through to `buildPlaceholder` (tagged div) automatically.
3. **Runtime behaviour** — if the element is live (time-driven, like the ticker
   or the clock), give it a driver owned by `createRuntime`: collect its nodes
   on the scope during build (cf. `scope.tickers` / `scope.clocks`), instantiate
   per scope, and hook its lifecycle into the cascade (play reset / pause /
   resume / settle / remove). If it can END a content-driven hold, expose
   `whenComplete()` and join the scope's content-source `Promise.all` (cf. the
   countdown clock). If it creates SCOPES at runtime, stamp them through
   `wireScopeSubtree` and attach under the hosting `ScopeNode` (cf. the
   repeater).
4. **Designer UI** — the canvas/inspector to author it (`apps/designer`).
5. If it can be **animated/bound**, make sure `applyBaseStyles` / `animation-applier`
   / `bindings` handle its target properties (see below).

### Add a new field type / binding target

> Worked example: the **`list` field** + **`ticker-items`** target (D-028) — an
> extensible structured value (array of open `{ id, … }` items) routed to the
> ticker driver's reconcile.

- **New field type:** add it to `@cg/shared-schema` (fields). `applyFieldValues`
  reads `field.default` and (for text) `field.maxLength` generically; only touch
  bindings if the value needs new coercion in `stringifyValue` (`transforms.ts`).
  A **structured** (non-string) value skips `stringifyValue`/`applyTransform`
  entirely — its `applyOne` case consumes the raw value (cf. `ticker-items`).
- **New binding target kind:** add the variant to `BindingTargetSchema`
  (`packages/shared-schema/src/bindings.ts`), then add a `case target.kind` in
  `applyOne` (`bindings.ts`) that writes to the DOM. Keep it **idempotent and
  stateless** (no read-back) — a target that drives stateful behaviour (the
  ticker) must make its consumer reconcile idempotently instead.
- **New value transform** (e.g. a new formatter): add it to `BindingTransformSchema`
  and `applyTransform` (`transforms.ts`); reuse `@cg/text-shaping` for
  Persian/RTL-aware formatting.

### Add a new animatable property

1. Add the property to `AnimatableProperty` in `@cg/shared-schema`.
2. In `animation-applier.ts`: for a plain numeric/colour write, add an
   `applyNumeric(...)` / track read; for a property that composes with siblings
   (another `transform`/`shadow`/`filter`/`stroke` axis), extend the relevant
   `*_PROPS` list and its recompose helper so static + animated values combine.
3. `keyframe-eval` already interpolates numbers and hex colours — extend `lerpValue`
   only for a genuinely new value type.

### Add a new playout mode / lifecycle behaviour

1. Add the mode to `PlayoutMode` / `Playout` in `@cg/shared-schema`.
2. In `playout-controller.ts`: if it repeats, include it in `cyclic()`; branch the
   hold/exit logic in `onIntroEnd` / `onOutroEnd` / `isFinalOutro`. Preserve the
   invariants above (settled-is-a-no-op on `stop()`, single `onExitStart`,
   pause/resume freezes driver **and** hold timer).
3. If the behaviour needs content-computed timing, prefer **self-wiring inside
   the runtime** from scene content (cf. content-driven holds: `createRuntime`
   derives each scope's `waitForContent` completion promise from its content
   elements' `whenComplete()` — tickers + countdown clocks + sequences — so
   preview/exports need no boot wiring) and keep
   `RuntimeBootOptions` as the external override/test seam (cf. `contentHold`
   for the root scope), threaded `RuntimeBootOptions` (`types.ts`) →
   `createRuntime` → `PlayoutControllerOptions`.
4. Capture the **behaviour** as an OpenSpec change (WHEN/THEN scenarios) — this doc
   only records the wiring.

## Testing

```bash
pnpm --filter @cg/template-runtime test                    # vitest (happy-dom)
pnpm --filter @cg/template-runtime exec vitest run --coverage
```

Tests inject the clock (`RuntimeClock` / `FrameDriver` raf+now) so lifecycle/timing
is deterministic — no real rAF. [`tests/golden.test.ts`](./tests/golden.test.ts)
pins a representative scene + fixed frame to exact rendered output; the per-module
suites cover the branches; [`tests/nested-lifecycle-cascade.test.ts`](./tests/nested-lifecycle-cascade.test.ts)
covers the cascade. Keep frame-precise behaviour here in unit tests; the integrated
UI path is guarded by the Designer E2E suite.
