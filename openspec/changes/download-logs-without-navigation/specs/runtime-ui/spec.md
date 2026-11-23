## ADDED Requirements

### Requirement: Log download SHALL not depend on external browser download interception

CG Control SHALL read CG Bridge's one-use ticketed log archive itself before starting a local
file save. The connected station-admin or auth-off authorization and the one-use ticket
SHALL remain the resource boundary. Windows CG Control SHALL save the fetched ZIP in the
Windows Downloads folder and report its actual path after the completed write. A browser
SHALL use the local Blob download path. A download manager SHALL NOT receive the ticket URL
as a normal page navigation.

#### Scenario: Download manager is installed

- **WHEN** a station admin presses Download logs
- **THEN** CG Control fetches the archive without navigating to the ticket URL
- **AND** Windows CG Control saves through the desktop shell and the browser downloads a local Blob

#### Scenario: The Windows file is saved

- **WHEN** the native shell completes a ZIP write
- **THEN** Audit displays where that archive was written
- **AND** an already existing name is kept and the new archive receives a distinct filename

#### Scenario: The desktop cannot write the archive

- **WHEN** the received archive is malformed or Windows cannot write the file
- **THEN** CG Control reports the save failure and leaves any existing file intact

#### Scenario: Archive request fails

- **WHEN** CG Bridge refuses or cannot return the archive
- **THEN** Download logs shows the failure without reporting a saved file

#### Scenario: A session cannot request the archive

- **WHEN** a connected session lacks station-admin authorization and authentication is enabled
- **THEN** CG Bridge issues no archive ticket and Control offers no Download logs action
