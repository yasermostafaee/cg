# Brand Pack Studio

## Why

Brand Pack Factory v1 made customer pack generation deterministic and safe, but its operating
surface is still JSON files plus a command line. The owner needs a private production tool for our
own team: open a local port in a browser, manage each customer's inputs, build their templates and
leave the results in an on-machine folder. It is not software for customers and must not populate
Designer's starter/sample catalogue.

## What changes

- Add a loopback-only Studio command to `@cg/pack-factory`, with a configurable port and one
  explicit external workspace directory.
- Persist customer Brand Kits, recipes and delivery history beneath that workspace, independently
  from the product repository and Designer storage.
- Add a Persian/RTL browser interface for customer selection, structured Brand Kit and recipe
  editing, master-project inspection, validation, build progress and delivery results.
- Inspect master `.cgproj` files through the canonical project unpacker so the interface can show
  compositions, colour tokens, image/font asset ids and resolution before mappings are saved.
- Route validation and build through the existing Factory engine; deliveries keep the existing
  verified `.vcg`, preview and report contract.

## Capabilities

- `brand-pack-factory` — add a private local operating surface and workspace contract around the
  existing deterministic build engine.

## Impact

- `tools/pack-factory`: local HTTP server, workspace persistence, master inspection, static browser
  UI and focused/E2E tests.
- Root scripts/docs: one convenient start command and operating instructions.
- No change to Designer UI, starter samples, Runtime/Bridge protocols, installers or `.vcg`
  schema.

## Non-goals

- Shipping the tool to customers or producing an installer.
- Exposing it on LAN/WAN addresses.
- Replacing Designer as the editor for master `.cgproj` compositions.
- Importing a `.vcg` back into Designer (`D-143`).
- Automatically publishing generated templates into CG Control.

## Lane

**FULL lane.** The Studio persists customer configuration and invokes the playout artifact build
path, so it requires schema/persistence tests, real-browser UI coverage, the full gate and Linux
CI.
