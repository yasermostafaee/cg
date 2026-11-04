## MODIFIED Requirements

### Requirement: The content-driven hold control is offered for content in a nested composition

The Designer Playback Inspector SHALL show the authored Hold-source selector for every composition
whose mode is `auto-out` or `loop-cycle`, whether or not an effective content driver currently
exists. `manual` and `static` SHALL omit it because those modes do not execute a selectable Hold
source. The Preview's per-scope timing surface SHALL continue to recognise finite content directly
or inside nested composition instances, resolving `scene.compositions` with a cycle guard, so nested
content remains tunable there.

#### Scenario: A blank hold-capable composition can author its Hold source

- **WHEN** an Auto-out or Loop-cycle composition has no ticker, sequence, countdown, opted-in media
  or eligible nested content
- **THEN** its Playback Inspector still shows Hold source with Timed and Content-driven choices

#### Scenario: Nested content activates the authored choice

- **WHEN** a content-less composition is authored Content-driven and an effective driver is then
  added inside a nested composition instance
- **THEN** the selector remains Content-driven and that choice becomes effective immediately

#### Scenario: The Preview offers timing for nested-only content

- **WHEN** Preview opens on a parent whose only finite content lives inside a nested composition
  instance and its mode is Auto-out or Loop cycle
- **THEN** the parent's per-scope timing includes that nested content without infinite recursion

#### Scenario: Modes without a selectable Hold source omit the row

- **WHEN** a composition is Static or Manual
- **THEN** the Playback Inspector does not show Hold source

### Requirement: The Playout inspector shows a content-less hold as timed

The Designer Playback Inspector SHALL preserve an authored `holdSource: 'content-driven'` when a
composition has no effective hold-driving content. It SHALL state `No active hold driver · using
Timed`, expose the `holdMs` value that runtime/export safely honor and make the remedy available from
contextual Info. It SHALL NOT silently rewrite the stored choice. Adding or enabling an effective
own/nested driver SHALL remove the fallback state and duration; deleting, hiding, excluding or
disabling the last effective driver SHALL restore them.

#### Scenario: Content-driven intent has no active driver

- **WHEN** an Auto-out composition is stored Content-driven but has no effective hold driver
- **THEN** the selector still reads Content-driven, the compact safe-Timed state and `holdMs` are
  visible, and the stored Hold source remains unchanged

#### Scenario: Enabling a driver clears the fallback

- **WHEN** an eligible visible driver becomes effective for that composition
- **THEN** the fallback state and `holdMs` disappear and Content-driven becomes effective

#### Scenario: Removing the last driver restores the fallback

- **WHEN** the last effective driver is removed, hidden or unchecked
- **THEN** the safe-Timed state and `holdMs` return without changing the authored Content-driven value

#### Scenario: Disabled eligible content remains recoverable

- **WHEN** eligible content exists but every closer checkbox is off
- **THEN** the Inspector shows those unchecked rows so the author can enable a driver again

## ADDED Requirements

### Requirement: Playback selectors use concise values

The Playback Inspector SHALL label mode options `Static`, `Manual`, `Auto-out` and `Loop cycle`, and
Hold-source options `Timed` and `Content-driven`. Explanations SHALL be available from aligned Info
actions rather than embedded in the option values.

#### Scenario: Select values fit the narrow Inspector

- **WHEN** the Playback and Hold-source selects render at normal Inspector width
- **THEN** every option uses the concise value and its longer behavioral explanation is available
  from the adjacent Info action
