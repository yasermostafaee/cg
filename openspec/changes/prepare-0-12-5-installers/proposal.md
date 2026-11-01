# Prepare the 0.12.5 installers

## Why

`0.12.4` already identifies built candidate bytes, while `B-357` changes CG Bridge's installer and
CG Setup so installed CG Control can read the shared file Designer authored. Rebuilding under
`0.12.4` would give different products the same identity.

## What changes

- Move every release-version source to `0.12.5` and provide the matching Persian guide.
- Build CG Bridge, CG Control and CG Designer from one verified commit.
- Prove windowed and silent shared-text-root configuration, local/Linux gates and the Windows
  installed-app and upgrade workflow.
- Download the three final installers with hashes into the local delivery folders. No tag or release
  is published.

## Lane

**FULL lane.**
