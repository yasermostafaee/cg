# Prepare the 0.12.6 installers

## Why

`0.12.5` already identifies built candidate bytes, while the installed Bridge service can still
receive `EPERM` on a correctly configured local shared-text folder. The installer now grants the
service narrow read/execute access, so the corrected bytes need a fresh identity.

## What changes

- Move every release-version source to `0.12.6` and provide the matching Persian guide.
- Build CG Bridge, CG Control and CG Designer from one verified commit.
- Prove first-install and upgrade repair of least-privilege local text-root access.
- Expose the effective shared-files path in CG Control Station setup, with Bridge-side validation.
- Give each Setup a recognisable product ground, give Bridge its own teal icon, and show the real
  version prominently on both app startup splashes.
- Improve Persian-guide line spacing and keep the locked-delimiter tooltip anchored to its value.
- Disable shared Scale edits while every selected Live Source keeps its aspect locked.
- Add one-step symmetric auto-layout for a multi-selection of Live Sources.
- Add optional side-by-side primary/backup programme monitoring with one explicit local sound/VU source.
- Download the three final installers with hashes into the local delivery folders. No tag or release
  is published.

## Lane

**FULL lane.**
