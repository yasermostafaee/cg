# Complete weather Repeater data (D-180)

## Why

The supported weather authoring model already exists: a city-card composition is repeated into a
list and that list may be paged by an outer Sequence. Text and numeric child fields reach each row,
but an image field cannot be edited as an asset choice and a live image update is written to the DOM
as a raw asset id. Structured weather rows and value-driven icon/colour changes therefore cannot be
authored or exported reliably.

## What changes

- Make a Repeater row editor follow the referenced child composition's field schema, including image
  fields represented canonically as `{ assetId }` and selected from available image assets.
- Let an author create that image field through the selected Image element's visible **Data key**
  control; starter source code or hand-edited project JSON is not an authoring requirement.
- Resolve image-field updates through the runtime `assetUrls` map in the initial scene, stamped rows,
  Preview, `.vcg` and single-file HTML.
- Let a Repeater list load structured rows from a shared JSON/CSV file without flattening the rows to
  one text column.
- Give a directly selected Repeater the same schema-generated Excel **Save and connect** workflow,
  connected state and Reload without requiring an outer Sequence; expose the same generated-workbook
  flow in CG Control behind the normal Update action.
- Give each structured row set one effective file owner: the standalone Repeater or its outer
  Sequence, never both. Connecting the generated workbook remains separate from an explicit author
  choice that permits or withholds CG Control row editing; neither choice creates a second child
  source picker.
- Let the author withhold CG Control edit authority per Repeater child column, so stable identity
  fields and row structure remain authored while operational statistics can still be entered
  manually or reloaded.
- Keep structured rows usable when the child has many fields: every surface shows the actual field
  title and preserves a practical cell width instead of squeezing columns into unreadable slivers.
- Open Repeater rows from a compact Inspector/Preview action into a shared modal; use one horizontal
  scroll for the entire table instead of separate scrollbars on individual rows.
- Persist independent values for each composition page in an outer Sequence and manage all rows and
  its JSON/CSV source from a roomy modal in that Sequence's own Inspector, not the Variables table.
- Generate a self-documenting, loadable JSON sample from the actual Sequence schema so another
  template structure never requires authors to guess page, namespace or Repeater-row keys.
- Follow the established broadcast-graphics pattern for nontechnical data entry: one built-in table
  plus Excel-compatible CSV and a generated `.xlsx` template. Designer automatically makes the
  required pages; CG Control presents the packaged pages as one operator table, can regenerate the
  Excel template, and keeps file reload behind the normal Update action.
- Treat a connected Sequence workbook as the paged table's one file authority. By default CG Control
  withholds manual rows and competing source actions while retaining connection status, Reload and a
  read-only dialog; the author can explicitly allow the same rows to be edited behind Update without
  transferring file ownership.
- Add ordered conditional rules for numeric/string field values. The first match per target property
  wins, so one temperature may change text and background together without making same-property
  conflicts ambiguous.
- Let number fields declare an exact numeric choice list (with 0/1 as one example) or a custom
  range, and enforce those contracts in Designer, file imports and CG Control. Choice-list cells use
  a dropdown everywhere, while editable numeric cells use the same active field surface as text.
- Include every image reachable through authored row data or a conditional rule in both export paths.
- Remove the redundant Image loader placement tool now that project images enter through Project
  Assets and project/shared replacements use the common visual picker.

## Impact

This is a FULL LANE change across shared schema, Designer authoring/Preview, template runtime, CG
Control field editing and both exporters. Existing text-only Repeater rows and existing project files
remain valid. The outer Sequence remains optional pagination and gains only generic per-page field
defaults/source metadata — no weather-specific behavior.

## Follow-up: visible file ownership and SVG authoring

The one-owner workbook policy must be equally legible in all authoring surfaces. A directly
connected structured Repeater therefore reports the same file-managed fact in Preview that a
Sequence-owned table reports, rather than rendering an incomplete numbered editor. The connected
path remains authored data and survives project export/import; it is not inferred from a temporary
runtime reload result.

SVG is an ordinary image asset. Both Project Assets and Shared Library expose it in their visible
native import filters, and a newly created image field accepts it by default. The asset continues
through the existing image URL/export path; authors never need a hidden workaround.

Dynamic image input is also authored, not inferred by the operator surface. The author selects an
explicit allowlist, Windows Browse, or both; Preview and CG Control then render only those controls
and never expose the internal asset id as editable text. SVG remains available in every route.
Image choices use one compact visual picker everywhere: its trigger shows the selected thumbnail,
its grid shows complete uncropped Project Assets and Shared Library images, and an empty choice
removes the bound image instead of leaving a broken glyph or filename on the graphic.
Read-only structured-data tables use the same resolved asset map to show the compact image itself,
not the workbook filename. These UI previews are session-cached, card-sized WebP derivatives made
with bounded concurrency; canvas/export/playout keep the original asset bytes.

The Landing catalog also uses the owner's broadcast-workflow names and ordering. The first eight
cards are Logo, Introduction title, horizontal crawl, clocked lower-third, vertical sequence, Quran
recitation, four-box and Azan countdown; imported project and root-composition titles use the same
Persian wording as their card.

CG Control keeps structured manual rows compact too: when no workbook owns them, one row summary
opens the complete editor in a wide modal. Removing an authored workbook removes its old Connected
fact and automatic draft before manual entry returns. Project-open migration also collapses identical
legacy root/composition wires, preventing the forecast Repeater from showing the same binding twice.
