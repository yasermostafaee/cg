# Session AC — 2026-08-14 — Live Source §1.5e + §1.5g, and the 1.5b measurement kit

Branch `dev`. Change: `openspec/changes/live-source-multibox` (D-137 / C-015).

**One-line summary.** The plate gained a frame (1.5e, three of four parts — the box stays UNTICKED),
the frame-is-not-geometry contract is pinned (1.5g, done), and the CEF measurement kit for 1.5b is
built and ready to carry to the plant. **The rest of §1.5 remains blocked on hardware the owner
does not have this week, and nothing here unblocks it.**

---

## 🔴 Read this first — a design premise did not survive re-verification

`design.md` §9a.1 justified the frame like this:

> Box kinds render a stroke as a CSS `border`, and there is **no `box-sizing` reset anywhere in
> `@cg/template-runtime`** — so the CSS default `content-box` applies and the border is painted
> **OUTSIDE** the declared `width`/`height`.

**It is true of the package and false of every surface the page renders on. Two independent reasons,
either one of which alone puts the frame INSIDE the hole:**

1. **No surface runs the CSS default.** `@cg/single-file-export`'s `cgCss` — the same bytes in every
   `.vcg`, in the single-file export and in the Preview iframe — opens with
   `*{box-sizing:border-box}`, and `@cg/ui`'s `theme.css` resets the Designer canvas identically.
   Under `border-box`, a 6px frame on a 640×360 plate leaves a **628×348** hole: the live picture
   cropped 12px on each axis, silently.
2. **Declaring `content-box` fixes the SIZE and breaks the POSITION.** `left`/`top` place the BORDER
   edge, so the hole slides right and down by the stroke width. **Measured in Chromium** with an 8px
   stroke: the hole moved from (5828, 3662) to (5836, 3670) while the export's declaration still
   named the old rect. A negative-margin compensation is not a fix either — under `transform: scale`
   with `transform-origin: 0 0` the required offset is `-scale × width`, so the correction would
   have to track a value `collectLiveSources` composes separately. Two spellings of one geometry.

**Resolution: the frame is a CSS `outline`, not a `border`.** An outline paints outside the box and
occupies **no layout**, so the plate's box is exactly `transform` under any box model and any scale.
The stroke SHORTHAND is still one shared implementation (`strokeShorthand` in `scene-builder.ts`,
fed to `border` by `applyBoxStyle` and to `outline` by `buildLiveSource`) — the property differs by
necessity, the stroke grammar does not.

`design.md` §9a.1 now carries this correction inline, under a dated heading, with the superseded
paragraph quoted so the next reader sees what changed rather than a silently different claim.

⚠ **The `border-box` reset is NOT a bug and must not be "fixed" globally.** Shapes and text have
been authored against it since D-042 — their strokes paint inside their boxes and existing templates
are drawn to that. Only the Live Source opts out, because it is the one kind whose declared rect is
a contract with another process rather than a drawing.

⚠ **One consequence for 1.5d**, recorded where it will be looked for (design.md, tasks.md and the
kit README): Chromium follows `border-radius` on an **outline** only from ~94, well above the CEF 71
baseline. Rounding the hole and the frame _together_ will need its own answer rather than falling
out of the punch.

---

## What shipped

### 1.5e — the plate gains a stroke (⚠ box left UNTICKED, deliberately — TWO gaps named)

- **Schema** — `stroke?: StrokeSchema` on `VideoPlaceholderElementSchema`, optional and additive, no
  version bump. The SHARED `StrokeSchema` unchanged; no second stroke concept, no alignment field.
- **Inspector** — a `Frame` section (colour + width) on the bare `video-placeholder` kind, written
  through `updateElement`. **Not** routed through `commitAnimatable`: `writeStaticAnimatable`'s
  `stroke.*` arms are gated on `boxKind = shape | text | path`, so that route would have written
  nothing at all — checked, not assumed (B-051 shipped exactly that as an inert row).
  Non-keyframeable and deliberately NOT in `FIELD_REGISTRY`, consistent with 1.8b's subtraction.
- **Both exporters** — round-trip pinned for `.vcg` (`pack` → `unpack`) and for the single-file HTML
  (the inlined `var scene =` literal, which is what CEF builds the DOM from).
- **Render** — `buildLiveSource` applies the outline BEFORE the `'output'` early return, because the
  frame is the one thing a Live Source paints on air.
- **Zero-width decided and tested**: `width: 0` means NO FRAME with the colour REMEMBERED. It is a
  stored state, not an absent one, so dialling the frame off and back on returns the author's colour
  rather than a default. Pinned at four levels (schema, render, both exporters, Inspector, E2E).

🔴 **Why the box is unticked.** The fourth assertion the task names — **"the stroke SURVIVES the
punch"** — cannot be written: the punch does not exist. It is 1.5c's, and 1.5c is blocked on 1.5b.
`tasks.md` 1.5e says this explicitly beside the unticked box. Nothing in this session is evidence
that the frame survives an erase.

### 1.5g — the pinning task (done)

Pinned in three places, deliberately, because the property has three distinct ways to break:

- **Preflight** (`apps/designer/tests/live-source-preflight.test.ts`) — plates whose FRAMES overlap
  is no fault; plates whose HOLES overlap still is; and the whole issue list is byte-identical for
  strokes of 0 / 1 / 40 / 5000 px against a layout that really does contain a collision.
- **Declaration** (`packages/vcg-format/tests/live-sources.test.ts`) — a frame of any width emits an
  identical `LiveSourceDeclaration`, nested-and-scaled included, and leaks no field of its own onto
  the wire.
- **Render geometry, in a REAL browser** (`apps/designer/tests/e2e/live-source.spec.ts`) — the
  hole is at the same page position and the same size before and after an 8px frame. This is the
  only place layout actually exists, and it is the assertion that caught the `content-box` slide.

⚠ **On "shadow" — the half that could NOT be exercised.** 1.5g's wording covers "neither stroke nor
shadow", and only the stroke half is driven by a real value (see the scope boundary below: a shadow
is absent from the schema, the renderer and the Inspector). A "shadow overlap is not a fault" test
would have to construct a field nothing can author, and would assert nothing — so it was not
written. What IS pinned is the guarantee that covers both without needing the field: `frameAabb` and
`sceneRect` compose `transform` alone, so **no paint property is an input to the geometry**. A shadow
lands inside that guarantee the day it is added, and the byte-identical preflight test is what fails
if a paint property is ever routed into the rect.

### 🔴 Scope boundary — STROKE ONLY, and the `box-shadow` gap that leaves

**Owner's call, 2026-08-13: this session builds the STROKE only. `box-shadow` is allowed by the
design and deliberately not built.** Recorded here and on 1.5e in `tasks.md` rather than left
silent, because the design says one thing and the product does another, and that divergence is
invisible from either side alone.

**Re-verified at HEAD, and the gap is wider than the brief assumed.** It is not "the design allows a
shadow but `field-registry.ts` withholds the control" — **a shadow is absent at all three layers**:

| Layer     | State at HEAD                                                                             |
| --------- | ----------------------------------------------------------------------------------------- |
| Schema    | no `shadow` / `boxShadow` field on `VideoPlaceholderElementSchema` at all                 |
| Renderer  | `buildLiveSource` applies no shadow                                                       |
| Inspector | `LIVE_SOURCE_STATIC` carries neither `BOX_DESCS` nor `BOX_SHADOW_DESCS`, so no row exists |

So adding it is the same four parts the stroke took — schema field, render line, Inspector row,
exporter round-trip — not a registry tweak. One fact for whoever picks it up: **the `outline`
decision does NOT apply to a shadow.** `box-shadow` already paints outside the border box and takes
no layout, so it needs no equivalent escape from the `border-box` reset.

**The kit's criterion 2 is unaffected and stays as written.** `punch-probe.html` is a hand-written
standalone page, not Designer output, so its plates carry a real `box-shadow` in their markup
regardless of what the Inspector offers — and they must, because a mechanism that eats a shadow will
eat one later even if nothing authors it today.

### The 1.5b measurement kit — `tools/live-source-punch-probe/`

- **`punch-probe.html`** — one self-contained page, no build step. An opaque striped backdrop; two
  plates above it carrying the frame (an `outline`, as the product renders it) and a box-shadow;
  **both** candidate mechanisms **plus a CONTROL state**. Cycled with a single **`CG NEXT`** — also
  click, keys `0`/`A`/`B`, `?m=`, and `CG UPDATE`. It prints the CEF user-agent on screen, so a
  photo of the output records which browser answered.
- **`README.md`** — the run recipe, the **two-criteria pass/fail card** (independent criteria: a
  mechanism that punches perfectly and eats its own frame passes 1 and fails the feature), the
  "record the measurement, not the expectation" instruction, and an **unfilled result form**.
- **`apps/designer/tests/live-source-punch-probe.test.ts`** — holds the probe to the repo's own
  `CEF_BANNED_BUILTINS` list, to Chromium-80 syntax (`?.`, `??`), to being self-contained, and to
  shipping both mechanisms plus the control. A probe that fails to BOOT on that CEF does not return
  a null result; it returns a wasted trip.

**No mechanism is chosen and none may be.** 1.5b is discharged by the filled-in form, not by the kit
existing.

---

## Still blocked on the plant — and why

| Task     | Blocked on                                                                                 |
| -------- | ------------------------------------------------------------------------------------------ |
| **1.5b** | The owner running the kit on the CEF inside the plant's CasparCG 2.3.2. Nobody else can.   |
| **1.5c** | 1.5b's result — there is no mechanism to implement until one is measured.                  |
| **1.5f** | 1.5b, whose criteria it extends.                                                           |
| **1.5h** | 1.5c — passthrough IS the punch with nothing put beneath it, so it cannot be demonstrated. |
| **1.5d** | Explicitly "revisit AFTER 1.5c" — plus the outline/`border-radius` fact above.             |

A desktop-Chrome run does not substitute for any of these. That is the whole point of 1.5b.

---

## Ripples worth knowing about

- **An existing E2E locator was under-specified and my new row exposed it.** Playwright's `name`
  matches by SUBSTRING, so `getByRole('spinbutton', { name: 'Width' })` began resolving to two
  elements once a `stroke width` row existed. Fixed with `exact: true` at both call sites rather
  than by renaming the control — the under-specification was the bug.
- **The Inspector hint prose was stale the moment the plate painted anything.** It said the element
  paints nothing on air; it now says the HOLE paints nothing and names the frame as the exception.
  The DOM test asserting the old sentence was updated, not deleted.
- **`packages/template-runtime/README.md`** gained the Live Source render contract (engine
  doc-sync): why the plate's stroke is an outline and every other box kind's is a border.

## Known gap, recorded rather than worked around

**`updateElement` cannot reach a grouped element** (`design.md` §9A.2, still unfixed and
unnumbered). `locate` walks only a layer's direct children, so a plate nested inside a CONTAINER
takes no edit from the new Frame rows — **nor from the source-id or aspect rows, which have always
shared that route**. This is pre-existing and is not something the frame control introduced. It was
left alone on purpose: a second, deeper write path used by one row would be exactly the
two-spellings shape the repo keeps paying for (`B-100` / `P-012`). It wants a fix at `locate`, for
every row at once, as its own change.

## Verification

- `pnpm gate` — green, uncached (`0 cached, 85 total`), plus `pnpm format:check`.
- `pnpm openspec validate live-source-multibox --strict` — valid.
- `apps/designer` Playwright `live-source.spec.ts` — 13/13 on Windows Chromium. **Windows is
  non-authoritative** and discharges nothing.
- **Linux `e2e` DISCHARGED** — <https://github.com/yasermostafaee/cg/actions/runs/31753678406>, `ubuntu-latest`,
  commit `b011005c`, `conclusion: success`, with the **`E2E (Playwright)` job COMPLETED and green
  (it RAN — not skipped, not cancelled)**. Recorded in `tasks.md` beside 1.5g. **This supersedes
  session AA's run** as the change's current discharge.
