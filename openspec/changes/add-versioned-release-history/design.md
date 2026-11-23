## Context

The source must be easy to update before packaging and the result must be uploadable to an ordinary company
web host without a framework or server-side renderer. Hosted file locations are not known yet.

## Decisions

- `docs/release/release-history.json` is the source of truth; generated HTML is never edited by hand.
  Confirmed customer-delivered versions use published status and publication wording in all three languages.
- `docs/release/index.html` is self-contained and responsive. Persian is the initial RTL view and uses
  embedded Vazirmatn. The manual language switch offers English in LTR and Arabic in RTL. Schema version 3
  requires all three translations. Sources using schema version 1 or 2 retain Persian and English.
  Native `details` elements make each
  numbered version independently clickable, with separate feature, fix and pending lists.
  Each page contains at most fifteen numbered releases. Previous/next controls show a localized
  page count and enforce the first/last page boundaries. `next` entries remain authoring data.
- Designer Home and Help and CG Control Station setup embed the generated artifact in a dialog.
  The app build inputs include the generated HTML so cached builds refresh when the page changes.
  Designer history fills the viewport. CG Control retains a 16px margin around its history window.
  Both dialogs keep their shared header and footer and use Close for the footer action.
- Historical release data can carry its optional `downloadBaseUrl`. The public page renders release
  notes and pagination. The installer filenames remain part of the release tooling's asset contract.
- Installer CI passes its current version to the generator. A missing matching history entry is a packaging
  error, so recording changes is part of the release boundary rather than an optional follow-up.
- The HTML is uploaded as `release-history-html`, separate from the exact existing GitHub release assets.

## Hosting

The self-contained generated HTML can be uploaded to the company website.
