## Why

The installed Designer can select and preview a shared text file, but CG Bridge still uses its
private default text-source folder unless an administrator edits `cg-bridge.json` by hand. Browser
development hid this deployment gap because `dev:station --fake` was explicitly given the shared
root. The installed CG Control therefore asks for the correct relative filename while Bridge looks
in a different folder and returns `ENOENT`.

## What Changes

- Add an optional **Shared text folder** field and native folder picker to CG Bridge Setup.
- Persist that server-specific local or UNC folder as `textSourceRoot`; preserve it on upgrades.
- Add `/TEXTSOURCEROOT=` to the silent installer contract and verify both windowed and silent paths.
- Keep templates portable: they continue to store only the relative filename, never a workstation's
  absolute or UNC path.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `desktop-delivery`: installed CG Bridge setup configures the live shared-text root used by every
  CG Control console.

## Impact

- CG Bridge NSIS installer and CG Setup's Bridge page.
- Windows installer smoke and deployment documentation.
- A new matching installer identity is required.
