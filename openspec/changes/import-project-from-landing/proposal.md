# Change: Import an existing project from Landing

PRD: `D-191` in `docs/prd/designer.md`.

## Why

The Designer starts on Landing, but the existing File → Open action is available only inside the
Studio. An author returning to a saved project must first create or open an unrelated project merely
to reach the real project picker.

## What changes

- Add **Import project** beside **New project** on Landing.
- Route Landing and File → Open through one shared disk-project open action.
- Keep picker cancellation on Landing without creating a project or opening the New Project dialog.

## Impact

- Affected capability: `designer-shell`.
- Affected UI: Designer Landing and the shared project-open action.
- No project schema, package format, bridge contract or persistence change.
