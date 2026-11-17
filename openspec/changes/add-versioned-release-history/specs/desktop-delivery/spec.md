## ADDED Requirements

### Requirement: Release history SHALL be a versioned website-ready artifact

The repository SHALL keep one structured release-history source and generate a standalone HTML page with a
clickable section for each recorded version. The page SHALL offer Persian RTL and English LTR, embed a
Persian font and separate features and fixes. Each page SHALL contain at most fifteen numbered releases.
The public page SHALL omit the `next` draft and the per-version download sections.

#### Scenario: Changes are retained before hosting exists

- **WHEN** an accepted change is recorded in the `next` source entry **THEN** it remains available to
  release preparation and the public page shows the numbered releases

#### Scenario: Download sections are hidden

- **WHEN** a release entry has a host base URL or a missing URL **THEN** its public release card shows
  release notes without a downloads heading, file cards or download links

#### Scenario: Release history is paginated

- **WHEN** history has more than fifteen numbered releases **THEN** its first page shows the first fifteen
- **WHEN** Next or Previous is selected **THEN** the page shows the corresponding group of up to fifteen
  releases and updates the localized page counter
- **AND** Previous is disabled on the first page and Next is disabled on the last page
- **WHEN** history has one page **THEN** the page counter shows one page and both navigation buttons are disabled

#### Scenario: Version history opens inside both apps

- **WHEN** the user opens Version history from Designer Home, Designer Help or CG Control Station setup
  **THEN** the app shows the same packaged bilingual page
- **AND** Designer history fills the viewport and CG Control history uses its near-full-window layout
- **AND** each dialog has a Close footer action that returns to the surface that opened it

#### Scenario: Installer build requires recorded changes

- **WHEN** the Desktop workflow builds installers for a version absent from the release-history source
  **THEN** it stops before packaging and asks for that version's changes to be recorded

#### Scenario: Customer delivery determines the next product version

- **WHEN** the installer build is requested **THEN** confirm with the owner whether the preceding
  version was delivered to a customer
- **IF** it was delivered **THEN** increase the product version before starting the build
- **WHEN** preparing the numbered customer version **THEN** move its shipped changes from `next`
  into that version's entry and regenerate the HTML, retaining pending items under `next`

#### Scenario: Existing release assets stay exact

- **WHEN** the Desktop workflow generates the release-history page **THEN** it uploads that page as a
  separate workflow artifact and does not add it to the exact five-file GitHub release contract

#### Scenario: Confirmed customer delivery is reflected in history

- **WHEN** the owner confirms that a version has been delivered **THEN** its recorded status and
  visible descriptions reflect publication in Persian and English
