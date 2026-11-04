# Design — complete weather Repeater data (D-180)

## Supported composition model

The attached `repeater.cgproj` shape is the supported model:

1. a child composition defines one weather card and exposes city, temperature and image fields;
2. a Repeater references that child and each list item is one structured row keyed by child field id;
3. an optional outer Sequence pages compositions containing those Repeaters.

Repeater owns rows; Sequence owns pages. Neither element learns a weather-specific schema.

## Child fields are the row schema

The referenced child composition remains the single row-schema authority. The Designer and CG
Control derive columns, labels and input kinds from those fields. Image cells store the normal
`FieldValue` object `{ assetId }`; the UI presents an asset picker and never asks an operator to type
an internal id. Unknown row keys are preserved so a temporarily older editor cannot destroy data.

New rows are seeded from child-field defaults. Existing rows that contain legacy scalar image ids are
read leniently and normalised to `{ assetId }` on edit.

At package import, image fields receive optional `assetOptions: [{ assetId, label }]` metadata derived
from the manifest image index. New exports preserve the original filename on each image
`AssetEntry`; older packages receive stable `Picture N` labels. Both root image fields and
child-derived Repeater columns use the same metadata. The visible control is a filename picker while
the staged and transported value remains `{ assetId }`.

## One runtime image-resolution seam

`applyFieldValues` and `applyScopedFieldValues` receive the same optional `assetUrls` map already owned
by `createRuntime`. An image binding records `data-cg-asset-id` and writes the resolved URL when known,
falling back to the scalar id only for legacy/custom hosts. Every runtime call site, including a freshly
stamped Repeater row and a mid-hold list update, passes that map. This avoids a second Repeater-only
image path and keeps Preview/export/on-air behavior identical.

## Structured files

A directly selected Repeater owns a compact **Rows and data file…** action beside its configuration.
The modal derives its workbook columns and validation from the referenced child composition, creates
the list binding when needed, saves and connects that exact `.xlsx`, and keeps its full selected path
only for the current Designer session. Reload validates and replaces the authored rows; Detach keeps
the current rows. An authored File-only choice is stored on the normal list field, so CG Control can
withhold manual rows without inventing a Repeater-specific transport contract. CG Control offers the
same schema-generated Save/connect/Reload flow and stages reloaded values until the operator presses
Update.

Structured row editors never rely on placeholders as their only column identity. Each cell has a
visible field title, and a many-column row may scroll horizontally or reflow into labelled cells
instead of shrinking below a usable input width. One horizontal scroll moves all rows together;
there are no per-row scrolling regions. Designer Inspector and Preview open these rows in a modal,
leaving only the action and count/status in the narrow panel. Preview modal edits stay staged until
the normal Update all command. CG Control retains its normal Update safety.

Structured file loading extends the existing list-field file source rather than adding a Repeater
file property. JSON v1 accepts an array of objects. CSV v1 uses a header row whose names map to child
field ids (with labels accepted only as a convenience when unambiguous). Image cells accept an asset
id or an authored weather code that is resolved by the field's choice mapping. Invalid rows are
reported with row/column context and do not silently become a single text item.

For paged authoring, the selected Sequence's Inspector owns one compact **Page data…** action. It
opens a roomy modal over the existing Sequence composition-item namespaces; Variables remains the
composition's field/binding table. Each composition item may carry a partial `fieldValues` object; missing values
still fall back to the referenced composition's field defaults. A single JSON file may be either a
top-level array or `{ "pages": [...] }`. Page N maps to composition item N, and each page object maps
field ids (or an unambiguous field title) to values. A Repeater list inside the page remains a normal
structured array and is validated by the same child-derived row schema and row limit as its manual
editor. The selected Bridge-relative path is stored on the Sequence, while the absolute Windows/UNC
path remains session-only.

The source attachment is cached by scene and Sequence for the Designer session. Closing the modal,
changing selection or editing the file externally therefore leaves **Reload** available without a
second file-picker gesture. The Bridge-relative path remains in the project; after a fresh app
session the operating-system permission is reacquired with **Choose file…** before reload.

The format is never a weather-specific convention the author must memorize. Designer generates a
matching sample from the selected Sequence. The document includes a `pageSchemas` guide (stable ids,
display titles, types, nested namespaces, row fields and limits) beside a directly reusable `pages`
array seeded from current authored defaults. Extra guide metadata is ignored by the loader, so the
same saved document is both the instructions and a valid starting data file.

For the common homogeneous shape — every Sequence item references the same composition and that
composition exposes exactly one flat structured Repeater — the author/operator surface is simpler
than the general JSON contract. Designer presents one table, generates an Excel workbook with
author-facing column titles, chunks rows by the Repeater `maxItems`, and creates or removes Sequence
composition items to match. This is the spreadsheet pattern used by established broadcast graphics
products: the operator works in a grid or Excel while the product owns page structure.

Designer and CG Control generate and connect an `.xlsx` workbook from the actual child-field schema:
exact numeric/select/boolean choices become
true Excel dropdowns and numeric min/max become Excel validation. Its 0/1 weather-code choices are
one example, not a fixed product convention. Saving retains the chosen file as the connected source,
so the author/operator edits that exact generated structure externally and presses Reload; the main
Sequence UI does not ask them to guess which unrelated workbook matches. The reader uses the visible
data sheet. Legacy CSV sources remain readable, including Excel locale separators (comma, semicolon,
tab, and an optional `sep=` directive) and UTF-8/UTF-16 encodings. Regardless of the editor used,
the field schema remains authoritative: numeric cells are
rejected when they are not numbers, fall outside an authored `min`/`max` range, or are absent from an
exact `allowedValues` list. Any exact numeric choice list — for example `0, 2, 5` — is rendered as a
dropdown in both Designer and CG Control. The legacy `min: 0, max: 1, step: 1` marker continues to
read as the equivalent `[0, 1]` list.

An exact numeric choice may also carry an optional label keyed by its canonical number. Authors edit
choices in a dedicated Inspector modal with separate Value and optional Alias inputs per row, using
neutral `alias1`/`alias2` placeholders instead of mixed-direction syntax. The modal provides explicit
Add, Remove and Save actions, uses the standard Designer field primitives, continues a consistent
arithmetic progression when adding another value, and identifies the exact invalid or duplicate row. Direct editors and
generated Excel dropdowns show aliases, and structured CSV/JSON import accepts either the alias or
the number. Parsing always normalises back to the canonical number, so bindings, value rules and
on-air payloads never receive a translated string. Labels are additive metadata; unlabelled and old
choice lists continue to display their numbers.

A connected generated file records the template signature it was built from. Changing fields,
limits or exact choices does not sever that source or disable Reload: Reload still validates the
external data against the current schema. Designer and CG Control instead replace the green check
with a labelled **Connected · update file** warning and direct the user to save/connect a current
file, because an older workbook's columns, validation or choice dropdowns may no longer represent
the template. Saving and connecting the regenerated file records the current signature and clears
the warning.

CG Control recognises the same shape from additive Sequence ownership metadata carried in
`TemplateInfo`. It hides the repetitive per-page groups, flattens their current/draft rows into one
table, and stages every edit back into the existing page namespaces. The generated Excel connection is persisted
and can be reloaded after another user edits the file; loading and reloading only stage data, so the
normal **Update** remains the single action that can reach on air. CG Control cannot add runtime
structure to an already packaged template: if the workbook exceeds its authored capacity it refuses with
the Designer/regenerate remedy instead of truncating. Arbitrary scalar/nested/mixed page structures
continue to use the generated self-documenting JSON format.

The author may set the homogeneous child Repeater field to **File only** directly from the outer
Sequence's Page data modal; this writes the same canonical field policy as the child Repeater's
Dynamic / Data section. CG Control asks the shared `fieldUsesFileOnly` predicate before rendering the
combined editor. In File-only mode the row table, add/remove and reorder controls are absent, while
the connected-file status, Reload and staged Update semantics remain. Save/connect/replace/detach
actions are absent: Designer owns the file connection and authored defaults in this mode. When no
workbook is connected, CG Control explicitly says Not connected and directs the operator to Designer.

Structured numeric cells use the shared `.cg-field` surface just like their text and select siblings.
The numeric parser/filter remains `NumericInput`; sharing the visual primitive prevents an editable
temperature from resembling a disabled browser-default input without changing its value contract.

This is an authoring input, not a second on-air data channel: parsed canonical values are persisted
on the Sequence items, included in the aggregate defaults exported to CG Control, and may still be
overridden by the normal namespaced operator payload. The runtime merges the item defaults first and
operator values second, so Canvas, Preview, export and live updates agree.

## Conditional rules

Rules are schema-level and generic, as specified by D-139. A rule list:

- reads one field value in the current composition/row scope;
- uses `=`, `!=`, `<`, `<=`, `>`, `>=` or inclusive `between`;
- applies exactly one image, colour/fill or visibility effect to one target element;
- evaluates in authored order with the first matching rule winning for each target property;
- restores the target's authored value when no rule matches.

There is no expression language and no cross-row lookup. Countdown time may reuse the same evaluator
later, but weather completion does not duplicate countdown timing helpers.

The additive serialized shape is `element.valueRules = { input: { kind: 'field', fieldId }, rules }`.
Each rule holds one typed condition and one restricted `ElementChange`-shaped effect. Inspector shows
only a compact rule count/status plus **Edit rules…** for the selected element, immediately after
**Dynamic / Data** when the element has that section. The dedicated modal
offers its valid colour slots plus visibility and (for image elements) picture, and shows which rule
the input field's authored default currently matches. More than one rule may be current when they
affect different properties. Reordering changes same-property evaluation priority
directly; there is no hidden priority number. A potentially long ordered rule list therefore never
crowds the narrow Inspector, without changing its stored model or runtime behaviour.

When the selected rule input is a number field with exact choices, condition values use the same
choice dropdown and operator aliases as direct data entry. The serialized condition remains the
canonical number. If an existing rule contains a number later removed from the field, the editor
keeps that value visible as unavailable until the author replaces it rather than silently rewriting
the rule.

Runtime evaluation happens after ordinary field bindings in each exact field scope. A freshly
stamped Repeater row therefore evaluates its own row object, and a live list update re-evaluates the
same row without cross-row state. Every property mentioned by any branch is restored to its authored
value when that branch is inactive, preventing a previously matched image, colour or visibility
value from leaking into a later no-match state. Thus a matching text-colour rule and a matching
background-colour rule both apply, while two matching text-colour rules still choose the earlier one.

## Export asset closure

Asset collection scans static elements plus image defaults, authored Repeater rows/list defaults and
every image branch in conditional rules. Validation names an unresolved dynamic asset before export.
Both `.vcg` packaging and single-file inlining consume the same collected id set.

The manifest filename is presentation metadata only. Asset identity, references, deduplication and
runtime URL lookup continue to use `assetId`; filenames are never accepted as stored row values.

## Compatibility and migration

All schema additions are optional. Existing list items remain open objects and text-only rows are
unchanged. Internal asset ids remain stable. No saved project is rewritten merely by opening it.

## Rejected alternatives

- **Weather-specific Repeater fields:** rejected because the same structured row model is needed for
  scoreboards, election results and product lists.
- **Raw asset-id text boxes:** rejected because they are error-prone and unsuitable for operators.
- **An expression engine:** rejected for v1 because deterministic ordered rules cover the accepted
  cases and are safer to validate/export.
- **Resolving images only in the Repeater driver:** rejected because ordinary image fields and nested
  scopes would still disagree.
