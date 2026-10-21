## ADDED Requirements

### Requirement: The bridge holds a row's pages and serves them from the template origin

CG Bridge SHALL store pictures sent by a console with `pages.put` (PNG, JPEG or WebP; at most 4 MB
and 3840 × 2160 pixels each) under its state home beside the template store, one file per picture
named by its SHA-256. A row's page list SHALL be an ordinary field value of picture items naming
those hashes; the bridge SHALL refuse a page list that names a picture it does not hold, or more than
500 pages. CasparCG SHALL fetch a picture from the template server's read-only route
`GET /page/<sha256>.<ext>` — the origin that served the template, a backup core included, on no new
port — which answers a stored picture with its own type, `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`, and `404` for anything else. A command SHALL name a picture by that
address and SHALL NEVER carry its bytes: CasparCG 2.5.0 keeps memory in proportion to every
`CG UPDATE`'s bytes for the life of the process. No picture SHALL be served from a console PC.

#### Scenario: A picture is stored once

- **WHEN** two consoles send the same picture
- **THEN** the bridge stores one file and answers the same SHA-256 to both

#### Scenario: A picture over the limit is refused in the operator's words

- **WHEN** a console sends a picture larger than 4 MB or 3840 × 2160 pixels, or a page list of more
  than 500 pages
- **THEN** the bridge refuses it with a sentence naming the limit, and stores nothing

#### Scenario: The template server serves a stored page and nothing near it

- **WHEN** CasparCG fetches `/page/<sha256>.png` for a picture the bridge stored, and another path
  under `/page` or a picture it does not hold
- **THEN** the first answers `200 image/png` with the stored bytes, and the others answer `404`

#### Scenario: Pages survive a restart and leave with their row

- **WHEN** CG Bridge restarts, and later the row is removed
- **THEN** the row still has its pages and its page number after the restart, and once it is
  removed every picture no other row names is deleted

### Requirement: Next, Previous and Go to on a page list move one absolute page

`stack.page { itemId, field, to }` with `to` = `next`, `previous` or a page number SHALL move the
row's page for that page list: under a non-wrapping list Next on the last page and Previous on the
first stay put; under a wrapping list they wrap. A row's turns, and an update on a row with a book,
SHALL be applied one at a time in the order received, each from the page the one before it left.
When the row's template is on its layer (pre-rolled or on air) a turn SHALL send exactly one
`CG UPDATE` carrying `__cg.page` with the new index and that page's address; on any other row it
SHALL change state only and send nothing. A take SHALL carry the current page of the template's first
page list. Changing the pages of a row SHALL keep the current page number when the new book still
has it, else go to page 1, told to the page in the same command as the new book; the row's counter
reads the page it is on.

#### Scenario: A page turn on air sends one command naming one picture

- **WHEN** the operator presses Next on an on-air book row at page 12 of 300
- **THEN** the bridge sends one `CG UPDATE` whose `__cg.page` names index 12 (page 13) and page 13's
  address — not its bytes — and the row reads `13 / 300`

#### Scenario: Ten presses at once turn ten pages

- **WHEN** ten Next presses reach the bridge at once on an on-air book at page 1 of 12
- **THEN** the answers read pages 2 to 11 in order, and the page is told indexes 1 to 10 in order

#### Scenario: A page turn on a row with nothing on its layer sends nothing

- **WHEN** the operator presses Next on a book row whose template is not on its layer
- **THEN** the row's page number changes and no command reaches CasparCG; the next take opens on it

#### Scenario: Another console sees the same pages

- **WHEN** one console loads a book on a row
- **THEN** a second console on the same channel shows the same page count and page number

## MODIFIED Requirements

### Requirement: The bridge serves retained template HTML over HTTP

The bridge SHALL run a small HTTP server (separate from the control WebSocket) that serves each stored
template version at `/template/<key>`, returning the stored HTML as `200 text/html; charset=utf-8` with
`Cache-Control: no-store`, and `404` (also `no-store`) for a key no stored version has. A version stored
from `CENTRAL-BRIDGE-01` on SHALL be served at `<templateId>~<versionId>` — its content's id — for as long
as it is stored; a version stored before keeps the key it was given, and no later version SHALL ever be
given that key (`B-293`: CasparCG's CEF keeps pages on disk, so a URL that changed its page could air the
cached old one — the Playout team's rule 12). A take's `CG ADD` SHALL use the key of the version the row's
own channel lists. Removing a version SHALL stop serving its key. The server holds template HTML and,
since `R-100`, the book pages CG Bridge stored (`GET /page/<sha256>.<ext>`, read-only) — it exposes no
control, identity or data surface, and its route set is exactly those three routes (`SECURITY.md`).

The served HTML SHALL be self-contained: the runtime, scene, images, AND the bundled app fonts
(Vazirmatn / Exo 2) are inlined (base64), so CasparCG fetches nothing else for it — Persian text renders
with the correct face and intact shaping. The one thing a page fetches is an operator's book page, from
its own origin, by the address a page turn names.

#### Scenario: A known template serves its stored HTML, never stored by the client

- **WHEN** a listed template's URL `/template/<templateId>~<versionId>` is fetched **THEN** the server
  returns `200 text/html; charset=utf-8` with exactly the stored HTML and `Cache-Control: no-store`

#### Scenario: An unknown key is 404

- **WHEN** `/template/<key>` is fetched for a key no stored version has **THEN** the server returns `404`
  with `Cache-Control: no-store`

#### Scenario: A re-import is served at a new path

- **WHEN** a template id is re-imported with new content and no row holds its previous version **THEN**
  the new version is served at its own `<templateId>~<versionId>` path and the next take names it, and the
  previous path answers `404` — never the new page

#### Scenario: A held version keeps its path beside the new one

- **WHEN** a template is re-imported while a row still holds the previous version **THEN** the previous
  version is served at its own path byte for byte, and the new version at `<templateId>~<versionId>`

#### Scenario: A version stored before keeps its path, and no later version takes it

- **GIVEN** a version stored before `CENTRAL-BRIDGE-01`, served at the bare template id
- **WHEN** a new version replaces it and it is collected **THEN** the new version is served at its own
  qualified path, and the bare path answers `404`

#### Scenario: The served page is self-contained including fonts

- **WHEN** the served HTML is inspected **THEN** it contains the bundled Persian `@font-face` faces inlined
  as base64 `data:` URIs and references no external `/fonts/…`, `https:` or `<link>` resource
