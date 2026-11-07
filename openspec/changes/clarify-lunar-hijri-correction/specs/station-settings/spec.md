## MODIFIED Requirements

### Requirement: Station settings SHALL identify the Lunar Hijri correction precisely

CG Control SHALL name the setting Lunar Hijri correction and SHALL explain that it changes only
Lunar Hijri display and entry when the officially announced day differs from the calculated date.

#### Scenario: No correction is required

- **WHEN** the calculated Lunar Hijri date is accepted **THEN** the setting shows As calculated and explains that no change is needed

#### Scenario: An announced date differs

- **WHEN** a station admin chooses −2 through +2 days **THEN** the existing station-wide correction is saved and all consoles use it
