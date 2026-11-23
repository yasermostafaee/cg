## ADDED Requirements

### Requirement: CG Control SHALL confirm delimiter reset before changing the station list

CG Control SHALL explain the impact on graphics' delimiter choices and SHALL require explicit confirmation before resetting the station list.

#### Scenario: Cancel a delimiter reset

- **WHEN** a station admin opens Reset to defaults then cancels **THEN** the warning identifies the choices used by graphics and no delimiter write occurs

#### Scenario: Confirm a delimiter reset

- **WHEN** a station admin confirms the warning **THEN** the existing station reset runs and the shipped choices return
