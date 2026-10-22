## MODIFIED Requirements

### Requirement: A template too large for CG Control is refused before the save dialog

The `.vcg` export SHALL refuse, before the save dialog opens, a template whose pictures, clips, sounds and fonts
exceed `TEMPLATE_MEDIA_MAX_BYTES` (45 MB: CG Bridge's 64 MiB frame, less 4 MiB for the page itself, before base64),
because CG Control renders an imported package into one page and sends it to CG Bridge in one frame. The refusal SHALL
be a preflight error on the heaviest element naming how many pictures, how many MB and the limit, and the way around it:
loading the pages in CG Control, by the name of its one load button, `Load pages…` (BOOK-EXPORT Q1: the limit stays;
`RUN-NEXT-VERSION-03` delta A: one load button). The single-file HTML export, which never goes through CG Bridge,
SHALL NOT be refused by it.

#### Scenario: The owner-sized book is refused in one sentence

- **WHEN** a Sequence holds 150 pictures of 672 MB and the author presses `Export (.vcg)`
- **THEN** no save dialog opens, and the Issues panel reads:
  `"<sequence>" makes this template too large for CG Control: 150 pictures, 672 MB of pictures and media; one template can carry at most 45 MB. Use fewer or smaller pictures, or load the pages in CG Control instead (Load pages…).`

#### Scenario: The HTML export is not refused by the CG Control limit

- **WHEN** the only error is that the template is too large for CG Control
- **THEN** `Export (.vcg)` is marked blocked and `HTML` is not
