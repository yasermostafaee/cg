# runtime-ui — delta (R-094: the browser console asks before its tab is left)

## ADDED Requirements

### Requirement: The browser console SHALL ask before its tab is left while signed in

A console in a browser — with no desktop shell — SHALL register the tab's own leave prompt
(`beforeunload`) and SHALL ask through it while signed in, and only then: signed out, expired, or
with no sign-in at all, the tab SHALL close without asking. A reload the console starts itself on
purpose (`Retry connection`, `Set up again`) SHALL NOT ask. Inside CG Control the tab's prompt SHALL
NOT be registered: the window's close is the shell's question there, asked in the console's own
dialog. Leaving SHALL send nothing to CG Bridge or CasparCG.

#### Scenario: Signed in, the tab asks

- **WHEN** a signed-in console's tab is closed **THEN** the browser asks before leaving

#### Scenario: Signed out, the tab closes

- **WHEN** a signed-out console's tab is closed **THEN** it closes without asking

#### Scenario: A reload the console starts does not ask

- **WHEN** a signed-in operator presses `Retry connection` **THEN** the console starts again with no
  leave prompt

#### Scenario: Inside CG Control there is one question

- **WHEN** a signed-in console runs inside CG Control **THEN** no tab leave prompt is registered and
  the window's close is asked in `Close CG Control?`
