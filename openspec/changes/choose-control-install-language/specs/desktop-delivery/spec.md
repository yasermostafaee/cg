## ADDED Requirements

### Requirement: CG Control setup chooses the initial language

Interactive CG Control setup SHALL offer English, Persian and Arabic on its first page, with
English initially selected. It SHALL use the selected language for its own pages and save the
selection for the installed application. CG Control SHALL use the saved installer language as
the default for both interface and feedback. CG Control SHALL apply an explicit selection to both
preferences on the first launch after that installation, and SHALL preserve subsequent independent
Settings changes.

#### Scenario: Complete CG Control setup in a selected language

- **WHEN** a user selects Persian or Arabic on the first page
- **THEN** the rest of setup uses that language and presents its text right to left
- **AND** setup records the choice after a successful installation, including when opening CG Control is unchecked.

#### Scenario: Apply the installation choice to the first console session

- **WHEN** the installed console first opens with a valid installation language and no saved language preference
- **THEN** its interface and operation feedback start in that language
- **AND** changing either language in General stores an independent preference.

#### Scenario: Open a console with existing preferences

- **WHEN** a console with saved settings is upgraded and the user explicitly selects a language during setup
- **THEN** the splash and app use that selection on the first launch, including launch from Finish or a later launch
- **AND** editing either preference afterward persists across restarts of that installation.

#### Scenario: Upgrade without selecting a language

- **WHEN** an upgrade accepts the initial setup language without interacting with its radio buttons, or runs unattended
- **THEN** the previously recorded installer language and saved interface and feedback choices remain in effect.

#### Scenario: Start a console without an installer preference

- **WHEN** a fresh console starts without a valid installation language
- **THEN** the initial interface and feedback language is English.

#### Scenario: Preserve the unattended and other product flows

- **WHEN** setup is called silently or launches for CG Designer or CG Bridge
- **THEN** the existing unattended or product-specific flow continues.
