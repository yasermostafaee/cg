# Select the destination layer after binding a template

## Why

After loading a template, operators need the newly bound layer's fields in the Inspector.

## What changes

After the Templates dialog closes and CG Bridge accepts the bind, select the destination row.
Cancel and refused binds preserve the current row selection.

## Impact

- PRD B-421, Runtime UI.
- The row's existing selection drives the Inspector. The Bridge contract stays the same.
