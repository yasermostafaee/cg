# runtime-ui — delta (a file source that survives a refresh; a configurable delimiter picker)

## ADDED Requirements

### Requirement: A field's file attachment survives a page refresh

A field's attached source — the file itself, the split flag and the delimiter — SHALL be
persisted durably and restored when the page is loaded again, so an operator who refreshes (or
whose tab reloads) does not have to re-pick the file. The attachment is restored onto the SAME
field it was attached to, identified by the item id and field path; item ids are durable across
a reload because the stack's retained intent persists them.

Where the browser cannot restore READ permission for a persisted file without a user gesture,
the restored attachment SHALL be shown with its file NAME and an explicit affordance to grant
access, and SHALL NOT be read from until access is granted. It SHALL NEVER be presented as a
working attachment, and the field's current value SHALL NEVER be replaced by stale content
standing in for the file.

A persisted attachment whose item is no longer on the stack SHALL be discarded, so durable
storage cannot accumulate handles for fields that no longer exist.

A restore SHALL NOT overwrite an attachment made in the current session: the operator's most
recent choice wins.

Persistence is best-effort: where durable storage is unavailable the affordance SHALL keep
working exactly as it did before, attaching and reading normally for the life of the session.

#### Scenario: The file is still attached after a refresh

- **WHEN** an operator attaches a file to a field, then reloads the page **THEN** the field
  still names that file, still shows its split flag and delimiter, and still offers Reload

#### Scenario: A restored attachment that needs permission says so

- **WHEN** a restored attachment's read permission did not survive the reload **THEN** the field
  shows the file name together with a legible statement that access must be granted, and offers
  the grant as an explicit action — **AND** nothing is read from the file, and the field's
  current value is untouched, until access is granted

#### Scenario: Granting access restores normal use

- **WHEN** the operator grants access to a restored attachment **THEN** the field returns to its
  ordinary state and Reload re-reads the file's current content

#### Scenario: A removed item's attachment does not linger

- **WHEN** an item leaves the stack **THEN** its persisted attachments are discarded, and a later
  session does not restore them

#### Scenario: A file picked in this session is not overwritten by a restore

- **WHEN** the operator attaches a file and a restore for the same field arrives afterwards
  **THEN** the file the operator just picked remains attached

### Requirement: The split delimiter is chosen from a configurable list, never typed

The delimiter for a split list field SHALL be chosen from a PICKER that shows every configured
delimiter at once, each identified by its NAME rather than by the characters it splits on. The
control SHALL NOT accept free text: a hand-typed delimiter is a way to produce a split nobody
intended, and the list is the only way a delimiter enters the product.

The configured list SHALL be editable — delimiters can be added with a name, removed, and reset
to the shipped set. Operator-added entries SHALL survive a page refresh AND a restart of the
bridge process: the list describes the operator's own source files, not the playout server, and
SHALL NOT be stored anywhere a server restart can take it away. The list SHALL NEVER be reducible
to nothing: a split field must always have something to split on.

Removing a delimiter SHALL NOT change how any field already using it splits — that field keeps
its delimiter, and keeps it selectable.

The shipped list SHALL include a Persian comma, because Persian source copy uses it.

#### Scenario: Every configured delimiter is visible without typing

- **WHEN** the operator opens the delimiter control on a split list field **THEN** every
  configured delimiter is listed by name, with no filtering step and nothing to clear first

#### Scenario: The delimiter cannot be free-typed

- **WHEN** the operator interacts with the delimiter control **THEN** they can only select an
  existing entry; typing a delimiter inline is not possible

#### Scenario: Adding a delimiter makes it immediately available

- **WHEN** the operator adds a delimiter with a name **THEN** it appears in the picker at once
  and is still there after a page refresh

#### Scenario: An operator's delimiters outlive a bridge restart

- **WHEN** the bridge process is stopped and started again **THEN** every delimiter the operator
  added is still listed, because the list is held browser-side and no bridge state carries it

#### Scenario: The list cannot be emptied

- **WHEN** the operator tries to remove the last remaining delimiter **THEN** the removal is
  refused with a legible reason and the delimiter remains

#### Scenario: Removing a delimiter leaves attached fields alone

- **WHEN** a delimiter is removed while a field is using it **THEN** that field keeps splitting on
  it, and its control still shows it as the current selection
