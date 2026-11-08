# sequence-repeater-data-reveal Specification

## ADDED Requirements

### Requirement: A Take SHALL reveal only current data-driven content

The runtime SHALL keep the stage hidden until current field values and page values have been applied
and all data-driven subtrees required for the first frame have been reset. Authored shells MAY exist
while pending but SHALL NOT become visible during the Take.

#### Scenario: A Sequence composition page replaces its Repeater rows

- **GIVEN** a Sequence item references a composition containing a Repeater with authored default rows
- **AND** that item supplies different Repeater rows through its `fieldValues`
- **WHEN** the graphic is taken
- **THEN** the first revealed frame contains the item rows
- **AND** no frame reveals the Repeater's authored default rows
