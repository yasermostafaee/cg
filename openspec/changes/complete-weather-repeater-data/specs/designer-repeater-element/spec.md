# designer-repeater-element Specification

## ADDED Requirements

### Requirement: Structured rows share one modal table viewport

Designer Inspector and Preview SHALL open Repeater rows from a compact action into a modal. Every
row SHALL retain readable labelled cells and use one shared horizontal scrolling surface. Preview
edits SHALL remain staged until Update all.

#### Scenario: Author edits a wide league table

- **WHEN** a Repeater child has many fields and the author opens its rows
- **THEN** the table appears in a roomy modal and scrolling horizontally moves every row together
- **AND** no row has an independent horizontal scrollbar

#### Scenario: Preview row dialog closes

- **WHEN** the operator edits rows and closes their modal
- **THEN** the Preview remains open with the edits staged and no automatic on-air update

### Requirement: Repeater rows edit every supported child-field kind

The shared Repeater items editor SHALL derive each row column from the referenced child composition's
field schema and SHALL preserve canonical values for text, number and image fields. An image column
SHALL present available image assets by readable name and store `{ assetId }`, not a display label or
raw filename. New rows SHALL seed child-field defaults and unknown existing keys SHALL be preserved.

#### Scenario: Author chooses a different weather icon

- **WHEN** a child image field is shown as a Repeater row column and the author chooses an image
- **THEN** that row stores `{ assetId }`, its stamped card updates immediately, and reopening the
  Inspector or Preview shows the same selected asset

#### Scenario: A new weather row is added

- **WHEN** the author adds a row to a Repeater whose child has city, temperature and image defaults
- **THEN** the new row contains the child fields' canonical default values instead of one unrelated
  empty `text` property

#### Scenario: CG Control edits a row picture

- **WHEN** an operator opens a packaged Repeater row with an image column
- **THEN** the picker shows the packaged image filenames, never an asset id, and choosing a filename
  stages the corresponding `{ assetId }` value

### Requirement: Bound images resolve identically in every scope

The template runtime SHALL resolve an image binding's current asset id through the host `assetUrls`
map whenever values are applied to the root scope, a nested composition or a stamped Repeater row.

#### Scenario: Image value changes during a hold

- **WHEN** a live list update changes one Repeater row's image value during a hold
- **THEN** that row's image `src` changes to the mapped URL without restamping the row and Preview,
  `.vcg`, single-file HTML and on-air runtime show the same image

#### Scenario: A fresh play stamps current image values

- **WHEN** a different list was retained before Play or replay
- **THEN** freshly stamped rows resolve the current image values before presentation and do not expose
  raw asset ids as browser URLs

### Requirement: Repeater list fields accept structured shared data

A list field driving `repeater-items` SHALL support an explicit structured file mode. JSON SHALL accept
an array of row objects; CSV SHALL use a header row. Structured keys SHALL map to child field ids, and
invalid rows SHALL report row/column context rather than flattening into one text value.

#### Scenario: Load weather rows from JSON

- **WHEN** a shared JSON file contains city, temperature and icon values for several rows
- **THEN** the field produces the same structured list shape as manual row editing and the Repeater
  renders each row without project-specific code

### Requirement: Designer authors every Sequence page from one data surface

For an outer Sequence whose items reference compositions, the selected Sequence's Inspector SHALL
open one page-data modal that exposes every item's nested fields as editable, persistent pages. The
Variables table SHALL remain focused on fields and bindings. A page value SHALL be stored on that Sequence
item and SHALL fall back to the referenced composition's field default when absent. Preview,
Designer Canvas, exported template defaults and later namespaced operator updates SHALL resolve the
same page values.

#### Scenario: Fill all weather pages without opening Preview

- **WHEN** the author opens Page data from a Sequence containing three weather-list compositions
- **THEN** all three page groups and their structured city rows are editable and saved in the project

#### Scenario: Selected file remains attached while authoring

- **WHEN** the author chooses a page-data file, closes the modal, edits that file and reopens the Sequence
- **THEN** the selected path is still shown and Reload reads the changed file without asking for a
  second selection during that Designer session

#### Scenario: One JSON file fills the page groups

- **WHEN** the author selects a JSON file containing a `pages` array
- **THEN** page N maps to Sequence composition item N, page keys map by field id or unique title,
  nested Repeater rows use the child-derived schema, and an unknown key or excess row reports its
  page/field context instead of silently flattening data

#### Scenario: Designer generates the correct file shape

- **WHEN** an author asks to save a matching sample for a Sequence with any mix of scalar fields,
  nested compositions and Repeater rows
- **THEN** Designer writes an immediately loadable JSON document whose `pageSchemas` explains the
  exact stable keys, titles, types and row limits and whose `pages` contains one editable example
  per Sequence composition item

#### Scenario: Designer fills a long city list as one table

- **WHEN** every Sequence page references the same composition containing one flat Repeater and the
  author enters or imports 40 rows
- **THEN** Designer presents one table, splits it by the Repeater `maxItems`, and creates the exact
  number of Sequence composition pages needed without asking the author to edit JSON

#### Scenario: CG Control edits all paged rows together

- **WHEN** an operator opens a packaged homogeneous paged Repeater
- **THEN** CG Control shows one compact row summary and one generated/connected Excel source instead
  of a separate form per page
- **AND WHEN** the operator chooses **Edit rows…** while no workbook is connected
- **THEN** one wide modal shows every typed row input, retains the normal draft/Update safety, and
  redistributes rows into the authored page namespaces
- **AND THEN** **Apply** remains disabled until the modal contains a real change and transfers that
  change only to the Inspector draft
- **AND WHEN** the operator uses **Close**, ×, Escape or the backdrop before Apply
- **THEN** the modal discards its private row changes and neither the Inspector draft nor the
  applied/on-air values change

#### Scenario: A paged row table has one file owner

- **WHEN** an author saves and connects a workbook from the outer Sequence's Page data modal
- **THEN** the Sequence stores that source and becomes the sole file owner for every nested Repeater
  page without a second source picker on the child field
- **AND THEN** the author can independently choose **Allow row editing in CG Control** while keeping
  that one connected workbook
- **AND WHEN** that choice is off **THEN** CG Control renders no manual row editor,
  add/remove/reorder, Save/connect, replace or detach control for that combined table
- **AND THEN** labelled connection status, Reload, View current data and the normal staged Update
  remain available
- **AND WHEN** that choice is on **THEN** CG Control adds one compact **Edit rows…** action and stages
  those row changes behind Update without offering a second file owner
- **AND WHEN** the author detaches the Sequence workbook
- **THEN** CG Control restores the combined manual row editor and no stale child source takes over

#### Scenario: A standalone Repeater has one file owner

- **WHEN** a Repeater is not paged by a Sequence
- **THEN** Designer manages its structured workbook only through **Rows and data file…** and does not
  show the generic Dynamic / Data shared-file picker or offer **Use fixed file** for the same list
  field
- **AND WHEN** an older project already carries a Repeater fixed text source
- **THEN** Designer keeps that legacy source visible only so the author can detach it
- **AND WHEN** the workbook is connected
- **THEN** Designer separately lets the author allow or withhold CG Control row editing
- **AND THEN** CG Control shows the same connection state, Reload and View current data; it adds the
  row-edit modal only when the author allowed it, without a second Save/connect route

#### Scenario: Direct and paged workbook facts stay visually consistent

- **WHEN** a structured workbook is connected directly to a Repeater or to the outer Sequence that
  pages it
- **THEN** CG Control shows the same compact file-managed connection fact with its connected
  filename, green status icon plus ordinary **Connected** text, consistently named actions and
  Share path; a connected filename never uses the light scalar-file chip treatment
- **AND THEN** row and file actions pair a recognisable icon with their short text label so Reload,
  View, connect/save and Detach remain distinguishable without relying on icon interpretation alone
- **AND THEN** Designer shows the selected file's full Windows/UNC location together with its
  portable **CG Control file** key, while CG Control shows both that Share file key and the effective
  local/UNC path resolved by CG Bridge's current Shared files setting
- **AND THEN** Designer Preview replaces the connected direct Repeater's partial numbered row table
  with the same read-only connected-file fact it uses for a Sequence-owned table

#### Scenario: A nested Repeater routes file management to its Sequence

- **WHEN** the selected Repeater's composition is used as a page by one or more Sequences
- **THEN** its row modal remains available for inspecting defaults but file connection actions name
  the owning Sequence and are not duplicated on the Repeater

#### Scenario: Updating the selected template refreshes file ownership

- **GIVEN** CG Control has a paged Repeater row selected and its Inspector is open
- **WHEN** the same template id is updated with a package whose outer Sequence carries
  `pageDataFile`
- **THEN** the open Inspector refreshes from that channel's current catalogue without requiring the
  operator to reselect the row
- **AND THEN** it shows File managed, the authored workbook and View current data, while manual rows
  and every Save/connect action are absent

#### Scenario: Removing an authored workbook restores one clean manual route

- **GIVEN** CG Control previously auto-read a direct Repeater or outer Sequence workbook
- **WHEN** Designer detaches that workbook and the same template id is updated
- **THEN** the author-owned Connected fact and its automatic draft are removed
- **AND THEN** CG Control shows Not connected and one **Edit rows…** action, without exposing the
  complete row form in the Inspector
- **AND** a file the operator selected directly in CG Control remains attached

#### Scenario: Legacy bindings migrate once

- **GIVEN** an older project carries the same field/target binding at the scene root and on its entry
  composition, or already stores two identical composition bindings
- **WHEN** Designer opens the project
- **THEN** exactly one binding remains visible and functional
- **AND** bindings from the same field to genuinely different targets remain separate

#### Scenario: File-only rows remain inspectable without becoming editable

- **WHEN** an operator chooses **View current data** for a File-only paged Repeater
- **THEN** CG Control shows every current staged-or-applied row in one read-only, scrollable table
  using the authored column labels and numeric aliases
- **AND WHEN** a row contains a value outside the current type, range or exact choices
- **THEN** the dialog counts invalid cells, marks the exact row and column and exposes the expected
  constraint without rewriting the value or creating a draft

#### Scenario: A deleted Excel template can be regenerated

- **WHEN** an author, or an operator outside File-only mode, chooses **Save and connect Excel** for a homogeneous paged Repeater
- **THEN** Designer or CG Control writes an `.xlsx` workbook from that template's current row schema
  and values
- **AND THEN** every exact numeric/select/boolean choice is an Excel dropdown, numeric ranges carry
  spreadsheet validation, and the saved workbook is immediately shown as connected and can be
  reloaded without another file picker

#### Scenario: Sequence data starts from the authored schema

- **WHEN** a Sequence uses any supported flat or nested page-data structure
- **THEN** Designer offers **Save and connect Excel/JSON** generated from that exact structure rather
  than a free-form import action
- **AND THEN** Designer and CG Control show a green check plus the connected filename, show a
  labelled unplugged state otherwise, and use Reload for external edits

#### Scenario: Excel CSV variants import consistently

- **WHEN** Excel saves the Data sheet as UTF-8 or UTF-16 text using comma, semicolon or tab as the
  local list separator, optionally with a `sep=` directive
- **THEN** Designer and CG Control map the same headers and typed rows instead of reporting a false
  column or numeric error

#### Scenario: Reload errors identify the repair

- **WHEN** a connected file is replaced/damaged, its sheet/columns are changed, or a row contains an
  invalid value
- **THEN** the error names the selected file and classifies the problem as file type/damage,
  structure, missing value or invalid value
- **AND THEN** structural errors list expected columns while cell errors identify the data/sheet
  row, column, offending value and allowed choices or numeric range

#### Scenario: Numeric weather choices are constrained everywhere

- **WHEN** a numeric child field declares an exact allowed list such as 0, 2 and 5
- **THEN** Designer and CG Control show those values in a dropdown, and JSON/CSV imports reject
  nonnumeric values or a value absent from the list with row/column context

#### Scenario: Numeric codes have operator-facing aliases

- **WHEN** an author opens the choice editor and adds numeric Values with optional Aliases
- **THEN** each choice is edited in its own row and explicit Add, Remove and Save actions are available
- **AND THEN** invalid numbers, repeated values and repeated aliases identify the affected row
- **THEN** Designer, Preview and CG Control show the aliases while storing and applying 0 or 1
- **AND THEN** generated Excel dropdowns and CSV/JSON import use or accept the same aliases and
  normalise them back to the canonical numbers before bindings and value rules run

#### Scenario: Adding a numeric choice continues the authored pattern

- **WHEN** the choice editor contains 10, 20 and 30 and the author chooses Add choice
- **THEN** the new standard numeric input starts at 40, while an inconsistent list falls back to a
  non-duplicate value after the current maximum

#### Scenario: A connected workbook becomes older than its template

- **WHEN** an author changes a generated file's fields, limits or exact numeric choices after that
  file was connected
- **THEN** Designer and CG Control keep Reload available but show a labelled **Connected · update
  file** warning instead of the current green check
- **AND THEN** saving and connecting a newly generated file clears the warning

#### Scenario: Numeric entry and mixed row controls remain usable

- **WHEN** an unrestricted or custom-range number is edited manually
- **THEN** Designer and CG Control keep valid localized numeric text and incomplete numeric states,
  but do not let letters enter the field
- **AND WHEN** a structured row mixes text, numeric and dropdown columns in the narrow Preview panel
- **THEN** every value control receives an equal flexible cell and the existing city and temperature
  values remain visible
- **AND THEN** an editable numeric cell uses the same active field background, border and opacity as
  its text sibling rather than resembling a disabled input

#### Scenario: Operator data derives the required page count

- **WHEN** manual rows or a reloaded workbook contain a different number of rows than the Sequence
  pages originally packaged by the template
- **THEN** CG Control retains every valid row and the runtime derives exactly
  `ceil(row count / rows per page)` pages without requiring a Designer round trip
- **AND THEN** authored page identities are reused first, additional pages receive stable generated
  identities, and pages beyond the new count leave the cycle when data shrinks
- **AND** 5 rows at 8 per page produce one page, 32 produce four pages and 33–40 produce five pages

#### Scenario: Combined rows show live page boundaries and local dirty state

- **WHEN** an operator opens **Edit rows** or **View current data** for a paged Repeater
- **THEN** a labelled visual separator identifies every derived page chunk
- **AND WHEN** rows are added, removed or reloaded **THEN** the separators and page summary update
  from the current data without closing the modal
- **AND WHEN** Edit rows is applied to the Inspector draft **THEN** a dirty dot appears beside the
  combined Sequence row heading, identifying where the unapplied item edit lives

#### Scenario: The author locks selected Repeater columns in CG Control

- **GIVEN** a direct Repeater or a Sequence-owned Repeater exposes several child fields
- **WHEN** the author clears CG Control edit authority for selected columns
- **THEN** CG Control keeps those columns visible but disables their manual controls
- **AND** Add, Remove and Reorder are disabled because row identity remains author-owned
- **AND WHEN** CG Control loads or reloads a workbook **THEN** locked columns retain their authored
  row values while editable sibling columns accept the workbook values
- **AND WHEN** that workbook has a different row count **THEN** CG Control refuses it without staging
  a partial or default-filled row set
- **AND** legacy columns without an explicit lock remain editable

#### Scenario: Operator data overrides an authored page

- **WHEN** a namespaced update supplies a value for a page that already has an authored default
- **THEN** the supplied value wins for that page while unspecified page fields retain their authored
  or child-composition defaults

#### Scenario: SVG has a visible image import route

- **WHEN** an author imports an image through Project Assets or Shared Library
- **THEN** the native picker explicitly lists `.svg` and `image/svg+xml` alongside the supported
  raster formats
- **AND THEN** a new image field accepts SVG without an undocumented configuration step

#### Scenario: An author creates a dynamic image without editing project internals

- **WHEN** an author selects any Image element and assigns a Data key in Dynamic / Data
- **THEN** Designer creates an image field and an image binding to that element through the same
  visible Inspector workflow used by text fields
- **AND WHEN** that composition is used as a Repeater row
- **THEN** the field appears as an image column whose rows choose assets from Project Assets or
  Shared Library rather than requiring an internal asset id

#### Scenario: An author chooses how operators replace an image

- **WHEN** an Image Data key is configured as allowed choices, Windows Browse or both
- **THEN** Designer Preview and CG Control render exactly that control set for scalar and Repeater
  image values
- **AND** neither surface exposes the internal asset id or filename as an editable text field
- **AND** the allowed choices preserve project/shared ownership and join the exported asset closure
- **AND** Browse accepts SVG alongside PNG, JPG and WebP

#### Scenario: Image choices are recognizable before selection

- **WHEN** an author or operator chooses an image in Designer, Preview, a direct field, a Repeater
  row, a source replacement, a rule, a step, a poster or a ticker separator
- **THEN** the closed control shows a compact thumbnail of the current image without increasing the
  data-row height
- **AND WHEN** the picker opens **THEN** every available Project Asset and Shared Library image is
  shown with its source, name and uncropped thumbnail rather than in a filename-only combo
- **AND WHEN** no image is selected **THEN** the bound image element is absent from Preview/output;
  no broken-image glyph or authored filename is painted
- **AND WHEN** current file-only data is viewed **THEN** an image column shows the resolved compact
  thumbnail instead of its filename
- **AND THEN** picker/table previews use small session-cached derivatives with bounded conversion
  concurrency, while the canvas, export and playout retain the original image

#### Scenario: A selected multi-frame preset keeps the preset row stable

- **GIVEN** a template exposes several Look presets in CG Control
- **WHEN** one preset becomes selected, enters PVW or is on air and gains its state wording
- **THEN** every preset button keeps an equal grid cell and the same row placement
- **AND** the pressed treatment alone communicates ordinary selection; no `SELECTED — A TAKE SHOWS
THIS` sentence is rendered
- **AND** real PVW/on-air wording wraps inside that button instead of widening it or pushing it onto
  a separate line

### Requirement: Row values can drive ordered visual rules

An element SHALL optionally carry ordered conditional rules whose input is a field in the current
scope, whose comparator is `=`, `!=`, `<`, `<=`, `>`, `>=` or inclusive `between`, and whose single
effect changes image, colour/fill or visibility. The first matching rule for each target property
SHALL win and no match SHALL restore the authored value.

#### Scenario: Rule authoring does not crowd Inspector

- **WHEN** an author selects an element that supports value rules
- **THEN** Inspector shows a compact rule count/status and an Edit rules action immediately after
  Dynamic / Data when that section exists, while input, conditions, effects, ordering and removal
  are edited in a dedicated modal

#### Scenario: Active rules remain obvious at a glance

- **WHEN** one or more rules are defined for the selected element
- **THEN** Inspector shows a visually distinct active state and rule count in the section header,
  including while the section body is collapsed

#### Scenario: Temperature changes text colour

- **WHEN** a Repeater row's numeric temperature enters an authored range
- **THEN** the first matching colour rule applies to that row only and updates live when the value changes

#### Scenario: Temperature changes text and background together

- **WHEN** the same temperature matches a text-colour rule and a background-colour rule
- **THEN** both effects apply, while two matching rules for the same property still use authored order

#### Scenario: The starter reveals the rule on the element it changes

- **WHEN** an author selects the province-weather temperature strip
- **THEN** that strip owns and displays the fill rules responsible for its colour
- **AND WHEN** the author selects the temperature number
- **THEN** the number owns only its text-colour rules; the strip does not appear to change through a
  hidden cross-element rule

#### Scenario: Weather code selects an icon

- **WHEN** a row's weather-code field matches an authored image rule
- **THEN** the target image in that row uses the rule's asset and no other row is changed

#### Scenario: Rule conditions use the numeric choice list

- **WHEN** a rule input is a numeric field with exact values and optional aliases
- **THEN** each condition value uses that same dropdown and alias text while the stored condition
  remains numeric
- **AND WHEN** a previously stored rule value is no longer allowed
- **THEN** the editor keeps it visible as unavailable until the author selects a replacement

#### Scenario: A later update matches no rule

- **WHEN** a value previously matched an image, colour or visibility rule and is updated to a value
  that matches none
- **THEN** the affected property returns to its authored value instead of retaining the old branch

#### Scenario: Deleting a rule input is explicit and atomic

- **WHEN** an author deletes an element whose Data key supplies Value rules on surviving elements
- **THEN** Designer warns with the affected element names before deleting anything
- **AND WHEN** the author confirms
- **THEN** Designer deletes the source element and every rule set that depended on the removed field
  in one undoable action
- **AND** the rule editor never substitutes an unrelated field for the missing input

#### Scenario: Value rule color labels use product spelling

- **WHEN** the author opens the Value rules modal and chooses an effect
- **THEN** text, background, fill and stroke effects use `color`, not `colour`

### Requirement: Dynamic Repeater images are export assets

Both exporters SHALL include image assets reachable through image-field defaults, authored Repeater
rows/list defaults and conditional-rule image branches, even when no static image element directly
uses that asset.

#### Scenario: An icon appears only in one conditional branch

- **WHEN** an image asset is referenced only by a conditional rule that is false at export time
- **THEN** `.vcg` and single-file HTML still contain that asset and it resolves when the rule becomes true

### Requirement: Landing starter names and order match operator workflows

The Designer SHALL show the owner's eight core starter workflows first and SHALL use the same
Persian name for each Landing card, imported project and root composition.

#### Scenario: The owner opens the Landing catalog

- **WHEN** the Designer Landing page renders
- **THEN** the first eight cards, in order, are `لوگو شبکه`, `عنوان معرفی`,
  `زیرنویس حرکت افقی`, `زیرنویس با ساعت`, `زیرنویس حرکت عمودی`, `نمایش تلاوت قرآن`,
  `چهارقاب` and `شمارش معکوس اذان`
- **AND WHEN** one of those starters is opened
- **THEN** its project and root composition use the same Persian title as its card

### Requirement: Alternating row fill respects the row silhouette

An alternating Repeater fill SHALL remain inside the authored full-row plate, including while the
row's own entrance or exit effect is active.

#### Scenario: The child row plate has rounded corners

- **GIVEN** the Repeater child composition has a full-size rectangular plate with corner radii
- **WHEN** Alternating row background is enabled
- **THEN** each painted alternate row is clipped to the plate's scaled corner radii
- **AND** no square background corner protrudes behind the rounded plate

### Requirement: Image placement has one visible route

Designer SHALL omit the obsolete Image loader from canvas tool presentations while retaining image
elements, Project Assets placement and project/shared source selection.

#### Scenario: The author reviews canvas tools

- **WHEN** the full toolbar, compact More menu or legacy tool rail is rendered
- **THEN** no Image loader action is offered
- **AND** existing image elements still open and can select a Project Asset or Shared Library source
