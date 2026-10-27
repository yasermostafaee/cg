# designer-dynamic-fields — authored file-source authority

## ADDED Requirements

### Requirement: The author may constrain a file-capable field's input and file independently

Designer SHALL offer independent **File only** and **Lock file** policies for eligible fields.
Eligible fields are text, multiline and text-list fields that allow file input; image page-lists are
not eligible. File only SHALL declare that CG Control may not manually edit the value or list shape.
Lock file SHALL be available only when the author supplied a valid relative CG Bridge path, and
SHALL declare that the operator may not choose, replace or detach that file. Neither policy SHALL be
expressible on a field kind that cannot take text-file content.

The template SHALL store the relative bridge path and policy, not the file bytes or an absolute
machine path. Older fields with only `allowFileSource` SHALL parse and round-trip unchanged.

Designer SHALL use a native Windows file picker to choose one text file directly inside the shared
folder configured as CG Bridge `textSourceRoot`, SHALL store only its filename relative to that root,
and SHALL show the chosen file's current content for author verification. Preview bytes and the UNC
root SHALL NOT be stored in the template. Text-list fields SHALL also offer an authored delimiter
choice. Designer SHALL apply the selected bytes to that field on the authoring canvas without
changing its stored default, and SHALL re-interpret a list immediately when its delimiter changes.
The file-preview modal SHALL link directly to delimiter management. In the installed Windows app it
SHALL label and show the complete drive/UNC path separately from the Bridge-relative saved path. In
browser mode, where the platform withholds absolute paths, it SHALL explicitly say the full path is
unavailable rather than presenting a basename as a full path.

Designer SHALL offer a persistent delimiter catalogue from the Edit menu. The author SHALL be able
to add, edit, remove and reset choices, including multi-character values and printable `\n`/`\t`
escapes. A field SHALL store the delimiter value rather than a catalogue id.

When **File only** and **Lock file** are both intended, Designer SHALL also offer a direct fixed-file
workflow without requiring the author to invent a Data key. The workflow SHALL be available to a
keyless element and to an element that already has an ordinary Data key. Designer MAY synthesize the
field and binding required by the runtime, but that implementation id SHALL NOT appear in the Data
key input or Variables table. Converting an existing Data-key element SHALL reuse and rename that
field/binding in place and SHALL NOT leave its former field as a second operator input. A fixed
text-list source SHALL store an explicit delimiter (new line initially)
and SHALL NOT offer the dynamic field's **CG Control default** choice. Removing the fixed source
SHALL remove its synthesized field and binding. This workflow SHALL appear as its own always-visible
Inspector section, not as a child of Dynamic/Data. Once chosen, that section SHALL remain visible and
show the selected fixed source and its preview/settings entry point; Dynamic/Data SHALL stay absent
for the reserved internal field. Its entry control SHALL be a **Use fixed file** checkbox: enabling it
SHALL reveal Browse and immediately hide the authored Items/Rows editor; disabling it SHALL remove an
existing fixed source and restore Items/Rows.

The selected file's current session value SHALL be shared by the canvas, Dynamic/Data file preview
and the composition Preview. Moving selection away and back SHALL NOT discard those bytes. While that
session preview exists, those surfaces SHALL show the file-derived value rather than authored
fallback items. Raw content, delimiter selection and interpreted rows SHALL live in one large file
preview modal rather than consuming Inspector height. The duplicate Inspector Items/Rows section
SHALL be hidden while that file preview is current. Without a selected file, Items/Rows SHALL appear
immediately after Filter and before Dynamic/Data. The chosen native Windows/UNC path SHALL be shown
for author verification but SHALL remain absent from the saved project/template.

Designer composition Preview SHALL treat every **File only** field as read-only: it SHALL show the
current scalar value or interpreted rows but SHALL render no edit, add, remove, reorder or per-field
update control for that field.

The fixed-file Inspector section SHALL keep nonessential teaching behind one information action and
use CG Control terminology rather than exposing its service implementation. The reserved internal
field id and binding SHALL remain in saved/runtime data but SHALL NOT appear in Variables or the
selected element's Bindings section.

The file-preview modal SHALL offer Reload. In the installed app Reload SHALL re-read the same file
from disk/share without another picker, reapply the current delimiter and refresh canvas and
composition Preview. The native command SHALL refuse any absolute path not selected in the current
Designer session. Browser mode SHALL retain a file-system handle when supported and obtain a fresh
file snapshot for each Reload rather than depending on an expiring input-file reference. The modal
SHALL describe the portable saved name in operator language as destined for CG Control.

#### Scenario: File only and lock file are independent

- **WHEN** the author enables File only without Lock file
- **THEN** the field records only the input restriction and the operator remains allowed to change
  its file

#### Scenario: Lock file requires an authored safe relative path

- **WHEN** no file has been selected below the shared root
- **THEN** Lock file cannot be saved and Designer asks the author to choose a shared file

#### Scenario: Browse stores a portable filename and previews live content

- **WHEN** `textSourceRoot` is the shared `newsroom` folder and the author chooses
  `lower-third.txt` from that folder
- **THEN** Designer shows its current text, stores `lower-third.txt`, and stores neither the UNC root
  nor the file bytes

#### Scenario: Text-list delimiter is authored

- **WHEN** the author chooses pipe as a list file's delimiter
- **THEN** the field policy stores `|` and non-list field variants cannot carry that setting

#### Scenario: Selected file content becomes the field's authoring preview

- **WHEN** the author selects a file containing `one|two` and chooses pipe for a text-list field
- **THEN** Designer shows two interpreted rows and the canvas renders those rows, while the field's
  authored default and exported package contain no copy of the selected bytes

#### Scenario: A custom delimiter is managed independently of templates

- **WHEN** the author adds `double colon` with value `::` from Edit → Manage delimiters
- **THEN** list fields offer that choice and store `::`; later renaming or removing the catalogue
  entry does not alter a field already using it

#### Scenario: A fixed locked file needs no Data key

- **WHEN** a keyless text or text-list element chooses **fixed file**
- **THEN** Designer creates the runtime connection, authors File only + Lock file, shows no Data key
  and does not list the reserved internal field under Variables; a text-list starts with an explicit
  new-line delimiter and shows no **CG Control default** option

#### Scenario: An existing Data key becomes one fixed field

- **WHEN** an eligible element with an ordinary Data key chooses a fixed file
- **THEN** Designer converts that field and binding to the reserved fixed-file connection in place,
  and CG Control receives one connected file field rather than the old manual field plus the file

#### Scenario: Fixed file is not presented as a dynamic field

- **WHEN** a keyless eligible element is selected before or after choosing its fixed file
- **THEN** the fixed-file action/status is visible in its own Inspector section and the reserved
  internal field does not produce a Dynamic/Data section

#### Scenario: Fixed-file checkbox changes the authoring mode before Browse

- **WHEN** the author enables Use fixed file on a keyless ticker, sequence or repeater
- **THEN** Browse becomes available and Items/Rows is hidden immediately
- **WHEN** the author disables it
- **THEN** any fixed source is removed and Items/Rows returns

#### Scenario: File preview survives selection and replaces fallback items everywhere

- **WHEN** a ticker whose authored fallback has three items selects a file interpreted as two items,
  then the author selects another element and returns and opens composition Preview
- **THEN** the large file preview modal, canvas and composition Preview all show those same two file
  items without selecting the file again, and the duplicate Inspector Items section stays hidden

#### Scenario: File-only content cannot be edited in composition Preview

- **WHEN** the author opens composition Preview for a File-only list field
- **THEN** the interpreted rows are visible but edit, add, remove, reorder and per-field update
  controls are absent

#### Scenario: Inspector sections keep a predictable order

- **WHEN** a ticker, sequence or repeater has no current selected-file preview
- **THEN** its Items/Rows section appears after Filter and before Dynamic/Data

#### Scenario: Native path is visible but portable output stays relative

- **WHEN** the Windows picker selects `\\newsroom\shared\headlines.txt`
- **THEN** Designer shows that full path to the author while the field policy stores only
  `headlines.txt`

#### Scenario: Browser path limitation is explicit

- **WHEN** the same selection is made in browser mode and the platform exposes only `headlines.txt`
- **THEN** Designer labels it as the selected file and explains that the installed app is required to
  verify the full Windows/UNC path

#### Scenario: Delimiter management is reachable from the file preview

- **WHEN** the author is reviewing a list file in the file-preview modal
- **THEN** a Manage delimiters action opens delimiter management without requiring the Edit menu

#### Scenario: A saved-again newsroom file is refreshed in place

- **WHEN** another application changes the selected file and the author presses Reload
- **THEN** Designer re-reads that session-selected file, reapplies the current delimiter and updates
  the parsed fields, canvas and composition Preview without opening Browse again

#### Scenario: Browser reload retains permission to the selected file

- **WHEN** browser mode supports file-system handles and the author chooses a shared text file
- **THEN** Designer retains that handle for the session and each Reload obtains the file's latest
  snapshot without failing on an expired input-file reference

#### Scenario: Fixed-file implementation details stay out of the Inspector

- **WHEN** a fixed file creates its reserved runtime field and binding
- **THEN** the Inspector shows neither the reserved id nor its binding, and explanatory prose is
  available from one information action instead of occupying the narrow panel

#### Scenario: Policy survives project and package round trips

- **WHEN** a project carrying both policies and a bridge path is saved/reopened or packed/unpacked
- **THEN** the same field policy and relative path are present without embedded file content
