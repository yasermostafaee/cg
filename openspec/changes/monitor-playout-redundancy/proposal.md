# Monitor Apasai Playout redundancy

## Why

Apasai Playout manages the linked engines of each channel. CG Control needs to show the programme
return of each of those engines and identify the control owner when the status can be verified.

## What changes

- Discover linked engines for the selected channel, up to four including the configured engine.
- Show named programme pictures separately and offer one console-local sound source.
- Keep the existing monitor path available for legacy Playout and Bridge configurations.
- Implement quorum owner-only command delivery for complete, prepared layouts through the External
  CG v2 API. Store the exact request before sending it and resolve uncertain outcomes by receipt.
- Add an explicitly enabled .37 DualReady path for the isolated managed pilot. One durable
  Bridge can send complete layouts to its selected Engine during a prolonged reserve outage.
  Playout replicates the newest checkpoint and required assets after the reserve returns.
  Graphics use local permits and a durable Bridge selection. Programme and Playlist follow
  their own authority rules.
- Connect Play, Update, Stop and Clear to the opt-in static HTML pilot. Restore Control rows
  from Playout's applied state and allow a fresh HTML renderer to resume that state.
- Connect Next for one finite manual cut sequence. Recover its absolute page from Playout's
  applied layout and keep field edits independent of page turns.
- Verify that Playout prepares the reserve and transfers the graphic on a real isolated
  Engine/Core pair before station use.
- Explain a positively identified External CG v2 refusal on the installed legacy Bridge
  and keep failed preparation muted. Verify the station's command route and programme
  mapping separately after authorized recovery.

## Capabilities

- `runtime-ui`: monitor each linked engine for the selected logical channel.
- `runtime-caspar-bridge`: relay verified, channel-scoped programme picture and sound.
