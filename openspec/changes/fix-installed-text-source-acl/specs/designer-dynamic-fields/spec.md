# designer-dynamic-fields — installed text-source command access

## ADDED Requirements

### Requirement: The installed Designer may execute its confined text-source commands

The installed Designer SHALL grant its bundled main window access to the native
`pick_text_source_file` and `reload_text_source_file` commands. It SHALL NOT replace those narrow
commands with a broad filesystem permission. Reload SHALL retain the existing rule that only a file
selected by the native picker in the current app session may be re-read.

Every custom command declared by the Designer and CG Control desktop shells SHALL have a matching
allow permission in that shell's capability, so adding a registered handler without packaged-window
access fails before an installer is delivered.

#### Scenario: Installed Browse reaches the native picker

- **WHEN** an author presses **Browse shared file…** in the installed Designer
- **THEN** the native Windows picker opens instead of an ACL refusal

#### Scenario: Installed Reload reaches the confined reader

- **WHEN** the installed Designer reloads a file selected in the current app session
- **THEN** the current bytes are read through the native command, while an unselected path remains refused

#### Scenario: Desktop command and capability declarations cannot drift

- **WHEN** either desktop shell registers or removes a custom command
- **THEN** its source contract requires the same command set in that shell's capability permissions
