# Prepare the 0.12.2 installers

## Why

The delivered `0.12.1` installers already identify one tested set of bytes. A CG Control source-picker
follow-up and `B-355` landed afterwards, so rebuilding under `0.12.1` would make that identity ambiguous.
`B-355` changes the production CG Bridge's on-air refusal boundary as well as CG Control's parity and feedback,
so the owner needs new installable CG Control and CG Bridge builds while the project preserves one matching
version across CG Control, CG Designer and CG Bridge. The owner's installed baseline remains `0.11.6`; that
station receives all three so it also receives the accumulated Designer work after `0.11.6`.

## What changes

- Move all release-version sources and derived installer surfaces to `0.12.2`.
- State the installation scope explicitly: over a complete `0.12.1` set, CG Bridge and CG Control need to be
  reinstalled and Designer is optional; over the owner's installed `0.11.6`, apply all three installers.
- Prepare the version-specific Persian guide and verify it names the exact candidate files.
- Run the full local gate, Linux CI including E2E, and an on-demand Windows Desktop build triggered by the final
  installer marker or by manual dispatch.
- Download all three installers and record each exact filename, byte size and SHA-256 hash with the Desktop run
  URL.
- Keep publication out of scope: no tag, draft release or published release.

## Impact

There is no schema, protocol or compatibility-floor change. The source-picker follow-up is confined to CG
Control, while `B-355` changes both CG Control's parity/feedback and CG Bridge's production air boundary. The
repository and Windows pipeline continue to emit one internally consistent three-installer set. Existing
`0.12.1` CG Control and CG Bridge installations need replacement for this delivery; its Designer does not.
The owner's `0.11.6` station receives the complete `0.12.2` set, verified by `acceptance-upgrade-0116`.

## Lane

**FULL lane.** Release identity and Windows installer evidence are delivery-critical. Completion requires the
local gate, authoritative Linux CI/E2E, the on-demand Windows workflow, and retained checksummed artifacts.
