# runtime-caspar-bridge — delta for take-refusal-surfaces

## ADDED Requirements

### Requirement: A refused command is recorded beside its code

When an operator action is refused by CasparCG, the audit entry the bridge records SHALL carry,
beside the refusal code, the AMCP line that was refused — its verb, its target and its first
quoted argument intact, later quoted arguments elided, capped at 200 characters. An action
refused by the bridge before any line reached the wire SHALL record no command. An accepted
action SHALL record no command.

#### Scenario: A take whose CG ADD is refused names the ADD

- **WHEN** a take's pre-roll `CG 1-72 ADD 0 "tpl" 0 "…"` is answered `404` **THEN** the audit
  entry reads `outcome: failed`, `errorCode: amcp-404` and `command` beginning
  `CG 1-72 ADD 0 "tpl" 0 `

#### Scenario: A refusal before the wire carries no command

- **WHEN** a take is refused `unknown-item` **THEN** the audit entry carries no `command`

#### Scenario: The payload is elided, the URL is kept

- **WHEN** the refused line is `CG 1-99 ADD 0 "http://host:port/template/id?cw=1920&ch=1080" 0
"{…}"` **THEN** the recorded command keeps the URL and replaces the data argument with `"…"`

### Requirement: The boot line names the template count

At boot the bridge SHALL report how many templates its registry hydrated from the persist
directory, how many persisted files it skipped as unusable, and the directory, on the CLI's boot
line beside the bank, the sources and the ledger. The bridge handle SHALL expose the same
reading.

#### Scenario: Two records and one unusable file

- **WHEN** the templates directory holds two valid records and one file that is not a record
  **THEN** the handle reports `loaded: 2, skipped: 1` with the directory, and the boot line says so

#### Scenario: A first boot

- **WHEN** the templates directory does not exist yet **THEN** the handle reports
  `loaded: 0, skipped: 0` and the boot line says nothing can go to air until a `.vcg` is imported
