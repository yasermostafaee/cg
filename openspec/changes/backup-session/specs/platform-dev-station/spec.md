## ADDED Requirements

### Requirement: `pnpm dev:station --fake --pair` SHALL run a fake engine pair

`--pair` with `--fake` SHALL start a second fake engine — its own ES256 key, its own `cg-admin` password,
its own CasparCG stand-in on its own AMCP port and its own fake API port — and SHALL declare it as the
bridge's server B, with the backup engine's address pointing at that fake. Both passwords SHALL be printed
for the run, and each engine's sign-in SHALL refuse the other's password. Loopback only, as `--fake` is.

#### Scenario: Two engines on one PC

- **WHEN** the owner runs `pnpm dev:station --fake --pair` **THEN** the console reaches a station whose
  status bar shows `PRIMARY A` and `BACKUP B` **AND** «Sign in CG Bridge…» lists both engines, each signed
  in with the password printed for it
