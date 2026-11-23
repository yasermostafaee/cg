## ADDED Requirements

### Requirement: CG Control SHALL offer separate interface and action feedback languages

CG Control SHALL provide independent English, Persian and Arabic choices for UI text and action feedback. CG Control SHALL bundle language catalogs from the documented source directory. Settings SHALL expose the two language selections.

#### Scenario: First launch

- **WHEN** no language preference has been saved **THEN** the interface and action feedback both use English

#### Scenario: English interface with Persian feedback

- **WHEN** an operator selects Persian for action feedback alone and plays a graphic or receives a refusal **THEN** the interface stays English and the action's success toast or refusal appears in Persian

#### Scenario: Persisted locale choices

- **WHEN** an operator changes either language in Settings **THEN** the console uses the new choice immediately and restores it after restart

#### Scenario: Developer catalog edits

- **WHEN** a developer edits an English, Persian or Arabic JSON catalog at the source path documented in README and builds CG Control **THEN** the updated values are bundled with the app

#### Scenario: Right-to-left operator surfaces

- **WHEN** Persian or Arabic is selected for the interface **THEN** design controls, labels, form fields and table columns follow right-to-left reading order, while explicit physical panel positions and literal technical or operator values retain their meaning.

#### Scenario: Status labels follow the interface language

- **WHEN** the interface uses Arabic and feedback is English **THEN** blocked and simulated-air row states are Arabic while command notifications use English.

#### Scenario: Operator-facing copy follows the interface language

- **WHEN** Persian or Arabic is selected for the interface
- **THEN** the shell, Inspector, layer actions, dialogs, dialog tabs, option labels, tooltips, placeholders and diagnostics use the selected language
- **AND** confirmation prompts and recorded Audit outcomes use the interface language, while operation messages and toasts use the separately selected feedback language
- **AND** authored names and technical values retain their text and natural direction

#### Scenario: Read a template assignment in Stations settings

- **WHEN** a graphic is assigned to a row in the Station setup Layers tab
- **THEN** its display name aligns at the start of the cell in the current direction and appears in the tooltip
- **AND** the assignment uses an unavailable label if the display name cannot be resolved
- **AND** both states of the visibility switch keep its knob inside the track when the interface is right to left.
