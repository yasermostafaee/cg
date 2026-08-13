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

Almost everything consumers use is re-exported from [`src/index.ts`](./src/index.ts) — the two
deliberate exceptions are the subpaths listed after the table:

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

### 🔴 The two SUBPATH exports, and why they are not on the table above

`src/index.ts` is **esbuild's bundle ENTRY**, so its export list IS the export table of the runtime
bundle inlined into every exported `.vcg`. Adding a name there costs bytes in every artifact on air,
for a symbol no page calls. Two symbols are therefore reachable **only** through subpaths declared
in `package.json`, and are deliberately absent from the entry:

| Subpath                              | Export                               | Consumer                                                                    |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| `@cg/template-runtime/scene-builder` | `SMPTE_BARS`, `smpteBarsGradient()`  | The Runtime's PVW live-plate placeholders (R-049) — ONE bar table, reused.  |
| `@cg/template-runtime/position`      | the pure `position.ts` geometry half | The same overlay's scene-px → raster-px chain — ONE arithmetic, not a copy. |

Two rules govern adding to either, both learned by measurement rather than argued:

1. **Prefer a subpath to the entry index for anything the PAGE does not call.** Measured:
   re-exporting these two from `src/index.ts` grows the IIFE export table by **121 bytes in every
   `.vcg`**; through a subpath the generated bundle is byte-identical.
2. **`@cg/template-runtime/position` exists because the entry cannot be imported by an app that owns
   `window.cg`.** The index reaches `adapters/caspar-globals.ts`, whose `declare global` claims
   `window.cg` for the SERVED PAGE's runtime. The Runtime app's `window.cg` is the bridge; importing
   the index there merges the two declarations into one compilation and breaks typecheck across the
   app. Two things legitimately own that name, and they must never share a program.

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
 ├─ LottieDriver (lottie-driver.ts)       one per lottie element: drives a
 │      lottie_light player frame-by-frame off the SAME clock (intro / hold /
 │      outro); owns the element-outro seam (playOutro) — D-125
 ├─ RepeaterDriver (repeater-driver.ts)   one per repeater element: stamps a
 │      ROW SUBTREE per data item through wireScopeSubtree (count at play,
 │      values live); not a content source
 ├─ LifecycleStateMachine (lifecycle.ts)  pending→playing→on-air→exiting→stopped
 │      plus exiting→playing: a play() SUPERSEDES an in-flight exit (the exit can
 │      last the whole background OUT segment). stop()/out() are guarded on
 │      on-air/playing, so a machine left behind the stage kills BOTH, silently
 ├─ EventBus (event-bus.ts)               play.start / stop.end / ready / …
 └─ installCasparGlobals (adapters/caspar-globals.ts)   window.* → runtime
transforms.ts · css.ts   value formatters · baseline stylesheet
```

### scene-builder — `Scene` → DOM + the scope tree

`buildScene` walks layers (sorted by `zIndex`) and creates one node per element
(`text` / `ticker` / `clock` / `sequence` / `image` / `shape` / `lottie` rendered;
`container` / `video-placeholder` emit a tagged placeholder div so layout and ids
survive). It returns a **`scopeTree`** (a `FieldScope`): each composition instance
owns its **own** `elementMap`, `textOriginals`, container, `animated` list,
`tickers` + `clocks` + `sequences` + `lotties` lists, and lifecycle `source`.

**The editor backdrop never reaches output (B-129).** `Scene.editorBackdrop` and
`Composition.editorBackdrop` are an **authoring affordance** — a viewing aid that makes
content legible while editing — and `buildScene` paints them **only when
`mode === 'author'`**. In `'output'` (the DEFAULT, so a caller that forgets is safe) the
stage and every composition inner are transparent, and an authored background is a real
full-frame element like anything else that paints.

The field used to be called `background` and painted in every mode, so an editing
preference reached air as a full-frame card over live video — a lower-third going out as
a fullscreen graphic. **Three builders apply the composition backdrop**
(`buildComposition`, `buildSequenceCompositionItem`, `buildRepeaterRows`); all three are
mode-gated, because one unguarded site is a leak that only shows on hardware. A legacy
`background` key is normalized onto `editorBackdrop` at parse time by
`@cg/shared-schema`, and both exporters emit it as `'transparent'` via the ONE shared
`withoutEditorBackdrop` helper — defence in depth behind the mode check, never a second
guard.

**…and it paints on the editing CANVAS only (B-134).** `mode === 'author'` covers TWO
surfaces — the canvas and the Designer's Preview modal — and they disagree about the
backdrop. The modal is `'author'` deliberately, because it cannot show real live video
either, so a Live Source must still paint its SMPTE bars there (D-137 §9); but it is a
preview of AIR, so it must not paint a backdrop air will never show. One flag was
carrying two questions.

So there is a **second boot option, `paintEditorBackdrop`** (`RuntimeBootOptions`),
threaded onto `BuildCtx` for the same reason `mode` is: a nested composition inherits it
by construction, so a composition three levels down cannot paint a backdrop the surface
above it suppressed. It defaults to `true`, which is a no-op in `'output'` (the backdrop
is never painted there anyway) and preserves every existing `'author'` caller. Only
`preview.ts` passes `false`, and only for the broadcast (modal) document.

🔴 **Do not "simplify" this into a third `RenderMode` value.** The modal needs `'author'`
and "no backdrop" **simultaneously**; no single enum value can express that, which is
exactly why the axis is separate.

**Auto-size text (D-060).** A `text` element with `fitMode: 'autosize'` hugs its
content in BOTH dimensions via CSS intrinsic sizing — `buildText` skips the
`transform.size` width/height (`applyBaseStyles(..., skipSize)`) and sets
`width/height: max-content` + `white-space: pre` (so explicit `\n` make lines and
nothing width-wraps), a minimum box (≥ one line) so empty text stays selectable,
and skips the vertical-align flex wrapper (no vertical slack). The anchor is the
reading-start corner: LTR keeps the top-left (`left`); RTL pins the top-right via
CSS `right = resolutionWidth − position.x` (so growth extends leftward). It is
synchronous + CEF/`file://`-safe (no JS measurement) and identical in preview /
`.vcg` / single-file HTML. Size keyframes are ignored for an auto text box
(`animation-applier` skips the `size.w`/`size.h` write); `fixed` is unchanged.

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
stable item id). `lottie-override` (D-125 Phase 3c) routes the same way through its
own registry, `lottie-registry.ts` (container → `LottiePlayerHandle` WeakMap,
`isAlive`-gated, registered at mount in `createRuntime`): `prop: 'text'` replaces a
named text layer's document text — with the text transform + `maxLength` cap, exactly
like the `text` target — and `prop: 'fill' | 'stroke'` recolours a named layer's
static paints (colours skip the text-transform pipeline). The override surface and
its opacity boundary live in `@cg/lottie-bridge`'s `applyOverride`.

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
resolves — the scope's CONTENT SOURCES that DRIVE the hold complete: its
tickers, its countdown clocks, AND its sequences whose `drivesHold !== false`
(D-107 — every content element drives the hold by default; one marked
`drivesHold: false` is excluded and never gates the hold even when
infinite/looping, though it still starts/renders). An infinite SELECTED ticker
or sequence ⇒ until `stop()`; wall/countup clocks are NOT content sources and
never extend the hold; no hold-driving sources — none, or all excluded ⇒ a
zero-length hold, deferred like a 0ms timer.
There is **no** `content-driven` mode — a stored legacy
`mode: 'content-driven'` normalizes to `loop-cycle` +
`holdSource: 'content-driven'` (`@cg/shared-schema`'s `PlayoutSchema`
preprocess / `playoutOf`).

There is **no separate continuous-loop mode** — a looping logo is `loop-cycle` with
`repeat: 'infinite'` (and `holdMs: 0` to loop the whole timeline).

`onContentStart` (optional) fires once per cycle the moment the **entrance animation
completes** — the `holdEntryFrame`. The runtime sets that frame to the composition's
EXPLICIT content-start marker (`lifecycle.contentStart` — placed + dragged on the
designer timeline, the deterministic source of truth) when present, else the
`entranceSettleFrame(...)` heuristic: the start of the trailing _static_ region before
`outPoint` (and `outPoint` itself when the entrance animates right up to it, or there is
no animation). The intro is **split** at
it: the controller plays `[active.in → holdEntryFrame]`, STARTS the content, then plays
the static settle `[holdEntryFrame → outPoint]` — so the playhead still reaches and holds
at `outPoint` (a start-trimmed element still appears; the held frame and the outro are
unchanged) before the hold timing begins. The runtime RESETS + STARTS the scope's ticker
treadmills, clocks, AND sequences there, **plus** — because the hold entry is the moment
the parent's intro completes — its non-coordinator nested descendants' content
(`startContentTree`, D-104). So a graphic that enters quickly then holds runs its content
through the **whole** hold (not just the instant before the outro), each open/close cycle
replays the crawl from its entering edge / re-runs the count / restarts the rotation from
item 1 (a fresh run per cycle), and a `content-driven` wait (taken at `outPoint`) always
awaits the run it already started.

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
- **D-135 — `tick(frame)` also POSITIONS every Lottie** (`LottieDriver.positionAt`), so the
  canvas shows the clip frame under the playhead instead of its static poster. Three things
  about that contract are load-bearing:
  - **The composition→clip ANCHOR lives here; the phase MAPPING lives in the driver.**
    `tick` converts the playhead to elapsed TIME — from the composition's `activeRange.in`
    for the IN/HOLD phases, and from `lifecycle.outPoint` for the OUT phase — and the driver
    resolves that to a clip frame through the same `clipPositionAt` its own clock uses. The
    clip is never RESCALED onto the composition's markers (§D1.1): it plays at its authored
    `fr × speed` and the anchor only says where it starts.
  - **Scrub and PLAY are the same call.** The Designer canvas has no `play()` path at all —
    its transport advances the store's frame and the canvas posts one `scrub` per change —
    so both halves of D-135's acceptance are this one function. A second path for play would
    be a fork, and the tests assert the singularity (`tests/lottie-driver.test.ts`), not just
    matching frames.
  - **A driver running its own lifecycle OWNS the frame.** `positionAt` is a no-op while the
    driver is running or holding a frame it drove to, so a tick reaching a PLAYING host (the
    same page serves the Preview) can never yank a clip out from under its own driver.
  - 🔴 **A DEGENERATE outro takes the INTRO mapping past the out-point.** `outroStart` falls back to
    `op` for a clip with no outro marker, so asking for the OUT phase there clamps to `op` — the
    frame a furniture clip has animated OFF to — and the element vanishes from the out-point onward.
    A clip with no outro of its own holds its settled frame instead, which is what the runtime does
    on air (a degenerate `playOutro()` resolves immediately; the composition's exit animates the
    element off). The guard is in `positionAt`, never in `clipPositionAt`: it selects WHICH mapping
    applies, exactly like the intro/outro selection itself. `hasOutro` is a driver option, computed
    once by the runtime — not re-derived from `outroStart >= op` at each site that needs it.
  - 🔴 **The composition's IN-POINT is not a special case**
  - **`drivesHold` is NOT read on this path** (design §9.4): it answers "does this element
    gate the HOLD", which is a different question from "does the canvas show its frame".
    Furniture that deliberately does not drive the hold still follows the playhead.
  - **A `<video>` follows the playhead the same way** (§9.5 answered (a), 2026-08-13:
    position everywhere; the forward-1× hybrid was REJECTED — ONE mechanism for scrub,
    forward, backward and bounce). `tick` hands the SAME elapsed pair to
    `VideoDriver.positionAt`, which resolves the clip time through `expectedClipMs` — the
    same function the driver's own clock reconciles against on air — and seeks a PAUSED
    element (never `play()`). Three video-specific points:
    - **Skip, never queue.** A tick that finds `seeking()` true issues nothing — the
      canvas shows the NEAREST DECODABLE frame. That is the measured, specified contract
      (~10 distinct fps on a 1080p VP8+alpha element; the Preview stays the frame-true
      rendition), not a defect.
    - **Every node access resolves through `live()`** (the handle's B-137 re-resolution):
      the canvas reparents `<video>` nodes across `scene-replace`, and a captured
      reference would command an orphan.
    - **The at-rest poster is a PRE-TICK TRANSIENT now** (matching the Lottie): the host's
      poster routine is kept as the LOAD path + seek-fragile recovery, but it chains a
      re-tick on settle, so the tick's seek always lands last and the canvas rests at the
      playhead's frame — including a build-on clip's transparent frame 0.
    - A FOLLOW-source clip (`media-phases-follow-composition`) composes for free: the
      derived window (`introStartMs`/`holdMs`/`outroEndMs`) is already inside
      `expectedClipMs`, so the playhead shows the parked-at-`H` look the driver plays.
- **Per-element lifespan visibility** (a `lifespan {in,out}` from a timeline start/end
  trim) is gated **per scope**. Each `FieldScope` owns a `lifespanGates` list, registered at
  BUILD time in `buildLayer` beside `scope.animated`, and that scope's controller evaluates
  its own gates in its own `applyFrame` — so a start-trimmed element (`lifespan.in > 0`)
  appears at/after its in-point and plays, and is **not** dropped just because it is absent
  at the open-time scrub frame (B-029). A child's trim lives in **its own scope's frame
  space**, not the root's: the Designer clamps a trim to the frame range of the composition
  being edited, which is the timeline that scope's controller runs (B-089). The gate is
  **kind-agnostic** — any element carrying a `lifespan` is gated, plain text and shapes
  included (unlike the separate content-host gate, which is ticker/clock/sequence-only).
  The gate restores each node to the `display` its builder settled on, captured at build
  time; `refreshLifespanGateDisplays` then re-reads it for the scopes the D-025 namespace
  tree can reach, so a boot-time `visibility` binding (which writes `style.display`) still
  wins. The build-time capture is the source of truth precisely because **stamped** scopes —
  a repeater row, a sequence composition item — are deliberately absent from
  `scope.children` and no walk of the namespace tree can see them.
- `tick(frame)` (the scrubber) gates the whole tree at one shared frame by walking the LIVE
  **wiring** tree (`subtrees`) plus each subtree's `scope.children`. That is the only
  membership stamped scopes join — a repeater re-stamps fresh row scopes at each play and on
  `setItems` — so a boot-time union would leave scrub ungating exactly the rows playback
  gates, and the canvas would disagree with air.
- **A gate boundary forces a real frame sweep (B-088).** Because the gate above is
  frame-dependent, `hasAnimation` alone is no longer a sound answer to "may this leg be
  collapsed to one paint?" — a scene with no keyframes but a start-trimmed element must
  still be swept, or the gate is evaluated exactly once and the element is either never
  shown or shown from the first paint. `PlayoutController.playRange` therefore sweeps when
  `hasAnimation || needsFrameSweep(inF, outF)`, where the runtime's predicate is true only
  when a gate's transition (ON at `lifespan.in`, OFF at `lifespan.out + 1`) lands inside
  `(inF, outF]`. A leg crossing no boundary still collapses, so the rAF optimisation for
  genuinely static scenes is preserved. It sits on `playRange`, so it covers **every** leg —
  both intro legs and the outro. **Every** scope supplies the predicate over its OWN gates
  (B-089 — B-088 originally wired it for the root only, when gates existed only there); a
  scope with no trims passes `undefined` and keeps the collapse untouched.

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
`waitForContent` = `Promise.all` over the HOLD-DRIVING drivers' `whenComplete()`
— `wireScope` collects `holdTickers` / `holdCountdowns` / `holdSequences`
(`drivesHold !== false`; D-107) as it builds each driver, while
`startOwnContent` / `stopScopeContent` still start/stop EVERY content element. A
`content-driven` hold ends when ALL the scope's selected finite tickers,
countdown clocks, AND finite sequences complete; an infinite SELECTED ticker or
sequence never resolves, holding the scope until `stop()`; wall/countup clocks
are excluded by construction (and an element with `drivesHold: false` is
excluded by choice). So preview, the single-file export, and
`.vcg` need **no boot wiring**, and a content source nested in a child
composition governs _its own_ scope. An **explicit**
`RuntimeBootOptions.contentHold` still overrides the root scope (external
override/test seam).

**D-112 — per-instance hold overrides.** A content-driven PARENT aggregates a
NON-coordinator nested child's content per-element via `nestedContentWait`
(which replaced `contentTreeWait`). Each `ScopeNode` also exposes
`contentDrivers` — every hold-eligible OWN driver (ticker / countdown clock /
sequence) UNFILTERED by `drivesHold` — so the parent can re-filter them by a
per-INSTANCE `holdOverrides: Record<elementId, boolean>` carried on the
composition-instance element (threaded `FieldScopeChild.holdOverrides` → the
child `ScopeNode.holdOverrides`, set right after `wireScope`). The effective
"drives THIS parent's hold" = `holdOverrides[id]` when that key is defined, else
the element's own `drivesHold !== false`. The override affects ONLY the parent's
aggregation: the child's OWN hold still uses `ownContentWait` (its own
`drivesHold`), content still starts/runs, and a COORDINATOR child still
self-settles (the parent awaits its `whenSettled`, so an override on that child's
internal content is moot). Overrides cascade **per level** — each instance
overrides only its referenced composition's OWN direct content; a deeper instance
carries its own `holdOverrides`, applied at its level.

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
- D-104 follow-up — EVERY clock (absolute `wall`/`datetime countdown` AND relative
  count) is HELD through the entrance and starts at the scope's content-start frame
  (the hold entry — the content-start marker or its `entranceSettleFrame` heuristic),
  uniformly with the ticker crawl and the sequence rotation. `play()` only `reset()`s
  the clocks (they display their initial value through the intro); `startOwnContent`
  resets + starts them at `onContentStart`.
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

### VideoDriver — the self-advancing medium + the seek policy (D-128 Phase 4)

A `video` element is the INVERSE of a Lottie: the `<video>` advances on its own
media clock, so `VideoDriver` does not paint frames — it keeps the element in
lockstep with the injected `RuntimeClock` through a `VideoHandle`
(`play`/`pause`/`seek`/`currentTime`/`seeking`/`dead`/`recover`), built in
`runtime.ts` around the scene-builder's registered `<video>`. Phase mapping:
intro `[introStartMs → introEndMs]` (`introStartMs` defaults to 0), hold loops
`[loopStart, loopEnd]` or freezes at `introEndMs`, outro
`[outroStartMs → outroEndMs]` (`outroEndMs` defaults to `durationMs`) through the
same element-outro seam as a Lottie. The window bounds serve the FOLLOW phase
source exactly as the Lottie's (see above) — video consumes `followWindowMs`
directly (ms-native, no unit adapter), and under follow an ABSENT idle range
resolves the hold to a FREEZE at `H` even for `holdBehavior: 'loop'` (looping the
whole clip would abandon the held look follow promises to keep; the stored value
is untouched).

**THE SEEK POLICY (2026-07-25 — the fragile-alpha-seek root cause):** on
VP8+alpha WebM whose alpha side-stream keyframes misalign with the main
stream's (assets converted before revision `2026-07-25.5`), a seek can be a
TERMINAL `media.error` on a perfectly playable file. The driver therefore (a)
NEVER seeks on `resume()` — the media froze where it froze, so the clock
re-anchors to the media and just plays (the large-gap principle); (b) keeps
only the NECESSARY seeks (loop wrap, outro entry, bounded drift correction,
the always-safe `t=0` on reset/start); and (c) treats `handle.dead()` as
recoverable everywhere: every tick and every lifecycle entry (`reset` /
`resume` / `stop` / `playOutro`) rebuilds the dead element via
`handle.recover()` — a fresh node, same attributes/src/position, rate-limited
on the tick path — so a terminal decode error degrades to a sub-second hiccup
instead of a permanent freeze. Recovery fires ONLY on `media.error`; a
transform change never sets it, so the Designer-preview no-remount-on-drag
guarantee is untouched.

**THE NODE-BINDING CONTRACT (B-137) — the handle follows the node a viewer can
SEE, not the node the scene was built with.** A host is ALLOWED to reparent a
media element across a rebuild: the Designer preview pools the live `<video>`
and transplants it back over the freshly built one, so a transform-only edit
never re-fetches the media. The engine therefore does not treat the node it
captured at build time as final. Every `VideoHandle` member reads through a
`live()` resolver which, when the captured node reports
`isConnected === false`, re-queries the owning document for
`video[data-cg-element-id="<element id>"]` and re-points to what it finds.

Three properties are load-bearing, and all three are pinned by
`tests/video-node-rebind.test.ts`:

- **HOST-AGNOSTIC.** The rule keys off `isConnected` + `data-cg-element-id` and
  nothing else, so any harness that reparents nodes is covered without the
  engine knowing it exists. A host does NOT notify the driver of a swap, and is
  not expected to.
- **Only a DISCONNECTED node is re-resolved.** A node merely moved WITHIN the
  document stays connected and is never re-resolved, so the normal path costs
  one boolean read and a host that reorders its tree gets no surprise rebinding.
- **`recover()` rebuilds the VISIBLE node.** It starts from `live()`, so a
  terminal decode error replaces what is on screen rather than an orphan.

Without this the newly built driver commanded a DETACHED element — which, with a
valid `src`, plays quite happily and reports success — while the node on screen
was the one the OUTGOING driver paused during teardown. Nothing ever played it
again: a frozen picture with a healthy driver behind it. A rejected `play()` is
now also reported ONCE per element (latched — the path can be re-entered every
tick), because swallowing it is what made that failure invisible.

### LottieDriver + the element-outro seam (D-125)

A `lottie` element mounts a `lottie_light` player (`@cg/lottie-bridge`,
`autoplay: false`) into the container the scene-builder registered on
`scope.lotties`, and `LottieDriver` drives it with `goToAndStop(frame)` — the
frame computed from **elapsed active time × `fr` × `speed`** off the SAME injected
`RuntimeClock` as every other driver. It is a RENDERER, never an autonomous
player: no second wall-clock means no drift, pause/resume freeze in lockstep, and
the whole lifecycle is deterministic under a fake clock.

The composition lifecycle maps onto the animation's own frame space **by phase**
(never rescaled onto `outPoint`): `play()` → `reset()`+`start()` drives
`[introStart → introEnd]` once (`introStart` defaults to `ip`); the HOLD
**freezes** at `introEnd` or **loops** `[idleIn, idleOut]` per `holdBehavior`;
`out()`/`stop()` → `playOutro()` drives `[outroStart → outroEnd]` once
(`outroEnd` defaults to `op`).

**The window bounds (`introStart` / `outroEnd`) exist for the FOLLOW phase source**
(`media-phases-follow-composition`): a `phases.source: 'composition'` element derives
its window from the composition's lifecycle anchors — intro `[H − entranceSpan → H]`,
hold at `H` (`holdAt`, else the entrance span), outro `[H → min(H + outSpan, clipEnd)]`
— through ONE derivation: `followWindowMs` (`@cg/shared-schema`, ms — video's native
unit) + the `lottieFollowWindow` frames↔ms adapter (`@cg/lottie-bridge`). `runtime.ts`
resolves it at driver construction (the settle aggregation is a PRE-PASS so the
effective content start exists there), a follower contributes `settleOffset: null`
(it derives FROM that value, so it must not vote on it), and NOTHING bakes the derived
numbers — every surface re-derives from the stored relationship.

**The element-outro seam** is the one structural change to the D-105 split exit.
`out()` / `stop()` collect every outro-owning driver (`collectElementOutros()`)
and await `Promise.all` of their `playOutro()` **before**
`playBackgroundOutroAndSettle()` — so the background never closes over an element
that has not played out (content-first / background-last, extended from "fade the
content" to "let the element animate ITSELF off"). A Lottie owning an outro is
marked `data-cg-outro` and is excluded from the blanket `fadeContentOut` /
`hideContentNow`, so an opacity transition never fights `goToAndStop`.

Two signals are kept deliberately separate:

- **`whenComplete()`** — the content-driven HOLD contribution, and only when the
  element opts in with **`drivesHold === true`**. This is read as `=== true`, never
  `!== false`: the **inverse** default of ticker / clock / sequence (where absent ⇒
  participates). A freeze Lottie completes at `introEnd`; an idle-loop Lottie never
  completes (it holds until `stop()`, like an infinite ticker).
- **`playOutro()`** — the exit seam, on every `out()`/`stop()` regardless of
  `drivesHold`.

**Invariants.** `playOutro()` ALWAYS resolves — a degenerate/absent outro
(`hasOutro: false`) resolves immediately, the final paint is clamped to the
window end (`outroEnd`, default `op`), and
`reset()` / `stop()` / `destroy()` settle a still-pending outro — so a superseding
`play()`, a second `out()`, or a hard kill can never strand the exit. `reset()`
also re-mints `whenComplete()` (B-033), so a replay's hold waits again.
`remove()` stays a SYNCHRONOUS hard kill that awaits no outro (the panic path).

**B-034 hidden gate.** A `visible: false` Lottie is excluded where the collections
are BUILT (no parent `holdOverrides` can resurrect it), and `collectElementOutros()`
skips a hidden instance's whole subtree — so a Lottie under a hidden ANCESTOR is
inert too, never stalling an exit for something nobody can see.

**Boundary.** The seam lives in `out()` / `stop()`. A composition that ends its OWN
content-driven / `auto-out` hold exits through `PlayoutController.startOutro()`,
which does not route through the seam — the Lottie stays parked on its hold frame
while the background closes (pinned by a characterization test; owner decision
tracked as task 7.6).

### wireScopeSubtree + RepeaterDriver — dynamic scope wiring (D-030)

`createRuntime` wires every scope subtree through ONE factory:
`wireScopeSubtree(scope, path, isRootSubtree) → WiredSubtree { node,
tickers, clocks, sequences, repeaters, lotties, destroy }` — driver instantiation +
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
`#RRGGBB(AA)` colours lerp componentwise; D-110 **path snapshots**
(`{ kind: 'path', points }` on the `path` property) lerp **per anchor by stable
id** via the schema's shared `lerpPathSnapshot` — leading keyframe's order, an
absent handle tweens from the zero vector. The Designer structure-locks a path's
anchor set across its keyframes (structural edits propagate), so authored scenes
always interpolate over matching ids; mismatched sets (hand-edited/legacy
external input only) hit the DEFENSIVE fallback — a leading-only id holds, a
trailing-only id appears at its keyframe, never a crash. The applier's `path`
branch feeds the interpolated point set into the SAME `pathD` builder the static
render uses (closed/fill semantics hold); the viewBox stays the STATIC geometry's
box — snapshots live in that fixed local space and the path SVG is
`overflow: visible`, so a morph outgrowing the static bounds still renders and
`size.w/h` keyframes keep their stretch semantics.

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

> The **path** (D-109) is the SVG-rendered example: `buildPath` builds
> `<div><svg viewBox=pathBBox preserveAspectRatio=none><path d></svg></div>` — the
> wrapper carries `applyBaseStyles` (transform/opacity/filter) and the inner `<path>`
> the outline. `pathD(points, closed)` builds the `d` (`M`, cubic `C` from each
> anchor's `out` to the next anchor's `in`, `L` for a handle-less segment, `Z` when
> closed); a CLOSED path fills + strokes, an OPEN one strokes only (`fill: none`).
> The viewBox = the points' bbox, so a gizmo resize (which changes `transform.size`)
> rescales the outline without re-baking points. `animation-applier` writes fill /
> stroke onto the inner `<path>` (a `querySelector('path')` branch); per-point
> morphing is **D-110**, not here.

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
3. `keyframe-eval` already interpolates numbers, hex colours, and D-110 path
   snapshots — extend `lerpValue` only for a genuinely new value type, and put
   the lerp itself in `@cg/shared-schema` (like `lerpPathSnapshot`) so the
   Designer's display-time mirror shares the one implementation.

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
