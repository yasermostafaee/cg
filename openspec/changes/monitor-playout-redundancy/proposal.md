# Monitor Apasai Playout redundancy

## Why

Apasai Playout manages the linked engines of each channel. CG Control needs to show the programme
return of each of those engines and identify the control owner when the status can be verified.

## What changes

- Discover linked engines for the selected channel, up to four including the configured engine.
- Show named programme pictures separately and offer one console-local sound source.
- Keep the existing monitor path available for legacy Playout and Bridge configurations.
- Implement active-only command delivery for complete, prepared layouts through the External
  CG v2 API. Store the exact request before sending it and resolve uncertain outcomes by receipt.
- Connect Play, Update, Stop and Clear to the opt-in static HTML pilot. Restore Control rows
  from Playout's applied state and allow a fresh HTML renderer to resume that state.
- Verify that Playout prepares the reserve and transfers the graphic on a real isolated
  Engine/Core pair before station use.

## Capabilities

- `runtime-ui`: monitor each linked engine for the selected logical channel.
- `runtime-caspar-bridge`: relay verified, channel-scoped programme picture and sound.
