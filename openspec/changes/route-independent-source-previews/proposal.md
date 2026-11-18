# Independent source-preview reads

## Why

Source presence can correctly report A missing and B available while the preview
reader still addresses A. A B-active station can therefore show a different source
in the picker, local preview and listening controls. A/B availability badges also
do not identify the server that supplied the picture currently on screen.

## What changes

- Select a read target for each source using verified active-monitor topology and
  independently observed availability. Use an available reserve when A lacks the source.
- Resolve B input identities through its own channel-scoped D10 mappings and its
  own physical Playlist channel. Resolve B media through its D11 fingerprint match.
- Keep node authentication, preview leases and request budgets separate, without
  changing output authority or sending programme commands.
- Carry actual engine metadata on accepted snapshots, audio and listen leases,
  and on media/poster responses. Emphasize the existing serving-server badge border
  only after the surface accepts a decoded picture; retained pictures retain their origin.
- When passive PVW and shared snapshots lack a media picture, read its independently
  authorized official poster once per current file identity. Never hide a valid file
  snapshot merely because the passive producer reports absent.

## Impact

Runtime source previews, source-picker cards, Station setup, PVW, shared IPC and
CG Bridge read routing. This does not complete managed external-CG writing,
cross-server frame synchronization or automatic programme failover.
