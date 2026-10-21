## ADDED Requirements

### Requirement: Save As writes a copy that is a project of its own

The author's **Save As** SHALL write a copy with a NEW project id, carrying the project's assets; the open project
SHALL become that copy — its scene and every scene in its undo history take the new id, its assets are written under
it, and it gets its own Recent entry and file handle — so the copy's compositions export under ids of their own. The
original file SHALL NOT be changed. A Save that falls back to the save dialog (no file yet, or the old file could not
be written) SHALL keep the project's id.

#### Scenario: Save As then export

- **WHEN** a project is saved, its composition exported, then the project is saved with Save As and the composition
  exported again
- **THEN** the copy's project id differs from the original's, the second package's id differs from the first, the
  copy's pictures still resolve, and a later Save of the copy keeps the copy's id

#### Scenario: No undo brings the original's id back

- **WHEN** the author undoes or redoes after Save As
- **THEN** the open project's id is still the copy's
