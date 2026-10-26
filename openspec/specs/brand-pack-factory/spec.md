# brand-pack-factory Specification

## Purpose

Define the internal, repeatable path for turning external customer Brand Kits and explicit build
recipes into deterministic, verified `.vcg` deliveries without placing customer assets in the
product repository or creating a second export implementation.

## Requirements

### Requirement: The factory consumes a strict external Brand Kit

The factory SHALL accept a versioned Brand Kit with a stable brand id, semantic colours, raster
targets, motion personality, fonts and brand assets. Customer inputs and outputs SHALL resolve
outside the product repository.

Every font SHALL explicitly confirm embedding rights and carry a licence note. The logo SHALL name
a vector source. A non-browser vector source SHALL also name a browser-renderable derivative before
it can be bound into a template. Derived colours SHALL name their source colour and document why
they exist.

#### Scenario: A font licence is not confirmed

- **WHEN** a Brand Kit declares a font without confirmed embedding rights
- **THEN** validation fails before any delivery file is written

#### Scenario: The only logo is a raster

- **WHEN** the `logo` role names no SVG, AI or EPS source
- **THEN** validation fails and the raster is not silently treated as production vector art

#### Scenario: Customer output points into the repository

- **WHEN** the requested delivery directory is inside the product repository
- **THEN** the command refuses it before creating the directory

### Requirement: A recipe applies only declared semantic replacements

The factory SHALL select one composition from each master `.cgproj`, validate its target raster, and
replace only exact colour tokens, asset ids and font asset families declared by the recipe. Every
source binding SHALL occur in the selected composition and every destination role SHALL exist in the
Brand Kit. The transformed scene SHALL pass the canonical Scene schema.

#### Scenario: A declared colour token is stale

- **WHEN** a recipe maps a source colour that does not occur in the selected composition
- **THEN** that template fails instead of producing an unchanged package

#### Scenario: A sibling composition owns an unrelated asset

- **WHEN** the selected composition does not reference an asset used only by its sibling
- **THEN** the emitted `.vcg` omits that asset and sibling composition

### Requirement: Rebuild identities are stable and brand-scoped

The factory SHALL derive the template package id from the brand id and template key, and replacement
asset ids from the brand id and semantic role. Identical inputs and an identical injected timestamp
SHALL produce byte-identical `.vcg` bytes.

#### Scenario: The same pack is rebuilt

- **WHEN** the same brand id and template key are built again with changed content
- **THEN** the manifest id is unchanged so the imported template is updated

#### Scenario: Two brands build the same template key

- **WHEN** two different brand ids build `lower-third`
- **THEN** their manifest ids and replacement asset ids differ

### Requirement: The factory uses the canonical playout package path

The selected scene SHALL use the same composition projection, page-list pass, page builder, runtime
bundle, package writer, verifier and unpacker as Designer export. The factory SHALL NOT maintain a
second boot page or `.vcg` writer.

#### Scenario: A Lottie is present

- **WHEN** the selected composition references a Lottie asset
- **THEN** its JSON and the shared Lottie player are packaged and the canonical boot page loads it

#### Scenario: Package verification fails

- **WHEN** the built archive does not pass canonical integrity verification and unpacking
- **THEN** it is not accepted into the delivery

### Requirement: Completed deliveries carry visual and machine-readable QC

A completed delivery SHALL render each emitted package in Chromium from its unpacked files, invoke
the real play and stop globals, capture intro/hold/out phases, and fail on page errors, console
errors, failed resource requests, missing globals, or a page that does not become visible.

The delivery SHALL contain the `.vcg` files, phase PNGs, a contact sheet, a human pack sheet and a
JSON report naming identities, hashes, verification and QC results. A no-preview run SHALL be marked
incomplete for delivery purposes.

#### Scenario: The packaged page cannot play

- **WHEN** Chromium loads the package but no working `window.play` is installed
- **THEN** the build fails and no successful delivery report is emitted

#### Scenario: Every package passes

- **WHEN** all packages verify, play, stop and capture without browser errors
- **THEN** the report marks the delivery complete and the contact sheet references all phase images
