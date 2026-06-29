# Design — auto-size text rendering (consume `fitMode`)

Context: `fitMode` is authored and stored but never read at render time, so the
Auto/Fixed toggle is a no-op. This pass defines the auto semantics and resolves
the transform/gizmo, align, RTL, back-compat, and export questions before any
code is written. Evidence is cited as `file:line` against `main`.

---

## A. Current state — where is a text node sized today?

**Decision / finding:** the runtime sizes EVERY element (text included) from
`transform.size`; `fitMode` is read NOWHERE in the runtime.

- `buildText` (`packages/template-runtime/src/scene-builder.ts:384`) calls
  `applyBaseStyles(el, element.transform, …)` at `scene-builder.ts:391`.
- `applyBaseStyles` writes the box size from `transform.size`:
  `el.style.width = `${transform.size.w}px`` /
  `el.style.height = `${transform.size.h}px`` (`scene-builder.ts:233-234`).
- A repo-wide grep for `fitMode` in `packages/template-runtime/src/**` returns
  **only** test fixtures and starter-template data — **no runtime read**. Same
  for `autoSqueeze` (stored at `elements.ts:108`, never read). Only `wrap` is
  partially honored: `wrap === false → white-space: nowrap`
  (`scene-builder.ts:434-435`).
- Who writes `fitMode`: the inspector toggle
  `TextStyleSection.tsx:88-92` (`Auto → 'autosize'`, `Fixed → 'fixed'`); the
  default for a new text element is `'fixed'` (`element-defaults.ts:59`).
- Schema: `fitMode: z.enum(['fixed', 'shrink-to-fit', 'autosize'])` —
  **required, no default** (`packages/shared-schema/src/elements.ts:91`). The UI
  only ever sets `fixed` / `autosize`; `'shrink-to-fit'` is schema-accepted but
  never written by the UI and never read by the runtime.

Implication: implementing D-060 = teach `buildText` to branch on `fitMode` and,
for `autosize`, NOT take width/height from `transform.size`.

---

## B. Render mechanism — deterministic across preview / HTML / CEF

**Decision:** use **CSS intrinsic sizing** — `width: max-content; height:
max-content` on the text box (equivalently an `inline-block` that shrink-wraps),
combined with `white-space: pre` to honor `\n` and forbid wrapping. **No JS
measurement** feeds the rendered result.

Why:

- **Frame-deterministic.** Intrinsic sizing is resolved synchronously by layout
  in the same frame the node is built — there is no async `getBoundingClientRect`
  → write-back loop that could land a different size on a later frame (which would
  make the on-air result race-dependent). The on-air pixels are a pure function of
  content + font + style.
- **CEF / `file://` safe.** `max-content` / `fit-content` for sizing is Baseline
  well below the CEF floor (Chromium ~71+; intrinsic `max-content` ships from
  Chromium 46). No `ResizeObserver`, no `fonts.ready` gating of the RENDER, no
  measurement APIs — pure CSS, so it works the same in the preview iframe, the
  inlined single-file HTML opened over `file://`, and old CEF.
- **Identical in all three consumers** because they all run the same
  `scene-builder` (see §G).

Mechanics inside `buildText` when `fitMode === 'autosize'`:

- Do NOT emit the `transform.size` width/height (skip / override
  `applyBaseStyles`' `width`/`height` for this element).
- Set `width: max-content; height: max-content`.
- Set `white-space: pre` (honors `\n`, no wrapping; supersedes the
  `wrap === false → nowrap` line for auto — wrap is irrelevant in a full hug).
- Skip the vertical-align flex wrapper (`scene-builder.ts:437-446`): with a
  height that hugs content there is zero vertical slack, so `justify-content`
  has nothing to distribute. Horizontal `text-align` is still emitted (it aligns
  shorter lines inside a multi-line box — see §D).
- Apply a **minimum box** so empty/whitespace text stays selectable/editable
  (see Risks). Keep padding + `box-sizing: border-box` as today.
- `Fixed` is unchanged: `transform.size` width/height exactly as now.

Rejected alternative: JS-measure the rendered glyphs and write the size back into
`transform.size`. Rejected because it is async (a frame-timing race that can
change the on-air size), it mutates the stored model from the renderer, and it
needs `fonts.ready` gating that the CEF floor + `file://` make fragile.

---

## C. Transform / gizmo interaction on a content-sized box

**Decision:** in Auto, the selection overlay reads the element's **rendered**
box (measured from the preview iframe, converted to scene space) as the gizmo's
`w × h`, instead of `transform.size`; the **resize handles are inert**; move +
rotate stay active; the B-022 scale·rotate-about-anchor composition is unchanged
(only the source of the base `w × h` changes).

- Today the gizmo derives its box from `transform.size * scale`
  (`Gizmo.tsx:284-285`), and resize math reads `t0.size` (`Gizmo.tsx:344-346`).
  For an auto box `transform.size` is no longer authoritative, so the overlay
  must use the rendered content size.
- The overlay lives in the host; the element renders in the `cgpreview` iframe,
  for which the host already maintains a scene↔screen map. The overlay reads the
  selected node's measured box (e.g. `getBoundingClientRect` of
  `[data-cg-element-id]`) and divides by zoom to get scene-space `w × h`. This
  measurement drives DISPLAY only (never written back to the model), so it is not
  on the deterministic-render path of §B.
- **Handles affected:** the 4 corner + 4 edge resize hit areas
  (`Gizmo.tsx:220-253`, `down(h, 'resize')`) become inert — `beginResize`
  (`Gizmo.tsx:154`) is not wired and they render in a disabled (dimmed / hidden)
  style. The body-drag move (handled by `CanvasOverlay`) and the rotate hover
  areas (`down(h, 'rotate')`) stay active.
- **Scale + rotate still composes (B-022):** the renderer composes
  `scale(sx,sy) rotate(deg)` about `anchor` (`transform-origin`)
  (`scene-builder.ts:236-237`); the parallelogram overlay traces the same map.
  Feeding it the measured `w × h` instead of `transform.size` keeps it glued —
  the composition formula is identical; only the base rectangle's size source
  changes. The overlay re-measures when the box changes (text / font.size edit,
  and on `document.fonts.ready`) so it stays glued live.

---

## D. Align interaction (D-045) — disable or hide?

**Decision:** while a text element is Auto, **disable vertical-align** (shown but
inert/dimmed) and **keep horizontal-align enabled**. Do not clear the stored
`align` / `verticalAlign`. Toggling back to Fixed re-enables vertical-align with
its stored value intact.

Justification:

- **Vertical-align is genuinely meaningless in Auto** — the height hugs the
  content exactly, so there is zero vertical slack to distribute → disable it.
- **Horizontal-align is NOT meaningless** for multi-line `\n` content: the box
  width = the widest line (`max-content`), so SHORTER lines have horizontal slack
  within that width and `text-align: start/center/end` still positions them. For
  a single line it is a harmless no-op. So horizontal-align stays enabled.
- **Disabled, not hidden:** hiding the control would jump the inspector layout
  on every toggle and hide a capability the operator regains in Fixed; a dimmed
  disabled control communicates "not applicable while Auto". The store value is
  preserved (we never call `updateElement` to disable), so a Fixed→Auto→Fixed
  round-trip is lossless.
- Implementation: `AlignButtonGroup` (`AlignButtonGroup.tsx:29`) gains an optional
  `disabled` prop (default `false`, so ticker/clock/sequence are unaffected); the
  text element's `VAlignRow` (`StyleSection.tsx:177-195`) passes
  `disabled = fitMode === 'autosize'`.

> **Tension with the prompt (flagged):** the locked-scope instructions recommend
> "disable the align controls while auto." That is correct for VERTICAL align,
> but locked-scope #3 (honor `\n`, multi-line) makes HORIZONTAL align meaningful
> for shorter lines — so blanket-disabling both would remove a useful control.
> This design disables only vertical and keeps horizontal. Owner: confirm.

---

## E. RTL — anchor + growth direction

**Decision:** the anchored corner is the reading-start corner:

- **LTR** (`direction: 'ltr'` or `'auto'`): the box is pinned by its **top-left**
  via the existing `left/top = transform.position`
  (`scene-builder.ts:231-232`); width grows **rightward**, height **downward**.
- **RTL** (`direction: 'rtl'`, Persian default): pin the **top-right** edge. The
  runtime positions the auto box with CSS **`right`** (derived from the anchor x
  relative to the frame width) instead of `left`, so `max-content` growth extends
  **leftward** and the right edge stays put; height still grows downward.

This pins the visual anchor with **pure CSS** (no measured-width offset), so it
is as deterministic as §B. Multi-line `\n` keeps the existing per-element
`direction` and the browser's native bidi; `white-space: pre` preserves the line
breaks and each line lays out in the element's direction.

> **Position-semantics nuance (flagged):** `transform.position.x` is the box's
> LEFT edge today. For RTL Auto it becomes the anchor for the RIGHT edge (the
> runtime converts it to a CSS `right`). For `direction: 'auto'` we pin LEFT
> (deterministic default) and document it. Owner: confirm this is the desired
> RTL anchor; the alternative (always pin left, box grows right even in RTL)
> violates locked-scope #5.

---

## F. Persistence / back-compat

**Findings:** `fitMode` is required (no default) at `elements.ts:91`; new
elements default to `'fixed'` (`element-defaults.ts:59`). BUT **many shipped
starter templates already set `fitMode: 'autosize'`** — e.g.
`breaking-news.ts:127,158`, `logo-bug.ts:136`, `lower-third.ts:144,178`,
`persian-reference.ts:111,145`, `quote-card.ts:117,174`, `scoreboard.ts:152,186`,
`fullscreen.ts:163`, and many in `showcase.ts`. Today they render at
`transform.size` (fitMode unread); after this change they will hug content.

**Decision:** **honor `fitMode` as authored** (the toggle finally works), and
**audit + repair the shipped starter templates** in this change so each
`autosize` text still looks right (switch to `fixed` where it relied on a fixed
box, or accept the hug where it's correct). Do NOT add a silent load-migration
flipping `autosize → fixed` — that would defeat the feature. The schema default
stays `'fixed'`, so new elements are unaffected. User scenes authored with the
Auto toggle will now hug — acceptable because the control was always labeled
"Auto". `'shrink-to-fit'` and `autoSqueeze` stay unimplemented (render as today)
and are out of scope.

> **Owner call (flagged):** if preserving existing USER-scene appearance is more
> important than honoring their Auto setting, the alternative is a one-time
> load migration (`autosize → fixed`, with a version bump) so users opt back in.
> Recommendation: honor + repair templates; surface the migration only if the
> owner prioritizes byte-for-byte appearance continuity over the toggle working.

---

## G. Export parity

**Decision / finding:** parity falls out — no exporter change needed.

- The Designer preview, the `.vcg`-served runtime, and the single-file HTML all
  render through the SAME `scene-builder`, so a `fitMode` branch in `buildText`
  applies to all three.
- The single-file exporter sizes only the **stage** from `scene.resolution`
  (`apps/designer/src/platform/ExporterSingleFile.ts:253-271`) — it emits **no
  per-element width/height**.
- A grep of `packages/vcg-format/src/**` finds **no `transform.size` / per-element
  size** references — the `.vcg` path packages the scene + runtime and snapshots
  no geometry.

So the auto box is identical in preview and both exports. The implementation will
still add an exporter parity test (load the single-file HTML headless, assert the
auto text box hugs) as a guardrail.

---

## Risks / edges

- **Multi-line `\n`:** `width: max-content` + `white-space: pre` ⇒ width = widest
  line, height = sum of line heights; horizontal-align positions shorter lines
  (kept enabled, §D); vertical-align inert (§D).
- **Empty / whitespace-only text:** `max-content` of empty content collapses to a
  near-zero box → ungrabbable and un-editable. Mitigation: enforce a **minimum
  box** (e.g. `min-width`/`min-height` derived from one line at the current
  font/line-height) so an empty auto text stays visible, selectable, and
  double-click-editable. Spec'd as a requirement.
- **Very long single line:** with no auto-wrap (locked scope #3) a long line makes
  the box exceed the frame and overflow the stage. Accepted + documented; the
  operator inserts `\n`. (No clipping — clipping would hide content silently.)
- **Font not loaded at first paint:** the RENDER needs no measurement, so the box
  simply reflows when the webfont swaps in (normal CSS). The GIZMO overlay,
  however, measures the node — so it must re-measure on `document.fonts.ready`
  (the ticker already waits on it) and on text/font/size edits, or the selection
  box lags one font-swap behind.
- **Scale + rotate:** the parallelogram overlay uses the measured `w × h`; B-022
  composition is unchanged. The overlay must re-measure when the content box
  resizes while selected.
- **Keyframed size in Auto:** `animation-applier.ts:55-56` animates
  `style.width/height` from `size` keyframes. In Auto the box is content-driven,
  so size-track writes are ignored for an auto text box (the registry/D-046 guard
  will also block authoring them). Flagged as the explicit coupling point with
  D-046.
- **RTL multi-line:** right-pinned box, per-line bidi via the element `direction`;
  `direction: 'auto'` pins left (documented).
- **Gradient text inner node:** the gradient path uses a `max-width: 100%` inner
  node inside a flex host (`scene-builder.ts:470-481`). In Auto the host hugs
  (`max-content`), so `100%` = the hugged width — consistent; verify the gradient
  inner node still maps to the glyphs and is covered by a test.
