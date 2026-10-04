## ADDED Requirements

### Requirement: «Sign in CG Bridge…» SHALL name each engine with its state, and sign each in with its own password

The dialog SHALL list the station's engines — `Primary engine` and, with a server B, `Backup engine` — each
with its address and its state in words (`R-085`): signed in (with the account), needs a station admin to sign
in, CG not licensed on this engine, AMCP waiting for this engine's «تأیید», unreachable, another CG Bridge
drives its CasparCG, or the engine's own refusal. A station admin SHALL choose an engine and sign it in once
with that engine's account and password; the dialog keeps no password after the request. One line SHALL say
where each password is read — each engine's own «تنظیمات ← اتصال به CG Control» — and the dialog SHALL carry
no other prose. It SHALL be built from the shared primitives only. The banner that opens it SHALL show while
either engine needs a station admin's sign-in, naming the engine when it is the backup.

#### Scenario: Two engines, each with its own state

- **WHEN** a station admin opens «Sign in CG Bridge…» on a station with a server B **THEN** it lists
  `Primary engine` and `Backup engine`, each with its address and its state in words
- **AND WHEN** the admin chooses `Backup engine` and signs in with its password **THEN** the request names the
  backup engine, and the primary engine's session is untouched

#### Scenario: The backup needs a sign-in

- **WHEN** the primary engine is signed in and the backup engine needs a station admin **THEN** the banner
  says CG Bridge needs a station admin to sign in on the backup engine, and a station admin gets the dialog

### Requirement: The status bar SHALL say an engine's CG Bridge problem beside that engine's server

Beside `PRIMARY A` / `BACKUP B`, the status bar SHALL carry one chip for an engine whose CG Bridge session
needs attention — needs a sign-in, CG not licensed, AMCP waiting for approval, unreachable, refused, its core
held or shared — in words, keyed to that engine's server label, with the full sentence on its `title`. A
signed-in engine SHALL carry no chip (health is the absence of an alarm).

#### Scenario: The backup's license

- **WHEN** the backup engine's state is `not-licensed` **THEN** a chip beside `BACKUP B` says CG is not
  licensed on engine B **AND** the primary's pill and every control are unchanged

#### Scenario: Both signed in

- **WHEN** both engines are signed in **THEN** the status bar carries no engine chip

### Requirement: The check's Sign-in group SHALL carry one line per engine

With a server B, the connection check's Sign-in group SHALL carry a line for the backup engine's CG Bridge
session (`bridge-session-backup`) beside the primary's (`bridge-session`), in first-run and in Station setup:
passed when signed in, waiting while it needs a station admin's sign-in, and failed in words otherwise.

#### Scenario: The backup's line

- **WHEN** a station admin runs the check on a station whose backup engine needs a sign-in **THEN** the
  Sign-in group reads the backup engine's line as waiting for a station admin
