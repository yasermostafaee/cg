# Design — operator-chosen on-air position (R-011)

## 1. Diagnosis — why a small comp renders at (0,0) today

Verified against `main` (`0ebf4ff`):

- The page CasparCG loads is the SAME single-file HTML on both paths: the
  Runtime app's `.vcg` import renders the scene through
  `ExporterSingleFile.produce()` and ships that HTML to the bridge
  (`templateDelivery.ts`), which serves it opaquely at `/template/<id>`;
  the D-019 file-drop export is the same builder.
- `buildSingleFileHtml` (`packages/single-file-export`) sizes
  `html,body { width:<scene.w>px; height:<scene.h>px; overflow:hidden }`
  and the runtime's `buildScene` lays the scene-sized `.cg-stage` at the
  page's top-left. CEF renders the page in a channel-sized (1920×1080)
  frame → a 300×300 comp pins to output (0,0).
- Nothing anywhere positions: the bridge builds
  `CG ADD … "<served-url>" 0 "<data>"` with no placement, and the runtime
  has no notion of an output frame.
- Consequence for the fix: translating the stage alone is NOT enough — the
  scene-sized body's `overflow:hidden` would clip the translated stage, so
  the output boot must ALSO size the page to the output frame.

## 2. Option A decided; MIXER rejected

- **No new hardware-gated AMCP verb** (the hard requirement): every AMCP
  addition re-opens Phase-3b hardware validation; `CG UPDATE` alone took a
  probe harness to prove. The entire feature stays in already-validated
  verbs — the position rides the served URL's query string.
- **The corner math lives where the footprint is known**: the runtime has
  `scene.resolution`; a MIXER path would need footprint math done
  bridge-side against server-reported channel geometry.
- **MIXER transforms the rendered raster** (fill/position scales the
  composed layer — resampling artifacts, and interacts with other mixer
  state); Option A renders the page AT the right place, full quality.
- Cost accepted: Option A cannot reposition ON AIR without a re-serve
  flash — hence the on-air lock (§5).

## 3. Data model

`@cg/shared-schema` (`scene.ts`):

```
PositionAnchor = 'top-left' | 'top-center' | 'top-right'
              | 'mid-left' | 'center' | 'mid-right'
              | 'bottom-left' | 'bottom-center' | 'bottom-right'
Position = { anchor: PositionAnchor, offset: { x: number, y: number } }
```

The anchor aligns the graphic's matching handle to the OUTPUT's matching
handle (corners are 4 of the 9); the offset is a pixel nudge in output
space (x→right, y→down). `Scene.defaultPosition?: Position` is optional —
absent is legal, every existing scene/`.vcg` validates unchanged. This
change defines + consumes it; D-119 (Designer) will auto-populate it.

## 4. Runtime application — output-only by construction

New `packages/template-runtime/src/position.ts`:

- `OUTPUT_FRAME = { width: 1920, height: 1080 }` — the reference frame the
  manifest offsets are authored in. **Non-1080 channels are documented
  future work** (§8): CEF pages get no channel-geometry signal; a real fix
  plumbs the channel size from the bridge (which can `INFO` it) into the
  query, a deliberate follow-up.
- `parsePositionQuery(search)` — `?pos=<anchor>&dx=<x>&dy=<y>`; `pos` must
  be one of the 9 tokens (else the whole override is ignored — never a
  half-applied position); `dx`/`dy` are finite numbers, absent ⇒ 0.
- effective = query override ?? `scene.defaultPosition` ?? centered
  (`{anchor:'center', offset:{x:0,y:0}}`) — a freshly imported graphic
  lands CENTERED, never (0,0).
- placement: with footprint `(fw,fh) = scene.resolution`, output `(ow,oh)`,
  anchor fractions `ax,ay ∈ {0,0.5,1}`:
  `stageX = ax*(ow−fw)+offset.x`, `stageY = ay*(oh−fh)+offset.y` →
  `transform: translate(stageX px, stageY px)` on the `.cg-stage` root
  (footprint stays scene-sized; only translated), and `html/body` are
  inline-resized to the output frame so the translated stage isn't clipped
  by the exported page's scene-sized `overflow:hidden` (§1). A full-frame
  1920×1080 scene computes translate(0,0) — pixel-identical to today.

**The gate.** The task brief names "the `installCasparGlobals` path" as
the on-air boot — verification showed `installCasparGlobals` is ALSO
called by the Designer preview (`apps/designer/src/platform/preview.ts`
wires the postMessage transport through the same globals), so folding
positioning into it would leak into authoring. The concrete output-only
boot is the **exported single-file HTML's boot script**
(`buildSingleFileHtml`) — the only page CasparCG ever loads, on both the
bridge-served and file-drop paths, and a page the preview never uses. So:
`applyOutputPosition` is a separate export called only from that boot
script, right after `createRuntime`/`installCasparGlobals`. The Designer
preview never calls it → the author keeps seeing the comp at its own
resolution, untouched by construction (regression-tested: `createRuntime`
alone applies no transform). On the file-drop path `location.search` is
empty → manifest default ?? centered, exactly the intended no-bridge
behavior.

## 5. Bridge plumbing — override storage + the single serve-path touch

- `#positions: Map<itemId, Position>` in `CasparRuntime`.
  `setPosition(itemId, position)` (`stack.set-position`):
  - unknown item → `{ok:false, reason:'unknown-item'}`;
  - item on air (`pending` or status ∈ playing/on-air/updating/exiting/
    unconfirmed — the R-010 on-air predicate; `unconfirmed` blocks because
    the on-air result is UNKNOWN) → `{ok:false, reason:'on-air'}`,
    bridge-authoritative and mirrored by the locked UI;
  - stored; then if the item is LOADED-NOT-TAKEN (live producer, not on
    air) it re-ADDs through `#sendAdd` on a non-intent seq (the take
    re-ADD precedent — the item's status is never perturbed): an invisible
    re-serve with the new query. Idle → stored for the next load. The
    re-ADD is best-effort (a failure leaves the position stored; the next
    ADD carries it).
- `#sendAdd` — the SINGLE permitted B-064 touch: after the existing
  serve-down guard and URL resolution, a stored override appends
  `?pos=…&dx=…&dy=…` to the RESOLVED http URL only. The bare-id fallback
  branch never gets a query; the template-serve-down loud failure is
  byte-for-byte untouched (guard runs first). Load's ADD and take's B-039
  re-ADD both flow through `#sendAdd` → both inherit the position
  (tested). The AMCP escape rule is untouched — the URL was always quoted
  as one argument; the query changes the argument's VALUE, not the
  escaping, and the data payload is not involved.
- Lifecycle: `remove()` deletes the entry (and `removeAll` via it);
  `setConfig` does NOT touch the map — an operator's placement is not
  server knowledge, it must survive a reconfiguration (tested). Positions
  are process-memory like `#slots`.
- No override → no query → the runtime applies
  `scene.defaultPosition ?? centered`. The bridge stays OPAQUE about the
  manifest default — it only ever knows explicit operator overrides.

## 6. UI — picker seeded from the manifest default, locked on air

- The manifest default is read from the scene AT IMPORT (the only moment
  the Runtime app holds the unpacked scene): `produceTemplateDelivery`
  surfaces `scene.defaultPosition`, and the Library records it in a
  renderer-side registry keyed by templateId. `TemplateInfo` is untouched
  (per the brief). Display-only residual (§8): a template imported by a
  PREVIOUS page session lists from the bridge registry without its scene,
  so the picker seeds from the centered fallback label — the APPLIED
  default is always correct regardless (the runtime reads it from the
  scene inside the served HTML).
- `PositionPicker` (Inspector, per selected item): 3×3 anchor grid + x/y
  offset inputs + an explicit Apply (a round-trip per change would spam
  re-ADDs). Disabled — with the reason shown — while the item is on air
  (the §5 predicate); editable while loaded-not-taken and idle. A refusal
  surfaces via the command-error toast.
- MockRuntime parity: same on-air refusal + stored map, so the picker's
  lock and apply flows are e2e-testable offline.

## 7. Query encoding (decided)

`?pos=<anchor>&dx=<x>&dy=<y>` on the served URL — e.g.
`http://127.0.0.1:9280/template/bug?pos=bottom-right&dx=-40&dy=-24`.
Anchor tokens and numbers are URL-safe as-is; the bridge builds the string
directly, the runtime parses via `URLSearchParams`. The template HTTP
server already strips queries when routing (`split('?')`), so serving is
unchanged; the query exists solely for the page's own `location.search`.
Unknown/invalid `pos` ⇒ the override is ignored wholesale (fallback
chain), never a partial apply.

## 8. Accepted residuals

1. **Non-1080 output channels**: offsets are authored/applied in the
   1920×1080 reference frame. A 4K/720 channel scales the whole page as
   CEF does today (unchanged), but anchor math assumes 1920×1080.
   Future work: the bridge plumbs real channel geometry into the query.
2. **No on-air repositioning**: locked by design (Option A re-serves; a
   mid-air re-ADD would flash). The operator outs, repositions, retakes.
3. **Picker seed for foreign-session imports** (§6): display-only; the
   applied default is always the scene's.
4. **Overrides are process-memory** (like `#slots`): a bridge restart
   forgets them; the runtime falls back to the manifest default. No
   persistence in this change.
5. The exported page keeps its scene-sized static CSS; the output boot
   inline-overrides it. An OLD runtime bundle serving a NEW template (no
   `applyOutputPosition`) simply renders as today (top-left) — no hard
   dependency between bundle and bridge versions.

## 9. Test strategy (red-first)

- **template-runtime unit**: 300×300 scene — explicit anchor+offset query,
  `scene.defaultPosition`, centered fallback, invalid-token fallback;
  asserts the stage transform + page frame sizing; and the
  DESIGNER-PREVIEW guard (`createRuntime` alone applies no transform, no
  page resize).
- **bridge integration (amcp-mock)**: no override → the `CG ADD` URL has
  NO query; `set-position` on a loaded item → re-ADD carries the query AND
  still resolves (served http URL, not a bare id); take-after-out re-ADD
  carries the SAME query; `setConfig` rebuild → position survives into the
  next ADD; on-air `set-position` → refused `'on-air'`; every
  socket/port released deterministically (CI discipline).
- **jsdom**: picker seeds from the manifest default, stages anchor+offset,
  applies once, disables on air.
- **e2e (offline mock)**: imported `.vcg` with a `defaultPosition` seeds
  the picker; an override reaches the bridge (spy); the picker locks once
  the item is taken.
- caspar-bridge suite green in ISOLATION and under the full parallel
  `pnpm test` (both mandatory).
