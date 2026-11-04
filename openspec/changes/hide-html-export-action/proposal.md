# Hide the HTML export action

## Why

Normal Designer deliveries use `.vcg`. The single-file HTML exporter remains useful to development
and automated tests, but exposing it beside the delivery action makes the customer workflow unclear.

## What changes

- Remove the **Export HTML** button from the composition action bar.
- Keep the exporter, bridge method and tests intact for internal/direct use.

## Impact

Designer UI only. No export format, schema or runtime change.
