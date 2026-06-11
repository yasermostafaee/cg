# Design — add-sequence-element

## D1. Schema: one element, a decomposed transition, per-item dwell

`SequenceItemSchema = { id: z.string().min(1), text: z.string(),
dwellMs?: positive int }` — the element stores only what it renders (the
open extensible item shape stays on the `list` FIELD, cf. the ticker).
`SequenceElementSchema = ElementBaseSchema.extend({ type: 'sequence',
font/color/colorFill?/textShadow?/backgroundColor?/backgroundFill?/
cornerRadius?/padding? (the ticker/clock subset),
align: 'start'|'center'|'end' default 'start',
direction: 'ltr'|'rtl', items: SequenceItem[],
defaultDwellMs: positive int default 5000,
advance: 'auto'|'manual' default 'auto',
transitionIn: 'top'|'bottom'|'left'|'right'|'none' default 'bottom',
transitionOut: same default 'top',
transitionTiming: 'simultaneous'|'sequential' default 'simultaneous',
transitionMs: positive int default 400,
repeat: int ≥ 1 | 'infinite' default 'infinite' })`. Additive — no
migrations. The defaults spell the "Push up" preset, the classic now/next
move. The stale `ListItemSchema` comment in `fields.ts` (which cited
hypothetical sequence fields) is corrected to the real ones
(`text`/`dwellMs`).

## D2. The transition is a DECOMPOSITION, not a style list

Authorable axes: an IN edge, an OUT edge (each
`top|bottom|left|right|none`), a timing (`simultaneous` push vs
`sequential` out-then-in), and one `transitionMs` per motion (sequential
total = 2×). Named presets are just VALUES over those fields — Push ×4
(simultaneous, opposite edges), Slide ×4 (sequential, same edge), Hide-show
(`none`/`none`) — and any other combination is simply Custom. This is the
extensible seam: a future `fade`/`crossfade` is new enum member(s) + a
mapper case, no schema break.

## D3. Motion mapper: pure, transforms-only, shared easing

A pure module maps an edge to an offscreen offset vector sized to the
clipped box (`top` = −Y by the box height, `bottom` = +Y, `left` = −X by
the width, `right` = +X; `none` = no motion — that side is an instant
cut). Composition per timing: `simultaneous` runs the OUT motion (current
position → OUT edge) and the IN motion (IN edge → current position)
together; `sequential` completes the exit before the entry begins. Each
motion is eased with the SHARED easing already in `@cg/shared-schema`
(`cubicBezierEase` + the `ease-in-out` preset) — no hand-rolled curve.
Everything is `transform: translate` (plus visibility flips for `none`
sides) inside `overflow: hidden` — no layout thrash, CEF-floor-safe.
Edges are PHYSICAL: `direction: 'rtl'` affects per-item bidi rendering
only, never mirrors the motion (the Persian-natural horizontal move is
authored as the …-right presets, matching the crawl convention).

## D4. Driver: the established surface + next()/setItems()

`SequenceDriver` mirrors Ticker/ClockDriver — options `{ host, direction,
items, defaultDwellMs, advance, transitionIn, transitionOut,
transitionTiming, transitionMs, repeat, clock? }`; methods
`start/pause/resume/stop/reset/destroy/whenComplete` + `next()` +
`setItems()`; rAF loop on the normalized clock.

- A run starts at item 1. Dwell is accumulated ACTIVE time; `pause()`
  freezes the dwell AND an in-flight transition mid-motion; `resume()`
  continues both with no jump.
- `'auto'`: the dwell timer advances; `next()` ALSO advances and restarts
  the new item's dwell. `'manual'`: no timers; only `next()` advances.
- Advancing past the last item of pass N — by timer OR `next()` —
  completes the run exactly once: the LAST item stays on screen and
  `whenComplete()` resolves. `reset()` mints a fresh promise (the
  ticker/clock pattern); `'infinite'` wraps to item 1 forever.
- `setItems()` reconciles by stable id: the CURRENT item is never yanked
  mid-display (its text edit corrects in place; its removal takes effect
  at the next advance); order and per-item `dwellMs` come from the new
  list. `next()` before `start()` is ignored (no queueing in v1).

## D5. Wiring: three content-source kinds + runtime.next() for real

Parallel to tickers/clocks in `runtime.ts`: drivers per scope from
`scope.sequences`; the content wait = `Promise.all` over [finite tickers,
countdown clocks, FINITE sequences] (`repeat: 'infinite'` sequences are
excluded by construction — they never resolve); hold entry resets +
starts the scope's sequences alongside tickers/clocks (a fresh run from
item 1 per open/close cycle); full
pause/resume/stop/settle/remove/destroy cascade; `tick(frame)` untouched.

`runtime.next()` stops being a stub: it cascades scopes parent-first,
calling each scope's sequence drivers' `next()`, resolves immediately,
and is a safe no-op when no sequences exist (the optional
`TemplateRuntime.next?` contract stays satisfied — `caspar-globals`
already routes `CG NEXT` to it). This per-scope dispatch is deliberately
the seam D-031's authored steps model will join (documented in code);
D-031's PRD Notes are updated accordingly in this change.

## D6. Bindings + data key: the ticker flow, third verse

New `BindingTargetSchema` variant `sequence-items { elementId }` — a
structured value that bypasses `stringifyValue`/`applyTransform`; its
`applyOne` case routes to the driver's `setItems` via a
`registerSequenceDriver` host→driver WeakMap (the ticker registry
pattern). A sequence element's Data key seeds a `list` field from the
authored items and binds it `sequence-items` (mirroring
`setElementDataKey`'s ticker branch, with the same one-key-one-owner
rules); the inspector items editor and the bound list field stay in
lockstep via the store (the `setTickerItems` pattern).

## D7. Designer: presets over fields, dwell column, preview Next

`SequenceSections` modeled on Ticker/ClockSections: a pinned "Sequence"
CollapseSection — the transition PRESET select first (Push up/down/left/
right, Slide up/down/left/right, Hide-show; selecting writes the three
fields; a combination matching no preset DISPLAYS Custom — the
EasingEditor Preset pattern, selecting Custom itself is a no-op), then the
decomposed In / Out / Timing selects and Transition ms, Advance, Default
dwell edited in SECONDS ↔ stored ms, Repeat (infinite | N passes),
Direction, and the items editor — plus the time-driven note and the
clock-style text parity section (shared primitives, NOT a
`TextStyleSection` refactor — the settled ticker/clock trade-off).
`ListItemsEditor` gains a prop-gated optional per-item dwell input
(`showDwell`), enabled for sequence contexts in BOTH the inspector and
the preview field form (the bind resolver knows the target kind); the
editor keeps preserving unknown item fields. `PreviewTransport.tsx` gains
a **Next** Button wired through `PreviewModal` on the same path as
play/stop/pause, invoking the preview runtime's `next()`.

## D8. Export/GDD: asserted no-op

No generator changes: the `list` field is already a typed GDD array
(D-028) and lists stay JSON-only (the existing
`gdd-list-field-limited-clients` preflight covers it). Asserted by test:
a sequence scene's single-file export boots clean, `next()` pages it, and
the GDD matches the D-028 list representation.

## D9. Out of scope (v1)

- **Rich per-item layout** — items are text-only; structured row layouts
  belong to the repeater (D-030).
- **Per-item transition overrides** (one transition per element).
- **Fade/crossfade edge values** (the decomposition is the seam; the enum
  grows later).
- **The steps model** (D-031 — plugs into the same `next()` dispatch).
- **`next()` queueing during the intro** (a pre-run `next()` is ignored,
  not buffered).
