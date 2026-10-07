# designer-project-persistence — delta (D-162: never lose unsaved work silently)

## ADDED Requirements

### Requirement: CG Designer SHALL never close with unsaved changes without asking

CG Designer SHALL hold every close of its window that its shell can intercept (the title bar's ×,
Alt+F4, the taskbar's Close window, the window menu, a `WM_CLOSE`) and ask the page. With unsaved
changes the page SHALL show ONE dialog in the shared Modal primitive: the title `Unsaved changes`,
the project's name, and the buttons `Save`, `Don't save` and `Cancel`, with focus on `Cancel` so a
stray Enter never discards work. `Save` SHALL save and then close the window; a save that fails, or
writes nothing, SHALL keep the window open and show the reason when there is one. `Don't save`
SHALL close the window. `Cancel`, Escape, the ✕ and the backdrop SHALL keep it open. A close that
arrives while the dialog is open SHALL NOT open a second one. With no unsaved changes the window
SHALL close at once, as before.

#### Scenario: A close with unsaved changes is held and asked about

- **WHEN** a project has been edited and the window is sent a close **THEN** the window stays open
  and `Unsaved changes` shows the project's name, `Save` / `Don't save` / `Cancel`, with focus on
  `Cancel`

#### Scenario: Cancel and Escape keep the window

- **WHEN** the dialog is answered with `Cancel`, Escape or a stray Enter **THEN** the window stays
  open and the work is still unsaved

#### Scenario: Don't save closes

- **WHEN** the dialog is answered with `Don't save` **THEN** the window closes and nothing is saved

#### Scenario: Save saves, then closes

- **WHEN** the dialog is answered with `Save` and the save succeeds **THEN** the project is saved
  and the window closes

#### Scenario: A failed save keeps the window

- **WHEN** the dialog is answered with `Save` and the save fails **THEN** the window stays open and
  the reason shows in the dialog

#### Scenario: One dialog however many closes

- **WHEN** a second close arrives while the dialog is open **THEN** there is still one dialog

#### Scenario: Nothing to lose closes at once

- **WHEN** no project is open, or the open project is unchanged, and the window is sent a close
  **THEN** it closes at once, with no dialog

### Requirement: The leave prompt and the window close SHALL ask ONE unsaved-changes predicate

Whether work would be lost SHALL be decided by ONE predicate, `hasUnsavedChanges` — a project open
and `dirty` by D-088's content hash — asked at the moment of the decision by the browser's leave
prompt, by CG Designer's window close and by the save-before-switch guards. No caller SHALL spell
its own reading of `dirty`. The browser SHALL keep its leave prompt.

#### Scenario: The two doors agree

- **WHEN** the leave prompt and the window close are each asked about the same document — none
  open, open and unchanged, open and edited **THEN** they give the same answer: ask only for the
  edited one

#### Scenario: The browser keeps its warning

- **WHEN** the browser tab of an edited project is closed **THEN** the browser asks before leaving;
  and for an unchanged project it does not
