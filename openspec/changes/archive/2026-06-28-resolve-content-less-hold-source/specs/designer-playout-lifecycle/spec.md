# designer-playout-lifecycle (B-032 ext delta)

<!--
The B-032 "no effective drivers ⇒ resolve to timed" change to the requirement
"A content-driven hold ends on the scope's content completion" is applied directly
to the living spec during archive reconciliation (it MODIFIES the same requirement
B-031 modifies, and B-031's full text + scenarios must be preserved — a delta
MODIFIED here would replace the whole requirement and drop B-031's content). Only
the NEW inspector requirement is folded via this delta.
-->

## ADDED Requirements

### Requirement: The Playout inspector shows a content-less hold as timed

The Designer Playout inspector SHALL reflect the same resolution as the runtime:
when a composition has no effective hold-driving content (own or nested, with
`drivesHold !== false` and no per-instance `holdOverrides` excluding it), it SHALL
present the hold as `timed` and offer the authorable `holdMs` control under
`auto-out` / `loop-cycle`, even if the stored `holdSource` is `content-driven` — so
the operator is never trapped with a hidden duration that the runtime silently
ignores.

#### Scenario: The holdMs control appears for a content-less content-driven comp

- **WHEN** a composition is stored `holdSource: 'content-driven'` under `auto-out`
  but has no content sources (e.g. its only content was deleted)
- **THEN** the Playout inspector shows the timed `holdMs` control (the hold
  resolves to timed), so the operator can author the duration the runtime honors
