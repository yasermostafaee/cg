# The operator-facing label is the imported file name, on every panel (R-004)

## Why

R-004 shipped a display name in the Library and looked correct in testing, because the
bundled starters carry real labels. It fails on the packages operators actually import,
for two reasons found in use:

1. **Only ONE human name survives into a `.vcg`, and it is the wrong one.** The exported
   `manifest.name`, `scene.name` and the entry `Composition.name` are all the same string —
   the Designer's composition projection overwrites the scene name with the composition's at
   export, and the PROJECT name never enters the package at all. So the "display name" is the
   entry composition's, which is routinely a Designer-internal label ("Comp 1"). And
   `ManifestSchema.name` has no `.min(1)`, so it can be blank — in which case R-004's rule
   fell all the way back to displaying the raw UUID.

2. **The Stack and the Inspector were never in R-004's scope at all.** Both still label a
   row `fields['title'] ?? item.itemId` — a field most templates do not declare, so the row
   reads `item-<uuid>` — with the raw `templateId` printed underneath. The two surfaces the
   operator works in identified a graphic by two different UUIDs and no name.

The one string the operator chose, and the one they recognise in a hurry, is the **file name
they picked in the import dialog**. It reaches the browser on `File.name` and was simply
being dropped: the import path already read it for its error messages and threw it away on
success.

## What Changes

1. `TemplateInfo` gains an **optional** `sourceFileName` — the imported `.vcg`'s file name,
   verbatim. Optional and additive: a bundled starter has no file, and a `TemplateInfo`
   registered before this field stays valid.
2. The import path captures `File.name` and records it. No new bridge op, no new channel —
   `templates.import` already carries the whole `TemplateInfo`, and both registries store it
   as-is.
3. **One label rule, used by all three panels** (Library card, stack row, Inspector header):
   the cleaned file name, else the manifest name, and **never the `templateId`**.
   - Cleaning: strip the `.vcg` extension, turn `-`/`_` into spaces, collapse runs.
     `news-lower-third.vcg` → `news lower third`.
   - **Case is preserved.** These names are Persian, or mixed Persian/English; there is no
     correct "capitalize" for an Arabic-script string, and title-casing the Latin half would
     make the two halves disagree.
4. The raw id is **removed from the visible row** — including the Library's `· <uuid>`
   secondary text, which R-004 had required. It stays reachable as the row's **tooltip**,
   which is enough to correlate a row with a served `/template/<id>` URL when debugging.
5. A template with neither a file nor a usable name is labelled **"Unnamed template"** —
   in words. A UUID is not a name, and a row is never blank.

## Non-goals / explicitly unchanged

- **No new identity.** `templateId` remains the sole key — registry, stack item, served
  `/template/<id>` URL, every lookup. The label is never matched, keyed, or routed on, and
  never reaches an AMCP argument.
- **No AMCP change**, no new verb, no quoter/escaping change.
- The Designer's project name is still **not** exported into the `.vcg`. This change reads
  what the package already carries plus the file name; it does not add a name to the format.

## Impact

- `packages/shared-ipc` — `TemplateInfoSchema.sourceFileName` (optional).
- `apps/runtime` — `templateName.ts` (the label rule), `templateDelivery.ts` (capture),
  `LibraryPanel`, `StackPanel` + `StackRow`, `Inspector`, `useTemplateIndex` (the
  registry join the stack row needs, since `StackItemState` carries no label).
- Specs: `runtime-template-library` — MODIFIED (the R-004 display-name requirement is
  restated with the new priority and the no-UUID rule).

## Capabilities

- runtime-template-library — MODIFIED: the label is the imported file name, else the
  manifest name, never the id — on every panel.
