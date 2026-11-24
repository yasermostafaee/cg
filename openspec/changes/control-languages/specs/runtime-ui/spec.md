## ADDED Requirements

### Requirement: CG Control SHALL offer separate interface and action feedback languages

CG Control SHALL provide independent English, Persian and Arabic choices for UI text and action feedback. CG Control SHALL bundle language catalogs from the documented source directory. Settings SHALL expose the two language selections.

#### Scenario: First launch

- **WHEN** neither a saved language preference nor a setup language exists **THEN** the interface and action feedback both use English

#### Scenario: English interface with Persian feedback

- **WHEN** an operator selects Persian for action feedback alone and plays a graphic or receives a refusal **THEN** the interface stays English and the action's success toast or refusal appears in Persian

#### Scenario: Persisted locale choices

- **WHEN** an operator changes either language in Settings **THEN** the console uses the new choice immediately and restores it after restart, until the operator changes it again or explicitly selects a language in a later installation

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

#### Scenario: Read a mixed-direction title or action message

- **WHEN** a Persian or Arabic title or feedback message starts with a Latin name
- **THEN** the paragraph starts at the right and the Latin name retains its letter order
- **AND** feedback uses its own locale direction even when the interface uses a different direction.
- **AND** a removal confirmation starts with the exact template name, and the PVW empty state explains that it sends nothing to the Playout Engine.

#### Scenario: Read a template assignment in Stations settings

- **WHEN** a graphic is assigned to a row in the Station setup Layers tab
- **THEN** its display name aligns at the start of the cell in the current direction and appears in the tooltip
- **AND** the assignment uses an unavailable label if the display name cannot be resolved
- **AND** both states of the visibility switch keep its knob inside the track when the interface is right to left.

#### Scenario: Identify the row’s template action column

- **WHEN** the operator reads the Layers header in English, Persian or Arabic
- **THEN** the first action column names both Load and Remove in that interface language, without truncation or a shift of the other action columns
- **AND** each row’s button states the action available for that row.

#### Scenario: Read the same layer name across the console

- **WHEN** an operator opens Layers and Station setup in Persian or Arabic
- **THEN** both views show the same localized default name for each regular and live layer, including in the remove confirmation and Inspector
- **AND** configured names remain as entered and searches recognize the displayed name and the layer number.

#### Scenario: Read Inspector facts and live-plate states

- **WHEN** an operator opens the Inspector, the Live plates tab, or its audio dialog
- **THEN** state, anchor labels, timing facts, built-in plate title labels, empty states, audio controls and tooltips follow the interface language
- **AND** the volume slider, value, controls and Close label align in right-to-left languages.

#### Scenario: Select a source in a mirrored list

- **WHEN** the operator opens Choose a source in a left-to-right or right-to-left interface
- **THEN** the title is centered and the A/B indicators align beside the thumbnail for list rows in Inputs and Media.
- **AND** media grid captions align the indicators at the left edge in Persian and Arabic, with A followed by B from left to right.

#### Scenario: Read channel details in either direction

- **WHEN** the operator reads the Channel tab in Persian or Arabic
- **THEN** width, height, and frame-rate units retain their technical left-to-right order, and video and output explanations use the interface language. Localized interlaced and progressive scan labels include their respective English terms in parentheses.
- **AND** dividers are between the metric columns and the format explanation identifies the Playout Engine as the source.

#### Scenario: Read station layer statuses and operate PGM audio

- **WHEN** the console is in Persian or Arabic
- **THEN** the Station layers table, statuses and tooltips read right to left, while layer identifiers retain their technical order
- **AND** the audio controls stay at the left end of the PGM bar, including when the controls wrap. In English, they stay at the right end.

#### Scenario: Follow collapsible settings and Inspector sections

- **WHEN** the operator closes Advanced in Station setup, a section in Inspector, or a section in Edit live layout
- **THEN** its chevron points toward the inline end of the interface, left in Persian and Arabic and right in English
- **AND** the expanded chevron points down in all three languages.

#### Scenario: Identify the preset selected in Inspector

- **WHEN** the operator selects a preset
- **THEN** both selected and unselected presets use standard button corners. The selected button has an accent and a check mark. The separate preview and on-air status labels use the interface language.

#### Scenario: Read a default preset input in Persian

- **WHEN** a Persian operator views a preset input that inherits its template source
- **THEN** the generated label uses «پیشفرض», and the assigned source name retains its original text.

#### Scenario: Interpret a source badge and the catalogue address

- **WHEN** CG Bridge last read the input catalogue from A but the selected source preview or meter is supplied by B
- **THEN** the catalogue address names its own server, and the B badge identifies the source of the preview or meter independently of the active PGM member
- **AND** A/B badges in Inspector and template source defaults stay beside the picker chevron for input and media selections.
- **AND** Edit live layout shows the same compact colored A/B indicators for live inputs and media. The detailed status is available through the badges and the plate’s accessible description.

#### Scenario: Read input preview states in the current interface language

- **WHEN** an operator points at an available, unknown, connecting or unavailable input preview
- **THEN** the tooltip and any displayed preview status use the interface language.
