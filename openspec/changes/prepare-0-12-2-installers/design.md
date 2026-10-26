# Design — 0.12.2 installer candidate

## One fresh identity

`0.12.1` already names delivered artifacts, so the next candidate is `0.12.2`. The repository's nine version
sources remain the authority. Installer filenames, Installed apps entries, application version surfaces and
CG Bridge's startup/health version derive from that one value, and packaging stops if any source disagrees.

## Matching build set and the installed baseline

CG Control, CG Designer and CG Bridge are built as one `0.12.2` set because release identity and Desktop
acceptance are shared. The source-picker change is in CG Control, and `B-355` changes CG Bridge's production
air-boundary enforcement as well as CG Control's parity and feedback. A station already on the complete `0.12.1`
set therefore needs CG Bridge and CG Control; Designer is optional there because it has no product change in this
candidate. The owner's actual installed baseline is `0.11.6`, so that handoff applies all three `0.12.2`
installers and is proved by the existing `acceptance-upgrade-0116` job with a row on air and both apps open.

## Evidence sequence

1. Set every release-version source and the release-version regression pin to `0.12.2`.
2. Prepare the Persian `0.12.2` guide, naming the exact installers and both upgrade cases above.
3. Push a preliminary `0.12.2` ref and run `guide-shots`; replace the version-bearing pictures from that run,
   record its URL, then build and test the final PDF. Those preliminary installers are not the handoff.
4. Run the full local gate, then push the candidate to `dev` and wait for the Linux workspace and E2E jobs to
   complete green on the candidate commit.
5. Build Windows artifacts from that exact commit through the on-demand Desktop path: a final non-doc push whose
   head carries the installer marker, or a manual dispatch if no such push starts the workflow. All applicable
   installer, smoke and acceptance jobs, including `acceptance-upgrade-0116`, must complete green.
6. Download all three installer artifacts, assemble the three release-named executables, final guide and
   `SHA256SUMS.txt` in untracked `installers-ci-0.12.2/`, and record exact filenames, byte sizes, hashes and the
   run URL in `tasks.md`.

Evidence belongs to one exact commit. A green Linux run for a different tree or a Windows run that skipped its
installer jobs does not satisfy the candidate.

## Publication boundary

The marker/manual Desktop path creates expiring workflow artifacts. This change does not create `v0.12.2`, a
draft release, or a published release. Any publication remains a separate owner decision.
