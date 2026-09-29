## MODIFIED Requirements

### Requirement: The bridge retains delivered template HTML keyed by id

The bridge's template registry SHALL store each delivered template VERSION — its `TemplateInfo` and its
HTML — once, keyed by its content, and SHALL keep, per CasparCG channel, the list of templates that
channel offers, each at the version that channel imported (`CHANNEL-TEMPLATES-01`). An import SHALL list
the template on the channel it names; re-importing the same id on a channel SHALL move that channel's
list to the new version and leave every other channel's list as it was; importing content already
stored SHALL reuse the stored version. A request that names no channel SHALL act on every declared
channel.

The registry SHALL record, for each row, the version its page was last served from (a HOLD), and SHALL
keep a version stored while any channel lists it, any row holds it, or a `CG ADD` of it is in flight; a
version none of these keeps SHALL be removed with its file. The registry SHALL expose each version's
HTML so the HTTP server can serve it and the `CG ADD` URL can resolve to it.

The registry SHALL persist its versions (one file each, in the templates directory) and its lists and
holds (one index file beside them), so a bridge restart neither empties a channel's list nor forgets a
page on air. On the first load of a library written before the per-channel lists, every declared channel
SHALL list every stored template once; a second load SHALL copy nothing, and with no channel declared the
library SHALL be kept, uncollected, until one is.

#### Scenario: Import retains the HTML on the channel it names

- **WHEN** a `templates.import` for id `X` naming channel 2 arrives over the WebSocket **THEN** the bridge
  stores the HTML so channel 2's list returns exactly that HTML for id `X`, and channel 1's list does not
  list `X`

#### Scenario: Re-import on one channel moves that channel only

- **WHEN** a second `templates.import` for id `X` naming channel 2 arrives with different HTML **THEN**
  channel 2 lists the new version, channel 1 keeps the version it listed, and one file is stored per
  version

#### Scenario: Unknown id has no stored HTML

- **WHEN** the registry is queried for the HTML of an id that no channel lists **THEN** it returns nothing
  (null), with no error

#### Scenario: A held version outlives every list

- **WHEN** a row's page was served from a version and every channel's list then moves off it **THEN** the
  version stays stored and served until the row takes another version or leaves the stack, and across a
  bridge restart

### Requirement: The bridge serves retained template HTML over HTTP

The bridge SHALL run a small HTTP server (separate from the control WebSocket) that serves each stored
template version at `/template/<key>`, returning the stored HTML as `200 text/html; charset=utf-8`, and
`404` for a key no stored version has. A version's key SHALL be the bare template id when no other stored
version of that id has it, and `<templateId>~<versionId>` otherwise; it SHALL never change while the
version is stored (`CHANNEL-TEMPLATES-01`). A take's `CG ADD` SHALL use the key of the version the row's
own channel lists — so a station with one version of each template sends exactly the URL it always did.
Removing a version SHALL stop serving its key. The server holds template HTML only — it exposes no
control surface, and its route set is unchanged.

The served HTML SHALL be self-contained: the runtime, scene, images, AND the bundled app fonts
(Vazirmatn / Exo 2) are inlined (base64), so CasparCG fetches nothing else — Persian text renders with the
correct face and intact shaping.

#### Scenario: A known template serves its stored HTML

- **WHEN** a listed template's URL `/template/<id>` is fetched **THEN** the server returns
  `200 text/html; charset=utf-8` with exactly the stored HTML

#### Scenario: An unknown template id is 404

- **WHEN** `/template/<id>` is fetched for an id that was never imported **THEN** the server returns
  `404`

#### Scenario: A re-import nothing holds replaces the served HTML at the same path

- **WHEN** a template id is re-imported on a channel and no row holds its previous version **THEN** the
  next fetch of its URL returns the new HTML (the prior HTML is no longer served)

#### Scenario: A held version keeps its path beside the new one

- **WHEN** a template is re-imported while a row still holds the previous version **THEN** the previous
  version is served at its own path byte for byte, and the new version at `<templateId>~<versionId>`

#### Scenario: The served page is self-contained including fonts

- **WHEN** the served HTML is inspected **THEN** it contains the bundled Persian `@font-face` faces inlined
  as base64 `data:` URIs and references no external `/fonts/…`, `https:` or `<link>` resource
