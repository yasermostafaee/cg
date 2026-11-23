## Why

The operator chooses a language during CG Control setup and expects to read both setup and the
first console session in that language.

## What Changes

- Start interactive CG Control setup with English, Persian and Arabic choices.
- Use the selected language on the following setup pages.
- Keep the selection with the installed console and use it as the initial UI and feedback language.
- Apply an explicit setup choice to both language preferences on the next launch, including an upgrade.
- Preserve an existing choice when an upgrade accepts the initial radio selection without interacting with it or runs unattended. Later Settings changes remain independent.

## Impact

- Windows CG Control setup and shell startup.
- CG Control language preferences, release notes and installer acceptance checks.
