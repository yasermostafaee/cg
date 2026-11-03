# Tasks — complete weather Repeater data (D-180)

## 1. Dynamic row images

- [x] 1.1 Extend child-derived Repeater columns with image metadata and canonical `{ assetId }` cells.
- [x] 1.2 Add image asset selection and default-aware row seeding to the shared Inspector/Preview list editor.
- [x] 1.3 Resolve bound image values through `assetUrls` for root, nested and stamped Repeater scopes.
- [x] 1.4 Cover image editing, live row updates, replay/restamp and exported runtime parity with focused tests.

## 2. Structured shared files

- [x] 2.1 Add an explicit structured list-file mode for JSON arrays and header-based CSV rows.
- [x] 2.2 Validate/map structured columns against the child field schema, including image/code cells.
- [x] 2.3 Use the same parsed rows in Designer Preview and CG Control, with useful row/column errors.
- [x] 2.4 Persist independent field defaults on Sequence composition items and edit every page from
      the selected Sequence's Inspector modal without opening Preview or crowding Variables.
- [x] 2.5 Load one JSON page-data file in Designer, validate each nested Repeater list against its
      child-field schema/row limit, and remember the Bridge-relative source path.
- [x] 2.6 Generate and save a self-documenting JSON sample from each Sequence's actual pages,
      fields, nested groups and Repeater columns so authors never infer a project-specific shape.
- [x] 2.7 For a homogeneous paged Repeater, provide one Designer table and Excel-compatible CSV;
      split rows by `maxItems` and create/remove Sequence pages automatically.
- [x] 2.8 In CG Control, combine the same authored page Repeaters into one draft table with a
      persistent CSV attachment/reload flow, then split rows back into page namespaces on Update.
- [x] 2.9 Retain the Designer's selected page-data file for the session, keep Reload available after
      closing/reopening the modal, and expose detach/reselect explicitly.
- [x] 2.10 Author number presets (any, exact numeric choices and custom range), validate
      numeric/range/choice input in manual and file entry, and render every exact choice list as a
      dropdown in Designer and CG Control. Treat 0/1 as an example, not a hard-coded convention.
- [x] 2.11 Reject letters at entry time for manual numeric controls while retaining valid localized
      and incomplete number text; keep text, number and dropdown cells equally usable in narrow
      structured rows.
- [x] 2.12 Generate a schema-derived `.xlsx` template (choice dropdowns and numeric validation) from
      both Designer and CG Control so a deleted operator workbook is reproducible.
- [x] 2.13 Let each exact numeric choice carry an optional operator-facing alias; show and accept the
      alias in Designer, Preview, CG Control and CSV/Excel while keeping the canonical stored value
      numeric for bindings and rules.
- [x] 2.14 Import `.xlsx` row workbooks directly in Designer and CG Control, retain/reload the
      selected workbook, and accept Excel CSV variants using comma, semicolon or tab separators and
      UTF-8/UTF-16 text.
- [x] 2.15 Make import failures actionable by distinguishing a wrong file/type, an incompatible
      workbook/header structure and an invalid cell value; include filename, row/column, offending
      value and expected columns/choices/range where applicable.
- [x] 2.16 Replace free-form Sequence file import with a schema-first **Save and connect** flow in
      Designer and CG Control: generate the exact JSON/XLSX from the current template, retain that
      file as the connected source, show a labelled green-check connected state (or unplugged state),
      and use Reload for later edits.
- [x] 2.17 Keep numeric-alias syntax guidance ASCII/LTR and use neutral `alias1`/`alias2` examples
      so commas and equals signs remain readable inside an RTL Inspector.
- [x] 2.18 Replace the compact numeric-alias text field with a dedicated Inspector modal: one
      numeric Value input and optional Alias input per row, plus explicit Add, Remove and Save
      actions and row-specific validation for invalid or duplicate values/aliases.
- [x] 2.19 Reuse the standard Designer input primitives in the numeric-choice modal and continue a
      consistent arithmetic sequence when Add choice follows values such as 10, 20 and 30.
- [x] 2.20 Record the generated file's template signature in Designer and CG Control; keep Reload
      available but show a labelled connected/update-file warning after fields, limits or choices
      change, and clear the warning only by saving and connecting a current file.

## 3. Conditional value rules

- [x] 3.1 Add the optional ordered rule schema and validation for field input, comparator and one effect.
- [x] 3.2 Add compact Inspector authoring with a visible current-match preview and explicit default state.
- [x] 3.3 Evaluate rules live in the template runtime per nested/Repeater scope using the first
      matching rule per target property.
- [x] 3.4 Cover image, colour and visibility effects plus no-match restoration.
- [x] 3.5 Keep Inspector compact with only a rule count/status and open the full ordered rule editor
      in a dedicated modal immediately after Dynamic / Data; keep a distinct active-count badge
      visible even when the section is collapsed.
- [x] 3.6 When a rule input is an exact numeric choice field, use that field's authored choices and
      aliases for condition values while preserving canonical numeric rule data.

## 4. Export and verification

- [x] 4.1 Collect and validate image ids from defaults, authored rows, structured values and rule branches.
- [x] 4.2 Package the same dynamic asset closure in `.vcg` and single-file HTML exports.
- [ ] 4.3 Verify the attached weather project model with direct Repeater use and optional Sequence paging.
- [x] 4.4 Pass focused schema, Designer, Runtime and exporter suites plus strict OpenSpec validation.
- [x] 4.5 Run the full repository gate before commit/push; do not build installers until CG Control is manually accepted. Local `pnpm gate` passed all 103/103 tasks plus formatting, control-byte and strict OpenSpec checks on 2026-11-04; installers remain deferred until manual CG Control acceptance.
