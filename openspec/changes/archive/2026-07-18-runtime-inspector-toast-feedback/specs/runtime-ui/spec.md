# runtime-ui Specification (delta)

## ADDED Requirements

### Requirement: Command feedback is transient, never pinned inline

The outcome of an operator command SHALL be reported on the shared transient command surface
(the toast), and SHALL NOT be rendered as text pinned into the panel or row that issued it.
This holds for every command control on the operator surface — library, stack and Inspector
alike — so the operator has ONE place to look for "did that work?" rather than a different
answer per panel. A message pinned into a tight layout also wraps, and a wrapped message bloats
or breaks the row it sits in.

A refusal SHALL be reported EXACTLY ONCE. Where the action's shared handler already reports for
itself, the control SHALL suppress its own copy rather than adding a second — one refusal
speaking twice, in two places, is the failure this rule exists to prevent. Where the handler
does not report, the control SHALL be the reporter.

The message WORDING is unchanged by where it appears: a refusal carries the same
machine-readable-reason mapping whether it is issued from a button, a menu, or any other entry
point to the same action. After a refusal the control SHALL return to its idle state rather than
holding a persistent error.

Text that is NOT the outcome of a command is out of scope and SHALL remain in place — a
persistent explanation of why a control is disabled, and state markers such as an
unapplied-edits indicator, are readable for as long as the condition holds and have no
transient event to fire on.

#### Scenario: A refused Inspector command shows a toast and pins nothing in the panel

- **WHEN** an Inspector command is refused (for example applying a position the bridge rejects)
- **THEN** the refusal appears on the command toast, no inline error is rendered in the panel,
  and the control returns to idle

#### Scenario: A refusal that the shared handler already reported is not doubled

- **WHEN** a command whose shared handler reports its own failure is refused
- **THEN** exactly one message reaches the operator, and the control adds neither a second toast
  nor an inline copy

#### Scenario: A persistent disabled-state explanation is not converted to a toast

- **WHEN** a control is disabled because the item is on air
- **THEN** the explanation remains readable beside that control for as long as it is disabled
