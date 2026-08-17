# runtime-ui

## ADDED Requirements

### Requirement: The audit record is on disk and survives a bridge restart

Auditable operator actions SHALL be appended to a durable record, so that "who put what on air, and
did the server accept it" can be answered the next day.

The record's location SHALL follow the existing bridge store convention — a CLI flag with a default
under the bridge's own configuration directory — and SHALL NOT live where the template registry
reads every file as a template.

#### Scenario: An action recorded before a restart is still there after it

- **WHEN** an auditable action occurs, the bridge is restarted, and the Audit log is opened
- **THEN** the action is still listed

#### Scenario: The action set has ONE definition

- **WHEN** the operator filters the Audit log by action
- **THEN** the options offered are derived from the one schema action set, so an action cannot be
  writable but unfilterable

### Requirement: A failed audit write never takes the station off air

An audit write that fails SHALL NOT refuse, delay or alter the operation being recorded. The writer
SHALL report the failure and keep trying, and the operation SHALL proceed.

This is deliberately the OPPOSITE of the configuration stores, where an unusable file is a hard boot
failure: those files are preconditions for correct playout, while an audit entry is a record of what
already happened and nothing downstream reads it to decide what to send.

#### Scenario: A take succeeds while the audit log cannot be written

- **GIVEN** the audit file cannot be written (permission denied, disk full)
- **WHEN** the operator takes a graphic to air
- **THEN** the take proceeds normally, and the write failure is reported rather than raised

### Requirement: The Audit log tells its three empty states apart

An empty Audit log SHALL distinguish **no writer configured**, **the writer is failing**, and
**readable and genuinely empty**. The wording "No audit entries yet" SHALL appear only in the third.

A surface that cannot tell those apart asserts a fact it cannot know: a negative observation is not a
result until the instrument is proven live.

#### Scenario: No writer is configured

- **WHEN** the bridge runs without an audit path and the operator opens the Audit log
- **THEN** it says no audit record is configured, and does NOT say there are no entries

#### Scenario: The writer is failing

- **WHEN** the writer has recorded write failures and the operator opens the Audit log
- **THEN** it surfaces that the record is failing, with the reason, and does NOT say there are no
  entries

#### Scenario: The record is readable and genuinely empty

- **WHEN** the record is readable and contains nothing
- **THEN** — and only then — the panel says there are no audit entries yet
