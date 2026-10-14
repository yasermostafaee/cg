## MODIFIED Requirements

### Requirement: Preview transport is separate, momentary playout commands

The preview modal SHALL present the playout commands as **separate, momentary**
buttons — **Play**, **Pause**, **Out**, **Stop**, **Previous**, **Next** — each issuing a
single command, mirroring on-air control. **Play** SHALL call `play()`, or `resume()`
when the composition is paused; it SHALL NOT be a toggle and SHALL NOT remain
visually "pressed"/active after a click. **Pause** SHALL call `pause()`. **Out**
SHALL call `out()` (the coordinated animated exit) and **Stop** SHALL call
`stop()` (the immediate clear); both are momentary and visually distinct, each
with its own icon and a short tooltip making the difference clear. **Previous** SHALL
call `previous()` and **Next** SHALL call `next()`; both SHALL be **disabled when the
template has a single step** (nothing to step to). Every command SHALL sit wholly inside
the preview's panel: Play, Pause, Out and Stop share one row and Previous and Next share
the row below, half each. Preview-only utilities (e.g. **Reset**) SHALL be grouped
visually apart from the playout commands. All interactive controls SHALL expose
hover / active / focus-visible / disabled states.

#### Scenario: Play is momentary and resumes when paused

- **WHEN** the operator clicks Play while the composition is paused
- **THEN** the runtime resumes from the paused frame; **and** after any Play click
  the button does not stay pressed/active — it is a one-shot command, not a toggle

#### Scenario: Out and Stop are distinct momentary commands

- **WHEN** the transport is shown
- **THEN** an **Out** command (calling `out()`) is presented alongside a **Stop**
  command (calling `stop()`), each a separate momentary button with its own icon
  and tooltip, neither staying pressed after a click

#### Scenario: Next is disabled for a single-step template

- **WHEN** the composition has a single step
- **THEN** the Next and Previous commands are disabled; they become available only when
  the template exposes more than one step

#### Scenario: Every command is inside the panel

- **WHEN** the preview opens on a template with more than one step
- **THEN** Play, Pause, Out, Stop, Previous and Next are each wholly inside the Playout
  commands group, and the group is inside the preview dialog — no command is pushed past
  the panel's edge
