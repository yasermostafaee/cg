## ADDED Requirements

### Requirement: Release history SHALL be a versioned website-ready artifact

The repository SHALL keep one structured release-history source and generate a standalone HTML page with a
clickable section for each recorded version. The page SHALL offer Persian RTL and English LTR, embed a
Persian font and separate features and fixes. Every non-development version SHALL expose the exact
guide, CG Bridge installer, CG Control installer, CG Designer installer and checksum filenames. Until a host
base URL is configured, those file cards SHALL remain visibly disabled rather than link to missing files.

#### Scenario: Changes are retained before hosting exists

- **WHEN** an accepted change is recorded for the next release and no download host exists **THEN** the
  generated page shows that change and displays disabled cards with the future canonical filenames

#### Scenario: Hosted files are bound per version

- **WHEN** a release entry receives a host base URL **THEN** all five cards for that version link to the
  canonical filenames below that URL without changing the page template

#### Scenario: Version history opens inside both apps

- **WHEN** the user opens Version history from Designer Home, Designer Help or CG Control Station setup
  **THEN** the app shows the same packaged bilingual page

#### Scenario: Installer build requires recorded changes

- **WHEN** the Desktop workflow builds installers for a version absent from the release-history source
  **THEN** it stops before packaging and asks for that version's changes to be recorded

#### Scenario: Existing release assets stay exact

- **WHEN** the Desktop workflow generates the release-history page **THEN** it uploads that page as a
  separate workflow artifact and does not add it to the exact five-file GitHub release contract
