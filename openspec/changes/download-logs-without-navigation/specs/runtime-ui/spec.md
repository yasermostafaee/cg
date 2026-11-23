## ADDED Requirements

### Requirement: Log download SHALL not depend on external browser download interception

CG Control SHALL read CG Bridge's one-use ticketed log archive itself. The connected
station-admin or auth-off authorization and the one-use ticket SHALL remain the resource
boundary. Windows CG Control SHALL open a visible Save As picker for the operator to choose
the destination and SHALL report the path after a completed write. A browser supporting a
save picker SHALL open that picker during the activating click and SHALL report the chosen
filename after a completed write. Other browser contexts SHALL offer a local Blob
download. A download manager SHALL NOT receive the ticket URL as a normal page navigation.

#### Scenario: Download manager is installed

- **WHEN** a station admin presses Download logs
- **THEN** CG Control obtains the authorized archive without navigating to the ticket URL

#### Scenario: The operator picks a Windows destination

- **WHEN** the native Save As opens and the operator selects a location and filename
- **THEN** the completed archive is stored in that folder and Audit displays the actual saved path
- **AND** an existing filename is kept and the new archive receives a distinct filename in the selected folder

#### Scenario: The browser offers a save picker

- **WHEN** the operator starts Download logs in a browser that exposes the save picker
- **THEN** CG Control opens it before starting the ticket request and archive fetch
- **AND** Audit displays the browser's selected filename after the handle closes the completed write

#### Scenario: The operator cancels a picker

- **WHEN** the operator closes the Windows or browser picker without choosing a destination
- **THEN** CG Control writes no ZIP and shows no success or failure
- **AND** canceling the browser picker issues no archive ticket

#### Scenario: The desktop cannot write the archive

- **WHEN** the received archive is malformed or Windows cannot write the selected file
- **THEN** CG Control reports the save failure and preserves existing files

#### Scenario: Archive request fails

- **WHEN** CG Bridge refuses or cannot return the archive
- **THEN** Download logs shows the failure without reporting a saved file

#### Scenario: A session cannot request the archive

- **WHEN** a connected session lacks station-admin authorization and authentication is enabled
- **THEN** CG Bridge issues no archive ticket and Control offers no Download logs action
