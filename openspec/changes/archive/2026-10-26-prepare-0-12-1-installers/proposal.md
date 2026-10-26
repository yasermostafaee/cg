# Prepare the 0.12.1 installers

## Why

The owner has `0.11.6` installed, while completed features and fixes have landed after the already-tagged
`0.12.0`. Those newer bytes cannot be rebuilt under the existing `0.12.0` identity. A new tested candidate is
needed for CG Control and CG Designer, with the matching bridge still built and exercised by CI.

## What changes

- Move the shared CG Control, CG Designer and CG Bridge version to `0.12.1` in all nine version sources.
- Produce a Persian guide with fresh, real screenshots from the same candidate.
- Run the full local/Linux gates and the complete Windows Desktop workflow, including the installed
  `0.11.6 → 0.12.1` upgrade acceptance.
- Download the requested CG Control and CG Designer installers and record their hashes.
- Keep publication out of scope: no tag, draft release or published release without a separate owner decision.

## Impact

There is no schema, protocol or compatibility-floor change. The existing `0.11.4` format floor remains. All
three installers carry one version, but a machine only needs a component reinstalled when that component or a
shared compatibility contract changed; this candidate is nevertheless tested as one matching set.

## Lane

**FULL lane.** Installer and upgrade behaviour are release-critical and require the local gate, Linux CI, the
Windows installer/smoke workflow and retained downloadable artifacts.
