## Why

Changes accepted after an installer release currently live across task notes and conversations, so they can
be omitted from the next handoff. The company website also needs one durable page where every version can
later expose its own guide, three installers and checksum.

## What Changes

- Add one tracked structured release-history source containing completed and planned changes.
- Generate a standalone bilingual HTML page with an embedded Persian font and clickable versions.
- Separate features and bug fixes and expose the same page from Designer and CG Control.
- Reserve the exact five download filenames per version and activate them from an optional host base URL.
- Refuse an installer build until its version has a release-history entry.
- Publish the generated page as a separate workflow artifact without changing the five-file release contract.

## Capabilities

### Modified Capabilities

- `desktop-delivery`

## Impact

Release documentation, release tooling/tests, Designer and CG Control entry points and the Windows
desktop workflow. The five GitHub release assets keep their existing contract.
