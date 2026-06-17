# designer-shared-image-library Specification

## Purpose

TBD - created by archiving change add-shared-image-library. Update Purpose after archive.

## Requirements

### Requirement: Device-level shared image store

The platform SHALL provide a shared image store that lives ONCE outside any project, persisting across projects and sessions, mirroring the per-project asset store's surface (import / list / get / bytes / remove) but project-independent. It is backed by the same `@cg/storage` `Workspace` under a project-independent path namespace (e.g. `shared/images/...`) and reuses the existing asset byte/blob handling (sha256 dedupe, the `AssetMeta` shape) — no parallel encoding. "Shared" means shared across projects on this storage backend; there is no central/cross-machine backend.

#### Scenario: Adding an image stores it in the shared namespace

- **WHEN** the operator opens the shared image library and adds an image
- **THEN** it is stored in the shared store (not in any project), appears in the library list, and persists across projects and sessions

#### Scenario: Removing a library image

- **WHEN** the operator removes a library image
- **THEN** it leaves the library list; projects that already EXPORTED it are unaffected (the bytes were inlined at export); and a still-open project that only REFERENCES it falls back to a visible missing-asset placeholder with a clear warning (never a crash)

### Requirement: Image element carries a source; a shared image is a logo

An image element SHALL carry a `source` of `'project'` or `'shared'`, defaulting to `'project'` so scenes authored before this change parse unchanged. A "logo" is an image element with `source: 'shared'` whose `assetId` references a shared-library image; `source: 'project'` references a per-project asset as before. There is a single image element kind and one image renderer — no separate logo kind, schema, or render path.

#### Scenario: Existing image scenes are unchanged

- **WHEN** a scene authored before this change (an image element with no `source`) is loaded
- **THEN** the element resolves as `source: 'project'` and renders exactly as before — no migration, no behavior change

#### Scenario: A shared image references the library by id

- **WHEN** an image element has `source: 'shared'`
- **THEN** its `assetId` is resolved against the shared library (not the project store)

### Requirement: Two-source byte resolution renders the image in preview

The asset resolver SHALL be two-source — it resolves an image element's bytes from the source-indicated store first (shared for `source: 'shared'`, project otherwise) and falls back to the other store — and the live preview SHALL render the resolved bytes. The same resolver is used everywhere image bytes are resolved (preview and both exporters), so a referenced library image renders identically across preview, `.vcg`, and HTML.

#### Scenario: A shared logo renders in the live preview

- **WHEN** a scene containing a `source: 'shared'` logo element is previewed
- **THEN** the preview resolves the bytes from the shared library and renders them; a `source: 'project'` image still resolves from the project store

#### Scenario: Resolution tries both sources

- **WHEN** an image element's bytes are resolved
- **THEN** the resolver tries the source-indicated store first and the other store as a fallback, so an id present in either store resolves

### Requirement: Export inlines the resolved bytes, self-contained, on both export paths

Export SHALL inline an image element's resolved bytes (base64 for single-file HTML, packaged for `.vcg`) exactly like a per-project asset, so the exported file is self-contained and renders the image with no external, network, or `file://` access. This applies identically whether the image's `source` is `'project'` or `'shared'`, and a logo used in two projects resolves and inlines independently from the one shared source (no per-project re-import).

#### Scenario: Exported file renders the logo with no external access

- **WHEN** a scene containing a logo element is exported to `.vcg` or single-file HTML
- **THEN** the resolved bytes are inlined (packaged / base64), the export contains no external reference to the library, and the exported file renders the logo with no network or `file://` access

#### Scenario: The same logo in two projects inlines independently

- **WHEN** the same shared logo is used in two different projects
- **THEN** each project resolves and inlines it independently from the one shared source, with no per-project re-import

### Requirement: Missing references never crash and never export silently broken

A logo reference that no longer resolves SHALL be handled gracefully: in edit/preview the element renders a visible missing-asset placeholder with a clear warning (never a crash); at export it is reported via the existing preflight/validation path (blocked or clearly warned, consistent with how unresolved assets are handled today) on BOTH the `.vcg` and single-file HTML paths — never a silent broken export.

#### Scenario: Missing reference in edit/preview

- **WHEN** a logo element references a library id that no longer resolves while editing or previewing
- **THEN** it renders a visible missing-asset placeholder with a clear warning, and the app does not crash

#### Scenario: Missing reference at export

- **WHEN** a logo element references a library id that no longer resolves at export (`.vcg` or single-file HTML)
- **THEN** export reports it via the existing preflight/validation path (blocked or clearly warned), not a silent broken export

### Requirement: Library UI, tool insertion guard, and inspector combo

The Designer SHALL provide a shared library affordance to manage the device library (add / list / remove with thumbnails), wire the canvas image/logo tool to insert and select a `source: 'shared'` image sized to the picked image's aspect ratio, and expose an inspector combo box (thumbnail + name) to re-point a selected image element to a library image. The tool's insertion is guarded: when the library is empty it surfaces a hint to add a library image first and inserts nothing (never a silent no-op insert).

#### Scenario: Inserting a logo from a non-empty library

- **WHEN** the operator uses the canvas image/logo tool while the shared library is non-empty
- **THEN** a `source: 'shared'` image element is inserted and selected, default-sized to the image's aspect, referencing the first/selected library image

#### Scenario: Empty-library insertion guard

- **WHEN** the operator uses the canvas image/logo tool while the shared library is empty
- **THEN** the tool does not silently insert nothing — it surfaces a hint to add a library image first

#### Scenario: Inspector combo re-points the selection

- **WHEN** a logo element is selected
- **THEN** its inspector shows a combo box listing the shared library (thumbnail + name), and changing the selection re-points the element to that image
