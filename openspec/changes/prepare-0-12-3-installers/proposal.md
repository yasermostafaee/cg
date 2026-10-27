# Prepare the 0.12.3 installers

## Why

`0.12.2` already identifies delivered installer bytes. The completed fixed-file authoring/runtime contract,
Designer Variables tab and follow-up Inspector fixes change CG Designer, CG Control and CG Bridge, so rebuilding
with the old number would make two different products share one identity.

## What changes

- Move all release-version sources to `0.12.3` and provide the matching Persian guide.
- Build CG Bridge, CG Control and CG Designer from one verified commit; all three are required over `0.12.2`.
- Prove the local gate, local and Linux E2E, and the Windows installer/upgrade workflow.
- Download the three final installers with hashes into the local delivery folders. No tag or release is published.

## Lane

**FULL lane.**
