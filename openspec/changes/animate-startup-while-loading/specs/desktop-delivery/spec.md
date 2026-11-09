## ADDED Requirements

### Requirement: Both bundled startup pages animate only during startup

The installed CG Designer and CG Control SHALL show inline CSS startup motion before the app bundle
finishes loading. Dismissal SHALL start at real shell readiness, subject to the absolute backstop.
Both SHALL honor reduced-motion preferences by showing the complete still composition.

#### Scenario: A WebView is loading the application

- **WHEN** bootstrap is pending and reduced motion is not requested
- **THEN** the inline page has observable CSS motion even before the app bundle executes

#### Scenario: A fast launch completes

- **WHEN** the app shell commits
- **THEN** the splash releases input immediately, regardless of launch or reload
