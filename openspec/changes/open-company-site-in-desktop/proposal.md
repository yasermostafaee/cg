## Why

B-429 reports that the APASAI website link in the installed apps does not open. The desktop webview
currently receives the same new-tab request as a regular browser.

## What Changes

- Open the APASAI website in the Windows default browser from the installed Designer and CG Control.
- Keep the existing website links in browser deployments.

## Capabilities

- `desktop-delivery`: external navigation from the installed apps.

## Impact

The native shells and their typed renderer bridges. The action has a fixed HTTPS destination.
