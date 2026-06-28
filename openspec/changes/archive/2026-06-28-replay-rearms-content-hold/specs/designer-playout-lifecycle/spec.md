# designer-playout-lifecycle (B-033 delta)

## ADDED Requirements

### Requirement: A content-driven hold re-arms on every replay

Every `play()` SHALL re-arm the content-driven hold so a REPLAY (calling `play()` again without
re-creating the runtime, e.g. pressing Play twice in the preview) waits for content exactly like the
first play. In particular, each scope's self-settle signal (the B-031 deferred a content-driven
parent awaits for a nested CONTENT-DRIVEN (coordinator) child) SHALL be re-minted for the new run
before the controller cascade, so the parent — which captures it fresh at each hold entry — waits on
a PENDING settle rather than the one already resolved on the previous play. A replay SHALL NOT close
instantly; only re-opening the preview must not be required to restore correct waiting.

#### Scenario: Replaying a content-driven scene waits again (own content)

- **WHEN** a content-driven hold with finite OWN content (a ticker / sequence / countdown) settles,
  and `play()` is called again without re-creating the runtime
- **THEN** the hold re-arms and waits for the content again, exactly like the first play

#### Scenario: Replaying re-arms a nested content-driven child's hold

- **WHEN** a content-driven parent whose hold is driven by a nested CONTENT-DRIVEN (coordinator)
  composition has settled, and `play()` is called again
- **THEN** the parent waits again on that nested composition's fresh self-settle (it does NOT close
  instantly on the already-resolved settle from the previous play)
