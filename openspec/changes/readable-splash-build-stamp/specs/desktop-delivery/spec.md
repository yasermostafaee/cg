## ADDED Requirements

### Requirement: Startup build identity is self-explanatory

The CG Designer and CG Control startup splashes SHALL show the release version and build date with explicit operator-facing labels while preserving the source revision inside the structured diagnostic build identity only.

#### Scenario: Installed release build

- **WHEN** an installed release starts
- **THEN** its splash names Version and Build date and does not expose a Revision segment

#### Scenario: Development build

- **WHEN** no release version is available
- **THEN** the splash omits or truthfully labels the unavailable value and does not invent a release identity
