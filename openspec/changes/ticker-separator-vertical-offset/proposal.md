## Why

Ticker separator pictures can contain uneven transparent padding, so their visual centre does not always
align with adjacent text even when the image box follows the ticker's vertical alignment.

## What Changes

- Add an optional signed vertical offset to an image separator.
- Expose the offset in the ticker Inspector.
- Apply it equally to the static Canvas row and the live Preview/export/on-air crawl.

## Capabilities

### Modified Capabilities

- `designer-ticker-element`

## Impact

Shared ticker schema, Designer Inspector and template-runtime ticker rendering. Existing tickers omit the
property and retain their current position.
