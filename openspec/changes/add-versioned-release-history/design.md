## Context

The source must be easy to update before packaging and the result must be uploadable to an ordinary company
web host without a framework or server-side renderer. Hosted file locations are not known yet.

## Decisions

- `docs/release/release-history.json` is the source of truth; generated HTML is never edited by hand.
- `docs/release/index.html` is self-contained, Persian, RTL and responsive. Native `details` elements make
  each version independently clickable and usable without JavaScript.
- A release stores only an optional `downloadBaseUrl`. Tooling derives the five canonical filenames, avoiding
  duplicated links and spelling drift. Missing URLs render disabled cards rather than dead anchors.
- Installer CI passes its current version to the generator. A missing matching history entry is a packaging
  error, so recording changes is part of the release boundary rather than an optional follow-up.
- The HTML is uploaded as `release-history-html`, separate from the exact existing GitHub release assets.

## Future hosting

When the company host layout is chosen, set each published entry's `downloadBaseUrl`, regenerate the page and
upload it beside the version directories. No product code or HTML template change is needed.
