## ADDED Requirements

### Requirement: An import whose id the channel already lists asks Update or Add as a new template

When a `.vcg` is imported and the channel already lists a template with its package id, CG Control SHALL ask in the
Templates dialog's own message region — `“<name>” is already on this channel.` — with two answers: `Update “<name>”`
(the default, first and primary: the same template, its rows and Source defaults kept) and `Add as a new template` (a
new library id; the name takes ` (2)`, ` (3)`… when it would clash). Closing the dialog SHALL answer neither and
import nothing. The success line SHALL say which happened: `Updated · <name>` or `Imported · <name>`. A row already on
air SHALL keep the version its page was served from until its next `CG ADD` (CG Bridge's holds; unchanged). A
template added as new SHALL be rebuilt under its own library id when the console's runtime changes.

#### Scenario: Two compositions of one project side by side

- **WHEN** two packages with different ids are imported on one channel
- **THEN** both are listed and nothing is asked

#### Scenario: Add as a new template

- **WHEN** a package whose id the channel lists is imported and the operator answers Add as a new template
- **THEN** a second template is listed, named with ` (2)`, under its own id, and the line reads `Imported · <name> (2)`

#### Scenario: Update

- **WHEN** the operator answers Update
- **THEN** the channel still lists one template under that id, at the new version, and the line reads
  `Updated · <name>`

#### Scenario: Declined

- **WHEN** the dialog is closed while the question is open
- **THEN** nothing is imported
