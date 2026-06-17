# designer-image-export Specification

## Purpose

TBD - created by archiving change render-image-assets-in-exports. Update Purpose after archive.

## Requirements

### Requirement: Image elements render in the `.vcg` export

A `.vcg` export SHALL render each per-project image element by packaging the asset bytes into the archive and wiring the served runtime's `<img>` `src` to those packaged bytes, so the served output renders the image with no external or `file://` access. Every referenced image is packaged, including images in nested compositions/containers (not only top-level layers).

#### Scenario: A per-project image renders from the packaged `.vcg`

- **WHEN** a scene containing a per-project image element is exported to `.vcg`
- **THEN** the asset bytes are packaged into the archive AND the served `index.html` provides the runtime an asset-URL map so the `<img>` `src` resolves to the packaged bytes, rendering the image with no external reference

#### Scenario: A nested-composition image is packaged

- **WHEN** a referenced image element lives inside a nested composition or container
- **THEN** its bytes are still packaged into the `.vcg` (the asset walk recurses, not top-level layers only)

### Requirement: Image elements render inline in the single-file HTML export

The single-file HTML export SHALL inline each per-project image element's bytes as a base64 data URI and wire the runtime's `<img>` `src` to it, so the standalone file renders the image offline with no external, network, or `file://`-fetch access.

#### Scenario: A per-project image renders offline from the standalone HTML

- **WHEN** a scene containing a per-project image element is exported to single-file HTML
- **THEN** the image bytes are base64-inlined into the HTML and the runtime sets the `<img>` `src` to that data URI, rendering the image offline with no external reference

### Requirement: The runtime applies a host-supplied image asset-URL map

The runtime's `createRuntime` SHALL accept an optional `assetUrls` map (image `assetId` → URL) and, after building the scene, set the `src` of each image element node whose `assetId` is present in the map. When no map is supplied the runtime leaves the `src` unset (so the Designer preview's existing host-side wiring is unchanged). This is the single seam both exporters use to wire image `src`.

#### Scenario: Supplying an asset-URL map wires image src

- **WHEN** `createRuntime` is given a scene with an image element and an `assetUrls` map containing that element's `assetId`
- **THEN** the built image node's `src` is set to the mapped URL

#### Scenario: No map leaves preview behavior unchanged

- **WHEN** `createRuntime` is called without an `assetUrls` map (the Designer preview path)
- **THEN** image nodes are built with no `src`, exactly as before, for the preview host to wire itself

### Requirement: A missing image asset is reported at export on both paths, never silently broken

When an image element's bytes do not resolve at export, it SHALL be reported via each path's existing validation convention — the `.vcg` export blocks with an error and the single-file HTML export surfaces a warning — never producing a silently broken export. The report covers image elements anywhere in the scene (recursing compositions/containers).

#### Scenario: Missing image asset blocks the `.vcg` export

- **WHEN** a scene references an image element whose asset bytes do not resolve and it is exported to `.vcg`
- **THEN** export is blocked with an error-severity `missing-asset` issue identifying the element

#### Scenario: Missing image asset warns on the single-file HTML export

- **WHEN** the same scene is exported to single-file HTML
- **THEN** export surfaces a warning-severity `missing-asset` issue identifying the element (the HTML export does not block), so the missing image is reported rather than silently broken
