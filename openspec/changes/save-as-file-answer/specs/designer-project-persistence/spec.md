## ADDED Requirements

### Requirement: A save into a picked file answers a failed write and leaves no empty file

A save that writes into a file the save dialog just made SHALL, when the write fails, abort the write, remove the file
only when it is empty (and claim so only when reading it back finds nothing), and answer in the export's sentence with
its own verb: `Save failed: <cause>. <file> was removed; nothing was saved.` (or "was left empty; delete it", or "was
not changed"). The toolbar's Save and Save As SHALL hold that sentence until dismissed; the save-before-switch and
unsaved-changes dialogs SHALL show it and SHALL NOT treat it as a cancelled picker.

#### Scenario: The disk is full when Save As writes

- **WHEN** Save As's write into the newly picked file fails with the disk full
- **THEN** the empty file is removed and the author reads
  `Save failed: there is not enough space on the disk for the file. <file> was removed; nothing was saved.`

#### Scenario: A write that succeeds

- **WHEN** the write completes
- **THEN** nothing is said beyond the save itself
