## ADDED Requirements

### Requirement: Log download SHALL not depend on external browser download interception

CG Control SHALL read CG Bridge's one-use ticketed log archive itself before starting a local file
download. A download manager SHALL NOT receive the ticket URL as a normal page navigation. The existing
station-admin authorization and one-use ticket SHALL remain the resource boundary.

#### Scenario: Download manager is installed

- **WHEN** a station admin presses Download logs **THEN** CG Control fetches the archive and downloads a
  local Blob using the bridge archive filename, without navigating to the ticket URL

#### Scenario: Archive request fails

- **WHEN** CG Bridge refuses or cannot return the archive **THEN** Download logs shows the failure and
  does not report success
