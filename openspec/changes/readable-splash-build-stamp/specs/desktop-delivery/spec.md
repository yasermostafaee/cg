## ADDED Requirements

### Requirement: Startup build identity is self-explanatory

The CG Designer and CG Control startup splashes SHALL show the release version, source revision and build date with explicit operator-facing labels while preserving the exact shared build identity.

#### Scenario: Installed release build

- **WHEN** an installed release starts
- **THEN** its splash names Version, Revision and Build date rather than showing an unexplained middle number

#### Scenario: Development build

- **WHEN** no release version or Git revision is available
- **THEN** the splash omits or truthfully labels the unavailable value and does not invent a release identity
