# Design — Brand Pack Factory v1

## 1. One private build contract

The command takes three explicit paths:

```text
cg-pack-factory build --brand-kit <brandkit.json> --recipe <pack.json> --out <delivery-dir>
```

`brandkit.json` owns customer identity: semantic colours, embeddable font files, logo/other asset
files, target rasters, motion personality and notes. `pack.json` owns the repeatable relationship to
master projects: template key, source `.cgproj`, composition, raster target, output name and exact
colour/font/asset bindings. Relative paths resolve from the file that declares them.

The Brand Kit, every customer asset/reference, recipe and output directory MUST resolve outside the
repository. Master `.cgproj` files may live in a private external library or a deliberate internal
master location; generated customer bytes never become fixtures or starter templates.

## 2. Strict inputs, no taste hidden in code

Colours are named records. A `brand` colour is copied exactly. A `derived` colour must name its
source and carry a note (for example, the measured contrast purpose). The tool performs exact token
replacement only; it does not invent a tint, gradient or contrast adjustment.

Each font file has a stable role key, family/weight/style metadata, `licenseConfirmed: true`, and a
non-empty licence note. Each bound file becomes a stable brand-scoped asset identity and an
`asset-<id>` family in the scene.

The `logo` role requires a vector source (`.svg`, `.ai` or `.eps`). If that source cannot render in a
browser (`.ai`/`.eps`), the kit also supplies a render file. Any bound image must use a browser-safe
render file. The source master is evidence, not something packed blindly into `.vcg`.

Every binding is checked in both directions: its source token/id must occur in the chosen
composition and its semantic role must exist in the Brand Kit. A stale binding is an error rather
than a green build that changed nothing.

## 3. Stable identity, variable content

The package id is a deterministic UUID derived from `brand id + template key`; a replacement asset
id is derived from `brand id + role key`. The derivation uses the same SHA-256 UUID mechanism as
per-composition Designer exports. Content paths remain SHA-256 addressed. Therefore:

- rebuilding a customer's template updates its existing Runtime/CG Control record;
- another customer's same template key cannot replace it;
- changing bytes under a stable semantic role updates content without changing the role identity;
- renaming a brand id, template key or role is intentionally a new identity and is reported as such.

The package's exported timestamp may change; byte-for-byte archive equality is not the identity
contract. Tests inject the timestamp to prove deterministic packages for fixed inputs.

## 4. Share the real exporter

The factory does not emulate Designer export.

1. `@cg/vcg-format` exposes a pure composition projection: flatten the selected composition, retain
   only its nested closure, drop the project entry pointer and derive the normal composition package
   id. Designer calls it, then applies its editor-specific off-frame optimisation. The factory calls
   it before replacing the package id with the brand/template identity.
2. `@cg/single-file-export` exposes the existing `.vcg` index-page builder. Designer and factory pass
   the same scene, asset/font indexes and Lottie decision to it.
3. `@cg/vcg-format` remains the only `.vcg` pack/verify/unpack implementation.

This keeps future runtime boot, font-face, asset-map and Lottie changes on one code path.

## 5. Asset transformation and packaging

The selected composition is transformed as JSON only for exact values declared by the recipe:
colour tokens, asset ids and `asset-<id>` font families. It is parsed through `SceneSchema` again
after transformation. Referenced project assets keep their original bytes/index identity; bound
brand assets/fonts replace the source id with a brand-scoped id and are indexed from their external
bytes. Unreferenced sibling-composition assets are omitted.

Page-list metadata is applied exactly where normal export applies it. Lottie packages carry the
shared player only when a referenced Lottie exists. The final archive is verified and unpacked
again before it is accepted.

## 6. QC is against the deliverable

QC serves the files unpacked from each just-built `.vcg`, not a source scene or a special preview.
Chromium waits for the package's real `window.play`, calls it with recipe preview data, captures
intro and hold, calls `window.stop`, and captures the exit phase. Console errors, page errors,
failed requests, a missing play/stop adapter, or a package that never leaves `cg-pending` fail the
build.

The delivery contains:

- `templates/<key>.vcg`;
- `previews/<key>-intro.png`, `-hold.png`, and `-out.png`;
- `contact-sheet.html` using those captures;
- `pack-sheet.md` stating brand inputs, targets, identities, licences and mappings;
- `pack-report.json` for automation, including hashes, manifests, verification and QC events.

`--no-preview` exists only for schema/unit automation and prints/records that visual QC was skipped;
a delivery build without previews is not a completed pack.

## 7. Explicit non-goals

- No Brand Pack controls in Designer or CG Control.
- No `.vcg` import/edit path (`D-143`). Master authoring stays in `.cgproj`.
- No copying a customer pack into the starter catalogue or Git fixtures.
- No automated raster-logo tracing.
- No subjective AI polish inside the deterministic command. Codex may polish a master or review
  captures as a separate, reviewable authoring step.
- No signing in v1; the existing package signing seam remains future work.
