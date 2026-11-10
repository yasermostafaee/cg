## ADDED Requirements

### Requirement: CG Bridge SHALL diagnose shared-folder registration under its own identity

Before adopting a Shared files path, CG Bridge SHALL verify directory read access under its own
identity. When the operating system reports a missing path, the refusal SHALL direct the
administrator to check the path from the Bridge server. When it reports permission denied, the
refusal SHALL identify the permission to check for the Bridge service. A refused save SHALL preserve
the active path and persisted configuration.

#### Scenario: A UNC share cannot be found by the Bridge server

- **WHEN** the Bridge receives a Shared files path and the operating system reports that it cannot find the share
- **THEN** the refusal directs the administrator to check the host, share and folder from the Bridge server
- **AND** the active and persisted paths remain as they were

#### Scenario: Access to a UNC share is denied

- **WHEN** the Bridge can find a Shared files directory but cannot read it because access is denied
- **THEN** the refusal directs the administrator to check Share and NTFS Read for the Bridge service identity
- **AND** the active and persisted paths remain as they were
