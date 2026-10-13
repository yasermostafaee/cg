# desktop-delivery — delta (R-094: CG Control does not close on a slip; the shells' close guard)

## ADDED Requirements

### Requirement: CG Control SHALL ask before its window closes, and closing SHALL send nothing

CG Control SHALL hold every close of its window that its shell can intercept (the title bar's ×,
Alt+F4, the taskbar's Close window, the window menu, a `WM_CLOSE`) and ask in ONE dialog, the
runtime's Modal primitive: the title `Close CG Control?` and the buttons `Cancel` and `Close`, with
focus on `Cancel`; Escape SHALL be Cancel. The dialog SHALL carry one fact line only when it is
true — `N items stay on air.`, or `1 item stays on air.` — counted with the console's one air count
(`airTally`, over `isOnAirStatus`) across the whole stack the console holds, and no other prose. It
SHALL show above every gate that can cover the console: the lock, the sign-in gate and first-run.
`Close` SHALL close the window and SHALL send nothing to CG Bridge or CasparCG: a window close is not
a CLEAR, and what is on air stays on air. A close that arrives while the dialog is open SHALL NOT
open a second one. The `Close` action SHALL be named distinctly from the dialog's ✕, which cancels.

#### Scenario: A close is held and asked about

- **WHEN** CG Control's window is sent a close **THEN** it stays open and `Close CG Control?` shows
  `Cancel` and `Close`, with focus on `Cancel`

#### Scenario: Cancel keeps the console

- **WHEN** the dialog is answered with `Cancel`, Escape or a stray Enter **THEN** the window stays
  open

#### Scenario: Close exits, and sends nothing

- **WHEN** the dialog is answered with `Close` **THEN** the window closes, no frame is sent to CG
  Bridge, the console does not close its socket, and every item on air stays on air

#### Scenario: The fact line, only when true

- **WHEN** two of the console's items are on air **THEN** the dialog says `2 items stay on air.`;
  with one, `1 item stays on air.`; with none, nothing but its title and buttons

#### Scenario: Over the sign-in gate

- **WHEN** a signed-out console, or one at first-run, is sent a close **THEN** the dialog shows over
  the gate

### Requirement: Each installed app's shell SHALL hold a close only while its page can answer it

The shells of CG Designer and CG Control SHALL decide every close request with ONE shared decision
(`close_guard.rs`, included by both): no page holds the window until it arms the guard, so a page
that never loaded, or failed before it armed, can always be closed; a navigation SHALL let go; a
held close SHALL be prevented and the page asked; a page that does not acknowledge an ask SHALL NOT
trap the window — a close arriving five seconds after an unanswered ask goes through. The page is
asked with one DOM event and answers through three app commands, declared in each `build.rs` and
granted in each app's capability file to its own window only. Windows shutdown and sign-out are not
close requests here: tao does not process `WM_QUERYENDSESSION`, so the shells cannot hold them.

#### Scenario: A page that never armed closes at once

- **WHEN** the window is sent a close before its page has armed the guard **THEN** it closes at once

#### Scenario: A page that does not answer cannot trap the window

- **WHEN** a held close is not acknowledged and another close arrives five seconds later **THEN**
  that close goes through

#### Scenario: A navigation lets go

- **WHEN** the page starts to load again **THEN** nothing holds the window until the new page arms

#### Scenario: Shutdown is not held

- **WHEN** Windows shuts down or the user signs out **THEN** neither shell is asked and neither app
  asks anything

### Requirement: The desktop smoke SHALL close each installed app through its close guard

On the clean Windows runner the smoke SHALL send each installed app a close as Windows sends one —
`WM_CLOSE` to its main window — and SHALL check: CG Designer with an unchanged project closes at
once; with an edited project the close is held, `Unsaved changes` asks, a second close stacks no
dialog, `Cancel` keeps the window and `Don't save` closes it; CG Control's close is held,
`Close CG Control?` asks, `Cancel` keeps the window and `Close` exits. A picture of each dialog
SHALL be kept with the smoke's evidence.

#### Scenario: The smoke drives both guards

- **WHEN** the desktop smoke runs on the Windows runner **THEN** it records the checks above and
  keeps `designer-unsaved-dialog.png` and `control-close-dialog.png`
