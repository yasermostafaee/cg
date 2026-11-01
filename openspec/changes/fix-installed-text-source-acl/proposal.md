## Why

CG Designer `0.12.3` registers native shared-text-file picker and reload commands, but its packaged
window is not allowed to call them. The browser build bypasses that Tauri boundary, so the feature
passed browser tests while the installed product refused its primary action.

## What Changes

- Declare both text-source commands in the Designer Tauri app manifest and grant their generated
  permissions only to the bundled Designer window.
- Add a source contract that keeps every custom desktop command aligned with its capability.
- Extend the installed-app smoke so a packaged Designer proves the reload command reaches native
  code rather than an ACL refusal.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `designer-dynamic-fields`: the installed Designer can execute the native picker/reload operations
  already required by fixed and dynamic text-file authoring.

## Impact

- Designer Tauri build manifest and window capability.
- Cross-app desktop capability regression test and Windows installer smoke.
- A new installer identity is required because the packaged executable changes.
