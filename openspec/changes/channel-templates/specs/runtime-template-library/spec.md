## ADDED Requirements

### Requirement: Each channel has its own template list

The Runtime SHALL keep one template list PER CASPARCG CHANNEL, over one shared store of template
versions (`CHANNEL-TEMPLATES-01`, the owner, 2026-09-28). Each channel is its own programme with its
own operator, who holds only that channel; a template may be listed on several channels, each at the
version that channel imported.

- **The picker** SHALL list the templates of the channel of the row it was opened from, and no other
  channel's. `Import a .vcg` and a `.vcg` dropped on the picker SHALL add the template to that channel
  only.
- **A re-import** (the same template id, new content) SHALL move that channel's list to the new version
  only; every other channel SHALL keep the version it lists until it re-imports. Rows on that channel
  follow the re-import as before (their next take serves the new version); rows on other channels do
  not.
- **The row's delete icon** SHALL remove the template from that channel's list only. Its accessible name
  SHALL read `Remove <name> from CH n`, and its confirm SHALL name the channel. It SHALL be refused while
  a row ON THAT CHANNEL holds the template (the in-use gate, per channel); a row on another channel does
  not refuse it.
- **Storage** SHALL hold one stored file per template version however many channels list it; importing
  the same package on a second channel SHALL reuse it. A version's file SHALL be removed only when no
  channel lists it and no row holds it — a row holds the version its page was last served from.
- **A page on air** SHALL never be touched by a list change: its version's file and its serve path SHALL
  keep serving the same bytes.
- **Permissions**: an import, a re-import and a removal SHALL each be judged by the station fence, the
  channel grant and a channel-scoped lock on the current channel only; nothing on one channel SHALL
  need another. A request that names no channel SHALL be judged on every channel it changes.
- **Source defaults** SHALL NOT be written by a template action: a re-import keeps the channel's
  defaults for every plate that still exists, and a default for a plate the new version no longer
  declares is ignored, never deleted; a removal leaves them in place.
- **The upgrade** SHALL list every template in the station's existing library on every declared
  channel, once, at the version it had, on the first load that has a channel to copy to; a second load
  SHALL copy nothing. A channel declared after that SHALL start with an empty list.

#### Scenario: Each channel's picker shows its own list

- **WHEN** the picker is opened from a row on CH 1 and then from a row on CH 2 **THEN** each lists that
  channel's templates only

#### Scenario: An import on CH 2 adds to CH 2 only

- **WHEN** a `.vcg` is imported from CH 2's picker **THEN** CH 2 lists it and CH 1's list is unchanged

#### Scenario: A re-import on CH 2 moves CH 2 alone, and both versions are served

- **WHEN** a template both channels list is re-imported on CH 2 **THEN** CH 2 lists the new version, CH 1
  keeps the old one, and each is served at its own path

#### Scenario: The same package on two channels is one stored file

- **WHEN** the same `.vcg` is imported on CH 1 and on CH 2 **THEN** one file is stored

#### Scenario: Removing from one channel keeps the file while another lists it

- **WHEN** a template is removed from CH 2 while CH 1 lists it **THEN** its file stays stored, and **WHEN**
  it is then removed from CH 1 with no row holding it **THEN** its file is deleted

#### Scenario: A row on the channel refuses its removal there

- **WHEN** a row on CH 2 holds a template and it is removed from CH 2 **THEN** the removal is refused
  `in-use`, naming that row, and nothing changes

#### Scenario: An operator holding CH 2 only needs nothing else

- **WHEN** an operator whose grant holds CH 2 only imports, re-imports and removes a template on CH 2
  **THEN** none of it is refused, and CH 1's list, rows, Source defaults and on-air page are unchanged —
  while the same acts on CH 1 are refused with the channel grant's sentence

#### Scenario: A page on air survives every act on another channel

- **WHEN** a page is on air on CH 1 and CH 2 imports, re-imports and removes the same template **THEN**
  the page's serve path returns the same bytes before and after

#### Scenario: Nothing disappears at the upgrade

- **WHEN** a station's existing library is loaded for the first time **THEN** every declared channel lists
  every template once, served where it always was; a second load copies nothing, and a channel declared
  later starts with an empty list

#### Scenario: A re-import keeps the channel's defaults and ignores a gone plate's

- **WHEN** a template is re-imported on a channel **THEN** no Source defaults are written: the channel's
  defaults for plates that still exist stay in force, and a default for a plate the new version no longer
  declares is kept and read by nothing

#### Scenario: The delete icon names its channel

- **WHEN** the picker is opened from a row on CH n **THEN** each row's delete icon's accessible name is
  `Remove <name> from CH n`, and its confirm is titled `Remove “<name>” from CH n?`

## MODIFIED Requirements

### Requirement: The bridge is reconciled to the local library on connect

On every (re)connection of the SPA↔bridge WebSocket, the Runtime SHALL deliver the browser-local
library's templates (each template's metadata + produced HTML) to the bridge so the bridge can serve
them to CasparCG when an on-air command later needs them. This reconciliation SHALL generalize the
existing reconnect re-delivery: the local library is the retention set, and its entries are delivered
BEFORE the stack/health/lock snapshot re-pull (single-socket FIFO ordering), so a load issued right
after reconnect resolves against a populated bridge registry.

`CHANNEL-TEMPLATES-01` — the local library SHALL record the CHANNEL each template was imported on, and
each record SHALL be re-delivered to that channel only. A record written before the per-channel lists
SHALL be re-delivered naming no channel, which the bridge SHALL read as "restore this if no channel lists
it" and never as a replacement of a version a channel holds. A record for a channel the signed-in
principal does not hold SHALL NOT be sent.

The conflict policy SHALL be **local-wins, per channel**: the browser library is the source of truth for
the channel a record names, so reconciliation makes that channel's entry reflect it
(delivering/overwriting that channel's copy with the local one). A template registered locally while
disconnected SHALL be delivered to the bridge on the next connect without any operator action.

A confirmed **removal** SHALL NOT be undone by reconciliation (the removed template is no longer in the
local library for that channel, so it is not delivered there); a **refused** removal SHALL leave the
template in the local library and therefore still delivered on reconnect.

#### Scenario: A template imported offline is delivered on reconnect

- **WHEN** a template is imported while the bridge is down and the link later comes up **THEN** the
  runtime delivers that template (metadata + HTML) to the bridge without operator action, so a
  subsequent on-air load of it resolves against a populated registry

#### Scenario: Re-delivery precedes the snapshot re-pull

- **WHEN** the link reconnects with a non-empty local library **THEN** every template re-delivery frame
  is sent before the stack / health / lock snapshot pulls

#### Scenario: A confirmed removal is not resurrected by reconcile

- **WHEN** a template is removed (confirmed) and the link later reconnects **THEN** the removed template
  is NOT re-delivered to the bridge, while every remaining template is

#### Scenario: Each record returns to its own channel

- **WHEN** a template was imported at one version on CH 1 and another on CH 2, and the bridge comes back
  with an empty registry **THEN** reconnect re-delivers each version to its own channel, and neither
  channel receives the other's
