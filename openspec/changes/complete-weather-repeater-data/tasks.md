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
- [x] 2.21 Let the Sequence Page data modal author the nested Repeater as File only; remove the
      combined manual editor in CG Control while retaining connected-workbook status/Reload, and
      keep editable numeric cells on the same active field surface as text/select controls.
- [x] 2.22 Publish File-only page rows to every Sequence namespace as one draft batch; include the
      batch helper in the tracked runtime source so clean Linux builds do not depend on a local file.
- [x] 2.23 Add a read-only **View current data** dialog for File-only Sequence rows in CG Control;
      show real column labels/aliases and identify cells that violate the current template schema.
- [x] 2.24 Give a directly selected Repeater its own **Rows and data file** modal in the Inspector, with
      schema-generated Excel **Save and connect**, a persistent connected/update-needed state,
      Reload, Detach and File-only controls; do not require a wrapping Sequence.
- [x] 2.25 Give the same direct Repeater field a schema-generated Excel Save/connect/Reload flow in
      CG Control, including `.xlsx` validation and the existing Update gate before data reaches air.
- [x] 2.26 Replace squeezed many-column Repeater rows with labelled, horizontally safe structured
      editors in Designer Inspector, Preview and CG Control; every cell must keep its field title
      visible and a practical minimum width at narrow panel sizes.
- [x] 2.27 Make the already-shipped row entrance controls unmistakable in a dedicated Repeater
      section and verify the effect/stagger in the real Designer Preview, not only unit runtime.

- [x] 2.28 Move direct Repeater and Preview structured rows into a roomy modal and use a single
      horizontal scrolling surface for all rows; verify field headers remain aligned in a browser.
- [x] 2.29 Make the outer Sequence the sole file-source owner for paged Repeater rows and carry its
      authored `pageDataFile` through the aggregate/TemplateInfo boundary.
- [x] 2.30 Make a structured workbook connection itself select file-managed rows in CG Control;
      remove the independent Sequence File-only checkbox and every competing manual/source control.
- [x] 2.31 Keep standalone Repeater workbook management only in **Rows and data file…** and suppress
      the duplicate generic Dynamic / Data file picker; when a Sequence owns the composition, expose
      rows but route file management to that Sequence.
- [x] 2.32 Cover standalone and Sequence-owned source precedence in schema, Designer DOM and real
      CG Control browser tests, then run the affected gates and full repository gate. Focused
      Designer and CG Control Playwright suites passed on 2026-11-06; local `pnpm gate` then passed
      all 103/103 tasks plus formatting, control-byte and strict validation of all 141 OpenSpec items.
- [x] 2.33 Remove the legacy **Use fixed file** entry from new Repeater authoring, retain existing
      fixed sources only for detaching, and verify the single structured-workbook route in DOM and
      real Designer browser tests. Focused DOM and Designer Playwright tests passed on 2026-11-06.
- [x] 2.34 Refresh an open CG Control Inspector when the same template id is updated, so newly
      authored Sequence workbook ownership immediately removes manual rows and duplicate
      Save/connect actions; cover the exact re-import path in DOM and real Runtime browser tests.
      Focused DOM and Runtime Playwright tests passed on 2026-11-06; local `pnpm gate` then passed
      all 103/103 tasks plus formatting, control-byte and strict validation of all 141 OpenSpec items.
- [x] 2.35 Preserve existing Repeater row identities when an authored Sequence file is read, so an
      unchanged workbook is clean on the first Inspector open while real data changes still stage;
      cover the first-open contract in real CG Control browser automation.
- [x] 2.36 Treat persisted Sequence `pageDataFile` as the connection truth after `.cgproj` import,
      show its Share path in Designer and CG Control, and make Designer Preview replace every
      Sequence-page row editor with the one connected-file fact; cover project import and Preview
      in a real Designer browser.
- [x] 2.37 Label the read-only current file-only data modal's dismiss action `Close`, not `Done`.
- [x] 2.38 Remove prose descriptions from Landing starter cards while retaining the Persian title,
      playout badge and motion preview.
- [x] 2.39 Present direct-Repeater and Sequence-owned workbooks with one compact CG Control
      file-managed connection treatment, and make Preview replace a directly connected structured
      Repeater table with its connected-file fact.
- [x] 2.40 Make SVG an explicit accepted image import in both Project Assets and Shared Library, and
      include it in new image-field defaults; retain image validation and Blob-backed rendering.
- [x] 2.41 Replace inline structured Repeater/Sequence inputs in CG Control with a compact row count
      and one **Edit rows…** modal while keeping file actions and Update staging in the Inspector.
- [x] 2.42 When Designer removes an authored direct-Repeater or Sequence workbook, remove only that
      Bridge-owned CG Control connection and withdraw the draft created by its automatic read.
- [x] 2.43 Deduplicate identical field/target wires while migrating legacy root bindings and while
      opening already-migrated projects, so the forecast Repeater exposes one binding.
- [x] 2.44 Separate structured-workbook connection from CG Control row-edit authority for both
      standalone and Sequence-owned Repeaters; align status icons, filename treatment and action
      labels across both owners.
- [x] 2.45 Make **Edit rows…** transactional: hold edits inside the modal, enable **Apply** only
      after a real change, and discard them on Close, ×, Escape or backdrop dismissal; add concise
      icons beside row/file action labels.
- [x] 2.46 Show the author's full selected Windows/UNC workbook path plus the portable CG Control
      file key in Designer; in CG Control distinguish that key from the effective path resolved by
      the current Shared files setting, for both direct and outer-Sequence-owned Repeaters.
- [x] 2.47 Keep every multi-frame Look preset in an equal, stable grid cell while selected, on air
      or idle; remove the redundant selected/take sentence, and let real PVW/on-air wording wrap
      inside its own button without resizing or reflowing the row.
- [x] 2.48 Prevent an asynchronous template/file resolution from rendering the previous template's
      schema against a newly selected stack item, so switching rows cannot create or move a false
      draft; cover the delayed-read selection race in real CG Control browser automation.
- [x] 2.49 Let a homogeneous Sequence-of-Repeater grow and shrink from manual or reloaded file data:
      derive exact runtime pages beyond the authored shell, retain stable generated identities and
      update the visible current page without replaying it.
- [x] 2.50 Add live page separators to Edit rows and View current data, update them with every row
      change, and show a local dirty dot on the combined Sequence row heading after Apply.
- [x] 2.51 Expose the normal **Data key** authoring route on selected Image elements, creating an
      image field and image binding that automatically becomes an asset-picker column when that
      composition is used by a Repeater; cover the public Inspector route and field-store contract.
- [x] 2.52 Reconcile the owner-edited visual revisions into the Landing starters: the latest
      province-weather `.vcg` supersedes its earlier `.cgproj`, while the five-day-weather and Iran
      league `.cgproj` files remain their references. Retain stable bundled asset ids and newer
      dynamic-data behavior, then regenerate each PNG and WebM preview.
- [x] 2.53 Make the province-weather temperature strip own its fill rules directly and the number
      own only its text-colour rules, so selecting either element reveals the behavior that changes
      it instead of making the strip appear to change without a rule.
- [x] 2.54 Replace raw image-id editing with one authored operator policy: allowed asset choices,
      Windows Browse or both. Apply it to Preview, scalar CG Control fields and Repeater rows; keep
      SVG available and package every selected project/shared choice.
- [x] 2.55 Rename and reorder the Landing starters so the owner's eight core workflows appear first
      in the requested order, with matching Persian project/composition names after import.
- [x] 2.56 Clip an alternating Repeater row fill to the full-row child plate's authored corner radius,
      including scaled and independently animated rows, so square fill corners cannot protrude.
- [x] 2.57 Replace filename-only image combos with one compact visual picker across Designer,
      Preview, direct/Repeater CG Control fields, source replacement, rules, steps, posters and
      ticker separators. Show uncropped project/shared thumbnails, use the actual thumbnail in
      read-only structured-data tables, and render an empty image value as an actually empty graphic
      slot rather than a broken-image glyph. Generate small session-cached WebP UI derivatives with
      bounded concurrency instead of decoding every heavy original in each picker. Keep newly
      uploaded portrait, square and wide pictures inside the same fixed picker tile while their
      derivative is pending; intrinsic image size must never expand the modal grid.
- [x] 2.58 Let the author lock individual Repeater child columns against CG Control edits for both
      direct and Sequence-owned Repeaters; keep locked controls visible/read-only, preserve authored
      values on workbook reload, make row count/order author-owned while any column is locked and
      lock team name/logo in the bundled Iran league starter.
- [x] 2.59 Remove the obsolete Image loader from the canvas toolbar and legacy tool rail while
      retaining Project Assets drag placement, shared/project source picking and compatibility with
      existing image elements.
- [x] 2.60 Refresh the landing-page `آب‌وهوای مراکز استان‌ها` starter from the owner's
      2026-11-07 `.cgproj`: use the full-width radial title ribbon, compact temperature pill,
      translucent alternating row fill, bottom row transitions and reverse row exit order, then
      regenerate the matching poster and motion preview from the real Designer renderer.
- [x] 2.61 Keep animated weather icons spatially anchored during page changes by dissolving the
      outgoing and incoming weather pages without horizontal page drift.
- [x] 2.62 Use a sequential fade-through for both paged weather starters so a newly mounted
      animated SVG starts while hidden and never cross-fades its reset frame over the outgoing
      icon; retain the stationary page geometry and cover both halves of the transition in Preview.
- [x] 2.63 Prewarm the composition pages of both paged weather starters so pages 2 onward reuse the
      same mounted SVG documents and already-settled nested Repeater rows instead of restarting at
      each turn; keep the behavior opt-in for other Sequence books and walk pages 1→2→3→4 in Preview.

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
- [x] 3.7 Warn before deleting a Data-key element that supplies surviving Value rules; on confirm,
      delete those dependent rules rather than making the editor appear to bind to another field.
- [x] 3.8 Use American-English `color` labels throughout the Value rules modal.

## 4. Export and verification

- [x] 4.1 Collect and validate image ids from defaults, authored rows, structured values and rule branches.
- [x] 4.2 Package the same dynamic asset closure in `.vcg` and single-file HTML exports.
- [x] 4.3 Verify the attached weather project model with direct Repeater use and optional Sequence paging.
      `weather.cgproj` resolves to 11 authored city rows across four Sequence pages (three rows per
      Repeater); its first-page Tabriz row currently contains one stale `weather-type = 2` cell
      against the current exact choices `0/1`, which the read-only data dialog now diagnoses.
- [x] 4.4 Pass focused schema, Designer, Runtime and exporter suites plus strict OpenSpec validation.
- [x] 4.5 Run the full repository gate before commit/push; do not build installers until CG Control is manually accepted. Local `pnpm gate` passed all 103/103 tasks plus formatting, control-byte and strict OpenSpec checks on 2026-11-04; installers remain deferred until manual CG Control acceptance.
- [x] 4.6 Re-run focused Designer/Preview/CG Control tests for the direct-Repeater file and table
      surfaces, then run the full repository gate before the follow-up push.
