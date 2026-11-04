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
- **THEN** CG Control shows one structured table and one generated/connected Excel source instead of a separate form
  per page, retains the normal draft/Update safety, and redistributes rows into the authored page
  namespaces

#### Scenario: Paged rows are authored as File only

- **WHEN** an author enables **File only in CG Control** for a homogeneous paged Repeater from the
  Sequence Page data modal
- **THEN** the nested list field stores the canonical File-only policy and CG Control renders no row
  inputs, add, remove or reorder controls for the combined pages
- **AND THEN** connected-file status and Reload remain available, while Save/connect/replace/detach
  actions are absent and loaded values still wait for Update
- **AND WHEN** no workbook is connected
- **THEN** the panel says Not connected and directs the operator to connect the workbook in Designer

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

#### Scenario: Operator CSV exceeds the packaged capacity

- **WHEN** a CSV has more rows than the Sequence pages packaged by the template
- **THEN** CG Control keeps the current values and tells the operator to add pages in Designer and
  re-import, rather than silently dropping rows

#### Scenario: Operator data overrides an authored page

- **WHEN** a namespaced update supplies a value for a page that already has an authored default
- **THEN** the supplied value wins for that page while unspecified page fields retain their authored
  or child-composition defaults

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
