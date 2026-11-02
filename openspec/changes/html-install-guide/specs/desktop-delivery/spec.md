## MODIFIED Requirements

### Requirement: A release SHALL come with a Persian install guide
Each release SHALL include a self-contained Persian HTML guide styled for comfortable offline reading. It SHALL use concise installer-facing language, omit internal/stale commentary, and identify the compatible Playout version supplied explicitly to the guide build.

#### Scenario: Offline HTML guide
- **WHEN** release artifacts are assembled **THEN** a styled HTML guide opens offline with its headings, warnings and screenshots intact

#### Scenario: Explicit Playout version
- **WHEN** the guide is built **THEN** the build receives the Playout version explicitly and the guide shows that value (current delivery: 2.17.1)
