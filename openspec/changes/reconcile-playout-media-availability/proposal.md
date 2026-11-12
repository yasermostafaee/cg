## Why

A previously bound clip can appear in Media Recent while its saved catalogue entry says
Unavailable. A search match was kept in the transient lookup and the bound entry could only
recover through the periodic by-ID read.

## What Changes

- Use positive D11 search and Recent matches to refresh already-bound entries.
- Ask for a by-ID page large enough for the requested batch and use complete pages to detect
  missing items.
- Order overlapping observations by request for each bound clip.

## Capabilities

### Modified Capabilities

- `runtime-playout-sources`: reconcile availability for bound D11 media.

## Impact

CG Bridge's D11 reader and saved media catalogue, plus availability feedback in CG Control.
