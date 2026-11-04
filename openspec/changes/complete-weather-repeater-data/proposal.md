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
- Resolve image-field updates through the runtime `assetUrls` map in the initial scene, stamped rows,
  Preview, `.vcg` and single-file HTML.
- Let a Repeater list load structured rows from a shared JSON/CSV file without flattening the rows to
  one text column.
- Persist independent values for each composition page in an outer Sequence and manage all rows and
  its JSON/CSV source from a roomy modal in that Sequence's own Inspector, not the Variables table.
- Generate a self-documenting, loadable JSON sample from the actual Sequence schema so another
  template structure never requires authors to guess page, namespace or Repeater-row keys.
- Follow the established broadcast-graphics pattern for nontechnical data entry: one built-in table
  plus Excel-compatible CSV and a generated `.xlsx` template. Designer automatically makes the
  required pages; CG Control presents the packaged pages as one operator table, can regenerate the
  Excel template, and keeps file reload behind the normal Update action.
- Let the author mark that paged table **File only** from the Sequence Page data modal. CG Control
  then withholds manual rows while retaining generated-workbook connection and Reload, plus a
  read-only dialog for inspecting the current rows and any cells that no longer match the schema.
- Add ordered conditional rules for numeric/string field values. The first match per target property
  wins, so one temperature may change text and background together without making same-property
  conflicts ambiguous.
- Let number fields declare an exact numeric choice list (with 0/1 as one example) or a custom
  range, and enforce those contracts in Designer, file imports and CG Control. Choice-list cells use
  a dropdown everywhere, while editable numeric cells use the same active field surface as text.
- Include every image reachable through authored row data or a conditional rule in both export paths.

## Impact

This is a FULL LANE change across shared schema, Designer authoring/Preview, template runtime, CG
Control field editing and both exporters. Existing text-only Repeater rows and existing project files
remain valid. The outer Sequence remains optional pagination and gains only generic per-page field
defaults/source metadata — no weather-specific behavior.
