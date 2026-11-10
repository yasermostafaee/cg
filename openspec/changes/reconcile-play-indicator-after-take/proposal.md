# Reconcile Play after a successful Take (B-432)

## Why

On a customer station the graphic stays on air after Play, but the button sometimes loses green after a brief warning. The warning and wire transition have not yet been captured.

## What Changes

- Correlate the exact warning and row state with actual layer ownership and confirmation.
- Fix the diagnosed mismatch and keep a usable reason when the state is uncertain.

## Capabilities

### Modified Capabilities

- runtime-ui

## Impact

Capture the exact warning, build, channel and layer, Bridge audit and CasparCG/Core events before altering Take or reconciliation. A visible picture alone does not establish that the console has positive ownership evidence.
