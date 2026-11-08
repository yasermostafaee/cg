## ADDED Requirements

### Requirement: Shared Library image tiles SHALL drag directly onto the Canvas

An image tile in either Shared Library layout SHALL be draggable onto the Canvas. The drop SHALL
create and select an Image at that scene position with `source: 'shared'` and the dragged shared
asset id. The nested thumbnail SHALL not start a raw browser image drag. Shared font tiles SHALL not
be offered as Canvas image drag targets.

The common asset payload SHALL explicitly identify project or shared source. A legacy payload with
no source marker SHALL continue to create a project-source element.

#### Scenario: Shared image is dropped from either layout

- **WHEN** the author drags a Shared Library image tile from grid or list view onto the Canvas
- **THEN** a selected shared-source Image referencing that asset is created at the drop position

#### Scenario: Shared font is not an image drag target

- **WHEN** a shared font tile is rendered
- **THEN** it is not draggable onto the Canvas as an Image

#### Scenario: Legacy Project Asset drag remains compatible

- **WHEN** Canvas receives an existing Project Asset payload without a source marker
- **THEN** the inserted element still uses `source: 'project'`
