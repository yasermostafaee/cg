# Operator-chosen on-air position for a loaded graphic (R-011)

## Why

"Author small, place anywhere" — the runtime half. A small-canvas template
(e.g. a 300×300 comp) renders at output (0,0) today: the exported/served
single-file HTML sizes `html,body` to `scene.resolution` (with
`overflow:hidden`) and lays the `.cg-stage` at the page's top-left, while
CasparCG's CEF frame is channel-sized (1920×1080) — so the graphic pins to
the top-left corner and the bridge applies no positioning anywhere. The
operator has no way to place a lower-third bug at the bottom-right, and a
freshly imported small comp lands in the corner instead of somewhere sane.

Approach decided = **Option A (runtime offset)**. A CasparCG `MIXER`
command is REJECTED as a hard requirement: no new hardware-gated AMCP verb
(every AMCP addition needs Phase-3b hardware validation), the corner math
belongs where the footprint is known (the runtime knows
`scene.resolution`; AMCP would need it plumbed out-of-band), and MIXER
transforms the rendered channel raster (scaling artifacts) instead of
placing a full-resolution page.

## What Changes

- **Data model** (`@cg/shared-schema`): a `Position` type —
  `{ anchor: <9-point grid>, offset: {x, y} }` — where the anchor aligns
  the graphic's matching handle to the OUTPUT frame's matching handle and
  the offset is a pixel nudge in output space (x→right, y→down). The Scene
  gains an OPTIONAL `defaultPosition: Position` (the manifest default;
  absent is legal — full backward compatibility). This change DEFINES and
  CONSUMES the field; auto-populating it from the D-119 nested-instance
  position is the Designer track's job (out of scope).
- **Runtime application** (`@cg/template-runtime` + the single-file boot):
  a new `applyOutputPosition(scene, {search})` sizes the page to the
  1920×1080 reference output frame and translates the `.cg-stage` via CSS
  transform: `stageX = ax*(ow−fw) + offset.x`, `stageY = ay*(oh−fh) +
offset.y`. Effective position = URL-query override (operator) ??
  `scene.defaultPosition` (author) ?? centered (fallback — a fresh import
  never lands at 0,0). Called ONLY from the exported single-file HTML's
  boot script — the one page CasparCG loads (bridge-served `/template/<id>`
  AND the file-drop path) — verified as the correct output-only gate:
  `installCasparGlobals` itself is ALSO called by the Designer preview, so
  the gate lives in the boot script, and the preview (which never calls
  the new function) is untouched by construction. Query encoding:
  `?pos=<anchor>&dx=<x>&dy=<y>`.
- **Runtime UI** (`apps/runtime`): a per-item position picker in the
  Inspector — 3×3 anchor grid + x/y offset — seeded from the manifest
  default (retained at `.vcg` import; `TemplateInfo` stays untouched) and
  sent to the bridge over a new `stack.set-position` channel. LOCKED while
  the item is on air (position is fixed once taken — mirrors R-010's
  on-air refusal); editable while loaded-not-taken and idle.
- **Bridge plumbing** (`tools/caspar-bridge`): a `#positions:
Map<itemId, Position>` written by `stack.set-position` — REFUSED
  (`reason: 'on-air'`) while the item is on air (bridge-authoritative);
  loaded-not-taken → an invisible re-ADD re-serves with the new query;
  idle → stored for the next load. In `#sendAdd` ONLY: a stored override
  appends `?pos=…&dx=…&dy=…` onto the ALREADY-RESOLVED served http URL —
  the single permitted touch in the B-064 serve path; the
  serve-down/bare-id contract stays byte-for-byte (never appended to a
  bare id; a down serve still fails loud). Both load's ADD and take's
  B-039 re-ADD flow through `#sendAdd`, so both inherit the position. The
  map SURVIVES a `setConfig` rebuild; `remove()` deletes the entry. No
  override → no query → the runtime falls back to
  `scene.defaultPosition` ?? centered (the bridge stays opaque about the
  manifest default).

## Capabilities

- `runtime-onair-positioning` (NEW capability — the Position model, the
  output-only runtime placement, and the served-URL override encoding).
- `runtime-caspar-bridge` (ADDED — Requirement "Operator position
  overrides ride the served URL query").
- `runtime-ui` (ADDED — Requirement "Per-item position picker with an
  on-air lock").
- Ordering: the held `fix-amcp-escaping-v2` / `reconnect-reconciliation`
  deltas' owned requirement headings (incl. "Template resolution is
  validated") are untouched — every delta here is an ADD of a new heading
  (one in a brand-new capability), so this change archives
  ordering-independent of that pair.

## Impact

- `packages/shared-schema` (Position + `Scene.defaultPosition`),
  `packages/template-runtime` (position module + boot export + tests),
  `packages/single-file-export` (one boot-script line),
  `packages/shared-ipc` (`stack.set-position`), `tools/caspar-bridge`
  (`#positions`, `setPosition`, the `#sendAdd` append, routes, integration
  tests), `apps/runtime` (contract ripple, default-position retention at
  import, Inspector picker, jsdom + e2e).
- Frozen (behavior unchanged): the AMCP escape rule (the position rides
  the URL query, never the data payload); B-044 lifecycle;
  reconnect-reconciliation (adopt-CLEAR, `#adopted`, `load()` proceed);
  R-003 staged edits; R-009 sweep + clearLayer; R-010 setConfig semantics;
  B-056 owned-slot warning. Reference output frame = 1920×1080; a
  non-1080 channel is documented future work.
- Live smoke on real hardware recorded as PENDING in the PRD entry.
  Cross-ref D-119 (Designer half: auto-populate `defaultPosition`,
  small-comp export).
