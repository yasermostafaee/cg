# Design — Brand Pack Studio

## 1. A local web tool, not a desktop product

`cg-pack-factory studio --workspace <directory> --port <port>` starts a Node HTTP server bound to
`127.0.0.1` only and prints its URL. There is no host override and no installer. The page and JSON
API share one origin; the server rejects requests whose Host header is not loopback. This keeps the
private operating surface on the machine even when that machine is connected to a broadcast LAN.

The root `pnpm pack:studio` script builds the workspace and starts the same command with sensible
defaults. The port can be changed at invocation; the default is documented, not reserved as a
protocol port.

## 2. One explicit external workspace

The workspace is canonicalised before the listener starts and MUST be outside the repository. Its
layout is stable and human-readable:

```text
<workspace>/
  customers/<customer-id>/
    brandkit.json
    pack.json
    deliveries/<timestamp>/
      templates/*.vcg
      previews/*.png
      contact-sheet.html
      pack-sheet.md
      pack-report.json
```

The Studio lists only customer directories containing valid Studio documents. Writes use a temp
file plus rename, so a failed save cannot truncate the last good profile. Customer ids are stable
slugs and are not renamed in v1 because they own package identities.

The default workspace lives below the current user's home directory, never below the checkout.
An explicit `--workspace` remains preferable for production.

## 3. Structured UI over the existing documents

The browser edits the existing versioned `BrandKitSchema` and `PackRecipeSchema`; it does not
invent a second database or shadow format. The interface owns structured controls for identity,
targets, colours, fonts, assets, template rows, mappings and preview data. The JSON files remain
readable and usable by the existing CLI.

The first implementation may group advanced mapping records in compact rows, but saving always
validates the full schemas and reports an exact field/error path. The customer id becomes
read-only after creation.

## 4. Master inspection is read-only

The server opens a selected external `.cgproj` with `@cg/vcg-format#unpackProject` and returns only
metadata needed to prepare a recipe: composition ids/names/resolutions, unique hex colour values,
and packaged asset/font ids/names/kinds. It never copies the master into the workspace and never
modifies it.

Inspection does not guess semantic mappings. Exact customer mappings remain explicit, preserving
the Factory v1 rule that taste and branding decisions never hide in code.

## 5. Builds are append-only deliveries

Validate calls `preparePack` without writing. Build creates a timestamped directory beneath the
selected customer and calls the existing `writeDelivery` with visual QC enabled. A normal Studio
build never uses `--no-preview` and never overwrites an older delivery. The result view links the
contact sheet and names every emitted `.vcg` and report.

Static delivery files are served read-only from a route constrained beneath the selected delivery
directory. Path traversal and symlink escapes are refused.

## 6. Designer remains separate

The change does not touch Designer's landing page, recent projects, starter catalogue or storage.
Master templates continue to be authored in Designer. Customer outputs exist only in the Studio
workspace until our team deliberately imports/delivers them elsewhere.
