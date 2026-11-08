## Why

Changes accepted after an installer release currently live across task notes and conversations, so they can
be omitted from the next handoff. The company website also needs one durable page where every version can
later expose its own guide, three installers and checksum.

## What Changes

- Add one tracked structured release-history source containing completed and planned changes.
- Generate a standalone Persian RTL HTML page with a clickable section per version.
- Reserve the exact five download filenames per version and activate them from an optional host base URL.
- Refuse an installer build until its version has a release-history entry.
- Publish the generated page as a separate workflow artifact without changing the five-file release contract.

## Capabilities

### Modified Capabilities

- `desktop-delivery`

## Impact

Release documentation, release tooling/tests and the Windows desktop workflow. No runtime application or
existing GitHub release asset changes are required.
