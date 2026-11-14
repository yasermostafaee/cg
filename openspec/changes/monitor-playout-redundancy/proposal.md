# Monitor Apasai Playout redundancy

## Why

Apasai Playout manages the linked engines of each channel. CG Control needs to show the programme
return of each of those engines and identify the control owner when the status can be verified.

## What changes

- Discover linked engines for the selected channel, up to four including the configured engine.
- Show named programme pictures separately and offer one console-local sound source.
- Keep the existing monitor path available for legacy Playout and Bridge configurations.
- Track active-only CG command routing as a separate acceptance step requiring the Playout
  contract for external graphics and a transfer test.

## Capabilities

- `runtime-ui`: monitor each linked engine for the selected logical channel.
- `runtime-caspar-bridge`: relay verified, channel-scoped programme picture and sound.
