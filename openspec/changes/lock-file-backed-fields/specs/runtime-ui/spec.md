# runtime-ui — file-only and locked live-file fields

## ADDED Requirements

### Requirement: CG Control obeys the template author's file-source authority

CG Control SHALL remove the manual value editor for a file-only field, including list add/remove
controls. It SHALL keep file choose/replace/detach available unless the file is also locked. For a
locked file it SHALL show the authored relative path as a fact and offer explicit Reload, but SHALL
render no choose, replace or detach route.

Every explicit Reload of an authored bridge file SHALL read the file's current UTF-8 content and
stage only that field through the existing draft path. Reading SHALL NOT itself update an on-air
item. A failed read SHALL retain current draft/applied content and show a legible error naming the
file.

For an unlocked text-list field with an authored delimiter, CG Control SHALL initially enable
splitting and use that delimiter while preserving the existing operator split controls. When the
file is locked, CG Control SHALL enforce the authored split mode and delimiter, show it as a fact,
and render no split toggle, delimiter picker or delimiter-management action for that field.

CG Control SHALL keep potentially large file content and interpreted fields out of the Inspector.
It SHALL offer a large file-preview modal that shows current raw content and parsed fields side by
side, plus the canonical Windows/UNC path returned by CG Bridge for operator verification. The full
path SHALL NOT be persisted into the template or operator state. An unlocked list's split and
delimiter controls SHALL live in that modal; a locked list SHALL
show its authored interpretation there only as a non-interactive fact. Reading through the preview
modal SHALL NOT stage or apply a value.

CG Control's imported field form SHALL include only fields connected to a render target in their
owning scene/composition. An unbound authoring field, including a former Data key orphaned by an
older fixed-file conversion, SHALL NOT render as an operator input.

#### Scenario: File-only removes every manual edit route

- **WHEN** a text, multiline or list field is authored File only
- **THEN** no manual input, add-item or remove-item control renders, while its permitted file
  controls remain

#### Scenario: A locked bridge file is an author-owned fact

- **WHEN** a field locks `news/lower-third.txt`
- **THEN** CG Control shows that path and Reload, with no choose, replace or detach action

#### Scenario: Reload stages current bytes but does not take them on air

- **WHEN** another process saves new UTF-8 content and the operator presses Reload
- **THEN** the new content becomes that field's pending value and reaches air only after the normal
  Update action

#### Scenario: Legacy file grants are unchanged

- **WHEN** a field carries `allowFileSource` but no file policy
- **THEN** the existing manual editor, local picker, persistence, detach and Reload behaviour remain
  unchanged

#### Scenario: Authored delimiter seeds a list file

- **WHEN** a text-list file is authored with the pipe delimiter
- **THEN** its initial CG Control attachment splits on `|`, and the operator may still adjust the
  split setting

#### Scenario: Lock file also locks list interpretation

- **WHEN** a text-list field locks its authored file with pipe as its delimiter
- **THEN** CG Control shows pipe as a fact, always splits that source on `|`, and offers no split or
  delimiter control

#### Scenario: File inspection stays out of the Inspector

- **WHEN** an operator opens **View content…** for an attached scalar or list file
- **THEN** a large modal shows the current file path, bytes and interpreted field value while the
  Inspector remains compact and no value is staged or applied

#### Scenario: Unlocked list interpretation is managed in the preview modal

- **WHEN** an operator opens an unlocked list file and changes its split or delimiter setting
- **THEN** the modal immediately reinterprets the already-read content without adding those controls
  to the Inspector or applying the field

#### Scenario: A legacy orphan does not become an operator input

- **WHEN** an imported template contains a bound fixed-file field and an unbound former Data-key
  field
- **THEN** CG Control shows only the bound fixed-file field
