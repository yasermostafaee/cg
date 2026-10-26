# Design — 0.12.1 installer candidate

## One new identity

`v0.12.0` already names an older commit, so the next candidate is `0.12.1`. The repository's nine version
sources remain the authority; file names, Installed apps rows, bridge health and setup windows derive from
that value.

## Two-stage evidence, one final build

The first manual Desktop run happens on a temporary release branch. Its current setup and app screenshot
artifacts provide the real `0.12.1` guide images without placing an incomplete guide on `dev`. After those
images and the guide pass the local gate, the final commit moves to `dev` and Desktop runs again. Only files
from that final green run are handed over.

## Compatibility and installation scope

The format compatibility floor stays `0.11.4`. Desktop's existing `acceptance-upgrade-0116` job is the direct
proof for the owner's installed build: it installs `0.11.6`, drives it, upgrades all three parts with both apps
open, and drives the upgraded station. CG Bridge is built and tested because release identity is shared even
though the requested downloads are CG Control and CG Designer.

## Publication boundary

A manual workflow run creates expiring CI artifacts and no GitHub release. Tagging `v0.12.1`, opening a draft
release and publishing it remain separate owner decisions.
