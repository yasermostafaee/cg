# runtime-template-library Delta

## MODIFIED Requirements

### Requirement: Import a `.vcg` template into the runtime library

Before strict manifest/scene verification, Runtime SHALL read the forward-compatible manifest
compatibility header and compare `minRuntimeVersion` with its rendering contract. A shortfall SHALL
register nothing and SHALL name the package, required Runtime and installed Runtime with an update
remedy. This preflight SHALL inflate only `manifest.json`, not package assets. If the header is
missing or malformed, the established full verification path SHALL remain the authority for
damaged, non-template and invalid package errors.

#### Scenario: Older Runtime receives an actionable refusal

- **WHEN** a Runtime implementing rendering contract 1.0 reads a 30 fps package requiring 1.1
- **THEN** it checks the lightweight manifest compatibility header before strict scene validation
  and refuses by package name, required version and installed version

#### Scenario: Compatibility preflight cannot classify the package

- **WHEN** the lightweight header is missing or malformed
- **THEN** import falls through to the established full verification path, which remains the single
  authority for damaged, non-template and invalid package errors
