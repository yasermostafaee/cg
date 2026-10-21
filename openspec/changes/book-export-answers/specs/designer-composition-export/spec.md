## ADDED Requirements

### Requirement: Every export ends in an answer the author can read

Every `.vcg` and single-file HTML export SHALL end in an answer the author can read, never in silence. The template
SHALL be validated BEFORE the save dialog opens, so a template with an error makes no file and is answered as the
button's own refusal (the offenders selected, the Issues panel opened). While an export runs, both export buttons SHALL
wait and the pressed one SHALL show how far it is (`Exporting… 60 %`). A written file SHALL be named with its size. A
failure SHALL be a sentence naming the cause in the author's words that stays until it is dismissed, with the element
at fault selected, and SHALL say what became of the file the save dialog made: an EMPTY file is removed where the
browser allows and the removal is claimed only when reading the file back finds nothing; a file that still holds bytes
is never removed; otherwise the author is told to delete it. A picture, clip or sound the template shows whose bytes
cannot be read SHALL fail the export, naming the file and the element; a book page naming an asset the project does
not have SHALL be a preflight error, as an image element's is.

#### Scenario: A book exports, with progress, and is named with its size

- **WHEN** the author fills a Sequence with `Add folder…` and presses `Export (.vcg)`, and names the file in the save
  dialog
- **THEN** the button reads `Exporting…` (then a percentage) while both export buttons wait, and the export ends with
  `Exported telavat.vcg · <size>`, and the file holds a package that verifies, with every page in it

#### Scenario: A failure is said, stays, and leaves no empty file behind

- **WHEN** a page's bytes cannot be read from the project after the save dialog has made the file
- **THEN** the author reads this sentence, still there after a transient notice would have gone, the sequence is
  selected, and no empty file remains:
  `Export failed: <page> in "<sequence>" could not be read from the project. telavat.vcg was removed; nothing was saved.`

#### Scenario: A file the browser will not remove is named for the author to delete

- **WHEN** an export fails after the dialog made an empty file, and the browser cannot remove it
- **THEN** the sentence ends `<file> was left empty; delete it.`, and a file that still holds its earlier bytes is
  never removed (`<file> was not changed.`)

#### Scenario: An error found before the dialog makes no file

- **WHEN** the template has a preflight error at the moment `Export (.vcg)` is pressed
- **THEN** no save dialog opens, the offenders are selected and the Issues panel is opened

### Requirement: A template too large for CG Control is refused before the save dialog

The `.vcg` export SHALL refuse, before the save dialog opens, a template whose pictures, clips, sounds and fonts
exceed `TEMPLATE_MEDIA_MAX_BYTES` (45 MB: CG Bridge's 64 MiB frame, less 4 MiB for the page itself, before base64),
because CG Control renders an imported package into one page and sends it to CG Bridge in one frame. The refusal SHALL
be a preflight error on the heaviest element naming how many pictures, how many MB and the limit, and the way around it:
loading the pages in CG Control (BOOK-EXPORT Q1: the limit stays). The single-file HTML export, which never goes
through CG Bridge, SHALL NOT be refused by it.

#### Scenario: The owner-sized book is refused in one sentence

- **WHEN** a Sequence holds 150 pictures of 672 MB and the author presses `Export (.vcg)`
- **THEN** no save dialog opens, and the Issues panel reads:
  `"<sequence>" makes this template too large for CG Control: 150 pictures, 672 MB of pictures and media; one template can carry at most 45 MB. Use fewer or smaller pictures, or load the pages in CG Control instead (Load folder…).`

#### Scenario: The HTML export is not refused by the CG Control limit

- **WHEN** the only error is that the template is too large for CG Control
- **THEN** `Export (.vcg)` is marked blocked and `HTML` is not
