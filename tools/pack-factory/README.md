# Brand Pack Factory

Private in-house tooling for turning a customer's external Brand Kit and reusable master
`.cgproj` compositions into verified `.vcg` deliveries. It is not shipped in Designer, Runtime or
CG Bridge, and it must not be pointed at customer files stored inside this repository.

## Local browser Studio

The normal operating surface is the private Studio. It is not installed and never listens on the
LAN: start it from this checkout, then open the printed `127.0.0.1` URL in a browser.

```powershell
pnpm pack:studio -- --workspace D:\CG-Customers --port 4319
```

Without arguments it uses port `4319` and the current user's
`APASAI CG\Brand Pack Studio` directory. For production, always pass the explicit customer
workspace you back up. The server accepts no host override and binds only to `127.0.0.1`.

The Studio stores each valid customer as:

```text
<workspace>\customers\<customer-id>\
  brandkit.json
  pack.json
  deliveries\<timestamp>\
    templates\*.vcg
    previews\*.png
    contact-sheet.html
    pack-sheet.md
    pack-report.json
```

Use **بررسی فایل مادر** to read the selected `.cgproj`'s compositions, exact colour tokens and
asset/font ids before entering mappings. **بررسی پک** runs the canonical validation path without
writing a delivery. **ساخت خروجی** always runs visual QC and adds a new timestamped delivery; it
does not overwrite prior deliveries.

Customer profiles and generated templates never enter Designer storage or its first-page samples.
Designer remains the tool for authoring reusable master `.cgproj` files; the Studio applies each
customer's declared brand mappings and creates the deliverable pack.

## Build workflow

The commands below remain available for automation and troubleshooting. The Studio calls the same
engine; it is not a second exporter.

1. Keep `brandkit.json`, licensed font files, vector logo/source assets, references and `pack.json`
   in the private customer workspace outside this repo.
2. Keep each reusable master in `.cgproj` form. A master may be external or intentionally live in a
   private internal master library; its customer replacements still stay external.
3. Validate first:

   ```powershell
   pnpm --filter @cg/pack-factory build
   node tools/pack-factory/bin/cg-pack-factory.mjs validate `
     --brand-kit D:\customers\acme\brandkit.json `
     --recipe D:\customers\acme\pack.json
   ```

4. Build into a new external delivery directory. Chromium opens each actual built package, calls
   its real `play`/`stop`, and captures intro/hold/out:

   ```powershell
   node tools/pack-factory/bin/cg-pack-factory.mjs build `
     --brand-kit D:\customers\acme\brandkit.json `
     --recipe D:\customers\acme\pack.json `
     --out D:\customers\acme\delivery-2026-10-26
   ```

The output contains `templates/*.vcg`, `previews/*.png`, `contact-sheet.html`, `pack-sheet.md`, and
`pack-report.json`. `--no-preview` is for automation only; it writes an explicitly **incomplete**
delivery. `--force` atomically replaces the exact requested delivery directory.

Visual QC uses Playwright's managed Chromium. If that binary is unavailable locally, the tool falls
back to installed Chrome/Edge on Windows (or Chrome elsewhere); `CG_PACK_FACTORY_BROWSER_CHANNEL`
can select an explicit Playwright channel.

## Brand Kit contract

- `id` is permanent. Changing it creates new template and asset identities.
- Colours are semantic roles. `source: "brand"` values are copied exactly. `source: "derived"`
  values must name `derivedFrom` and explain the measured/support purpose in `note`.
- Every font role needs `licenseConfirmed: true` and a non-empty `licenseNote`. A path alone is not
  legal approval.
- `assets.logo.sourcePath` must be SVG/AI/EPS. AI/EPS also needs a browser-renderable `renderPath`.
- Target keys state the exact raster a recipe can select.

See [`examples/brandkit.example.json`](examples/brandkit.example.json) for the complete v1 shape.

## Recipe contract

One row selects one master composition and binds its explicit source tokens/ids to semantic roles:

- `colors`: exact source hex → Brand Kit colour role;
- `assets`: master asset id → Brand Kit asset role;
- `fonts`: master font asset id → Brand Kit font role.

A binding that occurs zero times is an error. This is intentional: a master edit cannot make an old
recipe silently produce an unchanged or half-branded template. `preview.data` is the CG data used by
visual QC; its three delays choose the intro, hold and exit capture instants.

See [`examples/pack.example.json`](examples/pack.example.json). The example uses placeholders and
contains no customer data.

## Identity and update rule

The package UUID is derived from `brand id + template key`; replacement asset UUIDs are derived from
`brand id + semantic role`. Rebuilding the same pack updates the same records in CG Control. Another
brand cannot collide. Renaming one of those keys deliberately creates a new identity.

## Human polish

The command is deterministic and does not make design choices. Build or refine the reusable master
in Designer, use Codex for a separate review/polish pass when useful, then rerun the factory and
review `contact-sheet.html`. Do not let automation alter exact brand colours or invent a vector logo.
