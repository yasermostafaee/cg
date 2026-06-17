# Shared image library + logo element (D-040) — design only

> **PHASE 1 of 2 — RECON + DESIGN ONLY.** This change folder is for owner review. No app/package
> source is modified by this change. Implementation (phase 2) follows owner sign-off on the schema
> choice, the two-source resolver plan, and the scope note below.

## Why

A channel logo / persistent bug is reused across every project and composition; re-importing it
per project (the D-001 per-project flow, which stays) is wasteful and drifts. The canvas already
has an image/logo tool, but it inserts nothing — its click handler only shows a placeholder
`alert` and the toolbar entry is commented out — because the shared source it was meant to read
never existed. D-040 adds a **device-level shared image library** (one store outside any project)
and wires the tool + inspector to it. The reference is design-time only: at export the resolved
bytes are **inlined** into the `.vcg` / single-file HTML exactly like a per-project asset, so the
played file stays self-contained (CasparCG CEF on `file://` cannot reach the library).

## What changes (phase 2 — proposed)

- **Shared store** — a new project-independent image store mirroring the per-project `AssetStore`
  surface (`import` / `list` / `get` / `bytes` / `remove`), backed by the same `@cg/storage`
  `Workspace` under a `shared/images/...` path namespace + a parallel bridge/IPC surface.
- **Schema** — widen `ImageElementSchema` with `source: 'project' | 'shared'` (default `'project'`
  for back-compat). A "logo" is simply an image with `source: 'shared'`; `assetId` then holds the
  shared image id. **Chosen over a new `logo` element kind** — smaller diff (see design.md).
- **Two-source resolver** — a single resolver (`source`-primary, other-store fallback) applied
  identically in the three byte paths (preview, `.vcg`, single-file HTML), with missing-asset
  fallbacks: edit/preview → visible placeholder + warning (never crash); export → reported via the
  existing preflight/validation path (blocked/warned), never a silent broken export.
- **Designer UI** — a Shared Library panel (add / list / remove with thumbnails, mirroring the
  Project Assets panel); the canvas image/logo tool wired to insert a `source: 'shared'` image
  sized to the picked image's aspect, with an insertion guard mirroring D-030 (empty library ⇒
  hint, no silent insert); an inspector combo box (thumbnail + name) to re-point the selection.

## ⚠ Scope finding for owner review (the real risk — see design.md §2)

D-040 says "inline the bytes **exactly like a per-project asset**, so the exported file renders the
logo." Recon found that per-project image **rendering in exported output does not exist yet on any
path**: the runtime emits `<img data-cg-asset-id>` with **no `src`**, and only the Designer
**preview** wires a `src` (from a blob-URL map). The `.vcg` exporter packages image bytes into the
zip but the served runtime never sets the `src` (image resolution is a documented stub); the
single-file HTML exporter does **not** inline image bytes at all (only fonts). So meeting D-040's
acceptance ("the exported file renders the logo") requires phase 2 to **also complete the image
byte→`src` render/inline path on `.vcg` + HTML for the project source too** — not merely add a
second source. design.md recommends D-040 own that completion (the shared-vs-project axis is
orthogonal; one resolver refactor covers both). **This enlarges phase-2 scope beyond a pure "second
source" — owner please confirm before implementation.**

## Capabilities

### Added Capabilities

- `designer-shared-image-library` — the shared device image store, the `source`-widened image
  element (logo), the two-source byte resolver across preview / `.vcg` / HTML with missing-asset
  fallbacks, and the library UI + tool wiring.

### Modified Capabilities

- None at the spec level. The touched code (image element schema, the three byte paths, the export
  preflight) has **no dedicated living capability** in `openspec/specs/` today — image-element and
  export behavior were never specced — so the new behavior is captured net-new in
  `designer-shared-image-library`. (If phase 2 completes per-project image rendering as flagged
  above, that baseline behavior is documented there too.)

## Impact (phase 2)

- **New:** a shared image store (mirrors `apps/designer/src/platform/AssetStore.ts`), its bridge +
  `@cg/shared-ipc` channels, a Shared Library panel + inspector combo, and the shared `useAssets`-style
  hook + thumbnail reuse.
- **Modified:** `@cg/shared-schema` `ImageElementSchema` (`+source`); the two-source resolver in
  `apps/designer/src/platform/preview.ts` (via the bridge `url`/asset-map), `Exporter.ts`
  `#gatherBinaries` + `preflight` (`@cg/vcg-format` packaging), and `ExporterSingleFile.ts`
  (image inline — **new**); the canvas image tool (`CanvasOverlay`/`CanvasToolbar`) + the image
  inspector; the played runtime's image `src` wiring (the render-completion above).
- **Schema/runtime:** additive `source` field; no breaking change.

## Out of scope (v1 — explicit)

- Cross-machine / central sync (no backend; "shared" = shared across projects on this storage
  backend — OS-level sharing falls out only if the operator points the Workspace at a shared drive).
- Categories / folders / tagging in the library.
- SVG-specific handling beyond what the image element already does.
- Per-project overrides of a shared image (a project can't fork/override one library image's bytes).
