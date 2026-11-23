## ADDED Requirements

### Requirement: CG Control SHALL group Lunar Hijri correction in General settings

CG Control SHALL group the Lunar Hijri correction with local language and workspace preferences in General while retaining existing station permissions.

#### Scenario: Locate the correction

- **WHEN** an operator opens General in Settings **THEN** the Lunar Hijri correction appears as a section in General

#### Scenario: Station permissions and reports

- **WHEN** a station admin adjusts the date or a restricted operator views it **THEN** the existing station permission, persisted correction, and pinned feedback are preserved
