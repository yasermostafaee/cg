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

Image fields are not a starter-only or source-code-only facility. Selecting an ordinary Image element
shows the same **Dynamic / Data** Data-key control as a text element. Assigning a key creates the
image field plus its `image` binding; when that composition becomes a Repeater child, the existing
row-schema derivation turns it into an image picker column automatically.

## Owner-revised built-in examples

The latest owner-exported province-weather `.vcg` supersedes the earlier province `.cgproj`; the
owner-edited five-day-weather and Iran-league `.cgproj` files remain the other visual references.
Reconciliation copies presentation choices while deliberately retaining the starter catalogue's
stable font/image asset ids, public image fields/bindings, complete province data and current dynamic
page contracts. The Landing PNG and WebM are regenerated from the reconciled scenes so the card never
previews an older design.

Examples must not hide their mechanism. The province temperature strip therefore owns its own fill
rules and the number owns its own text-colour rules. Both read the same `temp` field, but selecting the
strip now reveals the rules responsible for its colour instead of requiring the author to discover a
cross-element effect attached to the number.

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
table, and stages every edit back into the existing page namespaces. The generated Excel connection is
persisted and can be reloaded after another user edits the file; loading and reloading only stage data,
so the normal **Update** remains the single action that can reach on air. For the recognised homogeneous
Sequence-of-Repeater shape, CG Control also stages one reserved flat row list. The packaged runtime
derives the exact page count from that list (`ceil(rows / maxItems)`), reuses authored page identities
first, creates stable generated page identities beyond them, and removes surplus generated pages when
data shrinks. Thus 5 rows at 8 per page produce one page, 32 produce four and 33–40 produce five without
truncation or a Designer round trip. Arbitrary scalar/nested/mixed page structures continue to use the
generated self-documenting JSON format.

The combined row editor owns the visual editing context for that derived pagination. Both **Edit rows**
and read-only **View current data** insert a light labelled separator before each page chunk; the modal
derives those separators from its current private row snapshot so add/remove updates them immediately.
After Apply, the combined section shows the same dirty dot as a direct Repeater field, locating which
part of the Inspector owns the item-level `draft`.

A structured row set has one effective source owner. A standalone Repeater owns its workbook through
**Rows and data file…**; its generic Dynamic / Data section keeps the Data key and field schema but
does not offer a second shared-file picker or the legacy **Use fixed file** text-source workflow.
When an outer Sequence pages that Repeater, the Sequence owns the one workbook through **Page
data…** and the child Repeater exposes rows only. A legacy fixed text source remains visible only so
it can be detached; no new Repeater can enter that mode. The authored
`pageDataFile` crosses `TemplateInfo` with the Sequence page identity, so CG Control never has to infer
ownership from the child field.

CG Control's selected Inspector subscribes to template-catalogue changes as well as selection
changes. Updating an existing template id does not replace the selected stack item, so a
selection-only schema fetch can keep the previous manual table even though the catalogue already
contains `pageDataFile`. The catalogue push re-runs the same channel-scoped `get`/`list` reads; it
does not create a second ingestion path.

Connecting either structured workbook makes the file the editing authority without a second
File-only checkbox. CG Control removes the manual row table, add/remove/reorder and every second
save/replace/detach route; it keeps only labelled connection state, Reload, View current data and the
normal staged Update. Detaching in Designer restores manual entry. Older packages that encoded
File-only on the nested field remain supported as a fallback, but Sequence ownership wins whenever
`pageDataFile` exists.

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

## Follow-up: source facts and SVG picker contract

Preview determines a structured table's effective source before it chooses its editor: an outer
Sequence `pageDataFile` wins; otherwise a directly connected structured Repeater's `fileSource`
wins. Connection does not by itself decide edit authority: an explicit `operator-choice` mode keeps
the row editor, while legacy/`file-only` sources render the compact **File managed** fact instead of
numbered placeholder cells. Persistence remains on the existing source owner and neither Preview nor
CG Control creates another data path. CG Control uses one status grammar for both owners: green check
plus ordinary Connected text, dark tags, matching Reload/View/Detach labels and the Share path.

The image picker advertises SVG explicitly with both the extension and MIME type. Relying on the
generic `image/*` accept token is insufficient because native Chromium pickers do not consistently
surface SVG under that token. SVG remains loaded as a normal image Blob URL and follows the existing
asset/export closure.

An image field optionally stores `inputMode: choices | upload | choices-and-upload` and authored
`assetOptions[]` with `project | shared` ownership. Absence keeps the legacy package-derived choice
picker. Designer Preview and CG Control share that policy; Browse values are data URLs so the same
value reaches Preview and playout without exposing or accepting an internal filename. The export
closure includes every authored option even when it is not the current default.

A child field may additionally persist `operatorEditable: false`; absence remains editable for
backward compatibility. This is column authority, independent of whether the outer row set is
file-managed or manually editable. CG Control keeps the column visible but disables its input, and
both direct-Repeater and Sequence workbook loaders restore that column from the current authored row
by position after parsing. Editable columns continue to use the loaded value. Since an added,
removed or reordered row has no safe authored identity for a locked column, the presence of any lock
also disables Add/Remove/Reorder in CG Control and makes the authored row count mandatory on file
load/reload; a mismatch is rejected before any draft is staged.

Current-data tables resolve image cells through the same packaged `assetUrls` map used by Preview
and playout. The visible cell is a compact `object-fit: contain` thumbnail; the asset label remains a
tooltip rather than occupying the table as a filename. Visual pickers and tables request a bounded,
session-cached WebP derivative sized for their card (at most two conversions at once), while canvas,
export and playout continue to consume the original URL/bytes.

The legacy Image loader placement tool is no longer presented. It duplicated the supported Project
Assets drag route and suggested that a shared-library picture was a different element type. Existing
image elements remain valid; source replacement still offers both Project Assets and Shared Library.

Manual structured rows use the same modal boundary in CG Control as in Designer/Preview. The narrow
Inspector owns only row count, **Edit rows…**, file status/actions and the normal Update gate. An
authored Bridge source is identifiable by `bridgePath`; when that path disappears from the updated
template it is detached, while an operator-picked durable handle is preserved. If that authored
source had been auto-read, its staged field/page values are withdrawn with it. Load migration treats
`fieldId + target` as wire identity and keeps the first identical binding, including projects whose
root was drained in an earlier session.

## Rejected alternatives

- **Weather-specific Repeater fields:** rejected because the same structured row model is needed for
  scoreboards, election results and product lists.
- **Raw asset-id text boxes:** rejected because they are error-prone and unsuitable for operators.
- **An expression engine:** rejected for v1 because deterministic ordered rules cover the accepted
  cases and are safer to validate/export.
- **Resolving images only in the Repeater driver:** rejected because ordinary image fields and nested
  scopes would still disagree.
