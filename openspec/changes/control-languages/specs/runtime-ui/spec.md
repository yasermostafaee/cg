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
