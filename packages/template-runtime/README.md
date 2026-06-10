# @cg/template-runtime

The rendering + playout engine for broadcast HTML graphics. Given a `Scene`
([`@cg/shared-schema`](../shared-schema)) it builds the DOM, binds live data,
animates keyframed properties, and drives the broadcast lifecycle (entrance →
hold → exit, with loop / auto-out / content-driven variants) — including across
**nested composition instances**, each with its own independent lifecycle.

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

| Export                                                | Role                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `createRuntime(scene, options?)`                      | Build + own a runtime; returns the `TemplateRuntime` (`play`/`update`/`stop`/`pause`/`resume`/`remove`/`tick`/`on`). |
| `installCasparGlobals(runtime, win?)`                 | Wire CasparCG's bare `window.play/update/stop/next/remove` to the runtime. Returns an uninstaller.                   |
| `buildScene(scene, doc?)`                             | Pure DOM builder → `{ container, elementMap, textOriginals, scopeTree }`.                                            |
| `applyFieldValues` / `applyScopedFieldValues`         | Apply field values onto built DOM via the scene's bindings (flat / nested-scope).                                    |
| `applyAnimationAtFrame`, `collectAnimatedElements`    | Per-frame animation application.                                                                                     |
| `interpolateAtFrame`, `applyEasing`, `lerpHexColor`   | Keyframe math.                                                                                                       |
| `FrameDriver`, `PlayoutController`                    | The timing primitives (normally owned by `createRuntime`).                                                           |
| `TickerDriver`, `tickerDriverFor`, `coerceTickerItems` | The ticker/crawler treadmill (D-028; normally owned by `createRuntime`).                                            |
| `LifecycleStateMachine`, `EventBus`, `applyTransform` | Lifecycle state, events, value transforms.                                                                           |

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
 │      treadmill + the scope's self-wired content-driven durationHook
 ├─ LifecycleStateMachine (lifecycle.ts)  pending→playing→on-air→exiting→stopped
 ├─ EventBus (event-bus.ts)               play.start / stop.end / ready / …
 └─ installCasparGlobals (adapters/caspar-globals.ts)   window.* → runtime
transforms.ts · css.ts   value formatters · baseline stylesheet
```

### scene-builder — `Scene` → DOM + the scope tree

`buildScene` walks layers (sorted by `zIndex`) and creates one node per element
(`text` / `ticker` / `image` / `shape` rendered; `container` / `lottie` /
`video-placeholder` emit a tagged placeholder div so layout and ids survive). It
returns a **`scopeTree`** (a `FieldScope`): each composition instance owns its
**own** `elementMap`, `textOriginals`, container, `animated` list, `tickers`
list, and lifecycle `source`.

A `ticker` element builds as a clipped band + an inner `track` (the driver's
crawl surface) + a static flex-row authoring layout (so the Designer canvas
shows the items with zero measurement; the driver removes it when the crawl
starts), and registers `{ element, band, track }` on `scope.tickers` for the
runtime to instantiate the driver.

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
`lottie-override` / `ticker-items` — the last routes a `list` value to the
band's `TickerDriver` via the `tickerDriverFor` registry, which reconciles by
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

Playout **modes** (`scene.playout.mode`):

| Mode                 | Behaviour after the intro reaches `outPoint`                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manual` _(default)_ | hold frozen until `stop()`                                                                                                                                   |
| `auto-out`           | hold `holdMs`, then run the outro automatically                                                                                                              |
| `loop-cycle`         | repeat IN → hold → OUT for `repeat` cycles (`'infinite'` = forever)                                                                                          |
| `content-driven`     | like `loop-cycle`, but each pass's duration comes from `durationHook()` (the ticker computes content→duration), recomputed per pass; `holdMs` does not apply |

There is **no separate continuous-loop mode** — a looping logo is `loop-cycle` with
`repeat: 'infinite'` (and `holdMs: 0` to loop the whole timeline).

`onHoldStart` (optional) fires at **every** hold entry, before the mode timing —
the runtime starts the scope's ticker treadmills there (idempotent), so a
`content-driven` hook always measures a started crawl.

**Invariants**

- `pause()` / `resume()` freeze and continue **both** the driver and the hold-timer
  countdown.
- A **settled** controller (its lifecycle finished: `auto-out` exited, or a finite
  `loop-cycle`/`content-driven` ran out of cycles) is a **no-op on `stop()`** — a
  cascaded parent `stop()` must not replay the exit on a child that's already done.
  An infinite loop / manual hold / paused scope is _not_ settled and still exits.
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
  crawl is wall-clock-driven and has no representation in `tick()`** — scrubbing
  does not move it (by design; D-028).

### TickerDriver — the crawler treadmill + the content-driven duration (D-028)

One driver per ticker element, instantiated by `createRuntime` per scope. It
virtualizes the item stream: nodes are fed just ahead of the entering edge,
recycled after they exit, positioned absolutely from widths **measured once per
text** (at/after `play()`, which awaits `document.fonts.ready`), and moved by a
single `transform: translateX` per frame. Items are bidi-isolated spans; the
element's `direction` is the **reading** direction (`'rtl'`: RTL layout, track
moves visually left→right — the Persian crawl).

**Self-wired duration:** a scope whose composition contains tickers gets an
internal `durationHook` = max over its drivers' `passRemainingMs()` (the ms
until the current content cycle's seam fully crosses the band). So preview,
the single-file export, and `.vcg` need **no boot wiring**, and a ticker nested
in a child composition drives *its own* scope. An **explicit**
`RuntimeBootOptions.durationHook` still overrides the root scope (test seam).

**Invariants**

- The treadmill rolls **continuously across pass boundaries** (intro/outro
  replays never restart it; `start()` is idempotent); a fresh `play()` resets it.
- `pause()`/`resume()` freeze/continue it in lockstep with the hold timer;
  settling stops it (frozen at the exact boundary).
- `setItems()` (the `update()` path) reconciles by stable id: entered nodes
  keep their position, the unseen fed tail is dropped and re-fed from the new
  list — no visual jump; removed items are never re-fed.
- `RuntimeBootOptions.tickerMeasure` injects width measurement (happy-dom has
  no layout); `RuntimeClock` injects the rAF/now clock.

### animation-applier + keyframe-eval — per-frame writes

`applyAnimationAtFrame` walks an element's `animation.tracks` and writes the
interpolated value for each animatable property at `frame`, batching transform axes
(position/scale/rotation) into single `left`/`top`/`transform` writes and reusing
the element's static transform for any un-tracked axis. Composite properties
(shadow, filter, stroke) **recompose the whole CSS declaration** from static +
animated components so animating one sub-property keeps the others.

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

> Worked example: the **ticker** (D-028) — schema variant `TickerElementSchema`,
> `buildTicker` in `scene-builder.ts`, and a per-element runtime driver
> (`ticker-driver.ts`) wired by `createRuntime`.

1. **Schema** — add the element variant to `@cg/shared-schema`
   (`packages/shared-schema/src/elements.ts`) and the `Element` union.
2. **Render** — add a `case` in `buildElement` (`scene-builder.ts`) and a
   `buildXxx(element, doc)` that sets `dataset['cgElementId']`, calls
   `applyBaseStyles`, and renders the type-specific look. Until it's supported it
   falls through to `buildPlaceholder` (tagged div) automatically.
3. **Runtime behaviour** — if the element is live (time-driven, like the ticker),
   give it a driver owned by `createRuntime`: collect its nodes on the scope
   during build (cf. `scope.tickers`), instantiate per scope, and hook its
   lifecycle into the cascade (play reset / pause / resume / settle / remove).
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
3. If the mode needs computed timing, prefer **self-wiring inside the runtime**
   from scene content (cf. `content-driven`: `createRuntime` derives each scope's
   `durationHook` from its ticker elements, so preview/exports need no boot
   wiring) and keep `RuntimeBootOptions` as the external override/test seam,
   threaded `RuntimeBootOptions` (`types.ts`) → `createRuntime` →
   `PlayoutControllerOptions`.
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
