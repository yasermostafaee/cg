# Prepare the 0.12.4 installers

## Why

`0.12.3` already identifies delivered installer bytes, while `B-356` changes the installed Designer executable:
its native fixed-file picker and reload commands must cross Tauri ACL. Rebuilding under `0.12.3` would give two
different products the same identity.

## What changes

- Move every release-version source to `0.12.4` and provide the matching Persian guide.
- Build CG Bridge, CG Control and CG Designer from one verified commit so the installed suite stays aligned.
- Prove local and Linux gates plus the Windows installed-app and upgrade workflow, including the new ACL smoke.
- Download the three final installers with hashes into the local delivery folders. No tag or release is published.

## Lane

**FULL lane.**
