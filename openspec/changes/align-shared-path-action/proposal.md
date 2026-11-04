## Why

The Shared files Save path action is visually lower than its input, and the equal two-column grid
leaves too little room to read a normal long Windows or UNC server path.

## What Changes

- Let the path input consume the row's spare width while the action keeps its intrinsic width.
- Align the action to the input control row.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

CG Control settings markup/CSS, a DOM contract check, and real-browser geometry coverage.
