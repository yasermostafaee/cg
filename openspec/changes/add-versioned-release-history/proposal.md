## Why

Changes accepted after an installer release currently live across task notes and conversations, so they can
be omitted from the next handoff. Both apps need a durable, readable account of each recorded release.

## What Changes

- Add one tracked structured release-history source containing completed and planned changes.
- Generate a standalone Persian, English and Arabic HTML page with embedded Vazirmatn and clickable versions.
- Separate features and bug fixes and expose the same page from Designer and CG Control.
- Fill the Designer viewport for version history, retain CG Control's near-full-window history,
  and provide a Close footer action in both apps.
- Show numbered releases in pages of fifteen, with previous/next controls in all three languages.
- Keep the public history focused on release notes, with draft `next` entries and download sections omitted.
- Refuse an installer build until its version has a release-history entry.
- Publish the generated page as a separate workflow artifact without changing the five-file release contract.

## Capabilities

### Modified Capabilities

- `desktop-delivery`

## Impact

Release documentation, release tooling/tests, Designer and CG Control entry points and the Windows
desktop workflow. The five GitHub release assets keep their existing contract.
