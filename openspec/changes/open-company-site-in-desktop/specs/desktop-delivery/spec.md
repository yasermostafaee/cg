## ADDED Requirements

### Requirement: Installed apps SHALL open the company website in the default browser

Activating an APASAI website entry in installed CG Designer or CG Control SHALL hand the fixed
company HTTPS address to Windows' default browser. Browser deployments SHALL retain ordinary
website link behavior. The desktop command SHALL take no destination from the renderer.

#### Scenario: APASAI website entry in an installed app

- **WHEN** an operator activates an APASAI website entry in a bundled app window
- **THEN** the native shell opens the fixed APASAI website in the default browser
- **AND** the app stays in its existing window

#### Scenario: APASAI website entry in a browser deployment

- **WHEN** an operator activates an APASAI website entry in a regular browser
- **THEN** the same website address opens through normal browser navigation
