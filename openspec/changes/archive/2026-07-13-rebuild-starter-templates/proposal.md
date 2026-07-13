# Rebuild starter templates — 5 professional Persian broadcast demos (D-119)

## Why

The previous ten starters were early/rough, predating the capabilities that now
define the product — content-driven tickers, sequences, wall clocks, the D-110
path-morph track, and the playout lifecycle (in → hold → out, loop-cycle,
auto-out). They demonstrated none of them, used fixed-duration keyframed crawls
where the runtime has real measured crawls, and carried no playout lifecycle at
all. As the first thing every operator sees, they set the quality bar — and set
it wrong.

## What Changes

- **`@cg/starter-templates` is repopulated** with exactly five owner-directed
  Persian (RTL, Vazirmatn) broadcast demos — `irib-news`, `ticker`, `logo-bug`,
  `title`, `sequence` — each schema-valid, fully animated, and carrying a real
  playout lifecycle. The package contract (`StarterTemplate`, `getStarter`,
  asset seeding) is unchanged; the eight legacy scene files, their posters, and
  their now-unused seed assets are deleted. No starter sets `isNew`.
- **Two-comp structure (owner decision):** every starter nests a small
  footprint comp (the graphic itself, named «… (روی آنتن)» and recorded via an
  `onair:<compId>` scene tag) inside a full 1920×1080 comp. The full comp is
  `entryCompositionId` and therefore today's preview/export root (a
  small-canvas export renders at the channel's top-left — no runtime
  positioning exists yet); when operator positioning ships, entry/export flips
  to the footprint comp.
- **Starter asset seeding fix (Designer platform):** `rewriteAssetRefs` now
  remaps `font.family` on `ticker`, `clock`, and `sequence` elements, not only
  `text` — without this the new starters' crawls/clocks/rotators would not
  resolve their seeded Vazirmatn asset.
- **Bound fields carry real Persian defaults (owner polish):** a bound text
  element's base text is a real display value that is also the field's
  `default`, with the data key layered on top via a placeholder-less binding —
  the hand-authored shape the Designer's own bind action produces (absent
  `placeholder` = the value replaces the full text). The starters had inverted
  this, making the base text the raw `{{token}}`, so the Designer canvas — and
  any on-air play with no operator value — showed a literal `{{channel}}`. It
  also left every starter's bound field reading "(static)" in the inspector,
  which recognises only a placeholder-less text binding as an element's Data key.
- **Boundary + E2E guards:** `apps/runtime/tests/import-starter-vcg.test.ts`
  packs every starter exactly the way the Designer scopes a per-composition
  export and drives the runtime app's real `verify → unpack → render` import;
  `apps/designer/tests/e2e/starter-landing.spec.ts` pins the catalog on the
  landing page.

## Impact

- Affected specs: `designer-shell` (starter catalog + seeding requirements
  added).
- Affected code: `packages/starter-templates/src/*` (rewritten; `@cg/template-runtime`
  added as a dev-only dep so `starter-render.test.ts` can prove the defaults render
  through the real engine),
  `apps/designer/src/platform/createDesignerBridge.ts` (seeding fix),
  `apps/designer/public/starters/*` (posters replaced, orphans deleted),
  `apps/runtime/src/platform/seed.ts` + tests referencing removed starter ids,
  `apps/runtime/src/platform/MockRuntime.ts` (B-056's owned-slot occupancy seed
  named `item-lower-third`, a row the rebuilt seed stack no longer creates).
- Related bugs filed (not fixed here): B-068 (`ensureCompositions` drops root
  lifecycle/playout), B-067 (Runtime inspector reads only flat root fields).
