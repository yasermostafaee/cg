# Change: Rebuild the production starter gallery

## Why

The bundled Persian starters demonstrate older, narrow slices of Designer. They do not teach the
current high-volume data, file-backed, image-sequence, countdown-step or multibox workflows that a
broadcast designer now needs to discover from the landing page.

## What Changes

- Re-audit and visually verify every existing Persian starter against the current schema/runtime.
- Keep all gallery display titles Persian-only, removing the older starters' redundant English
  suffixes without changing their stable identifiers.
- Remove explanatory/training text from rendered graphics; keep authoring guidance in gallery
  descriptions and documentation, not on air.
- Add a one-page Iran Premier League table with Persian labels and digits and no update-date line.
- Add a multi-page Iran province-capital weather graphic driven by Sequence + Repeater data, ordered
  by the Persian alphabet without regional grouping or page-number graphics; play every page once,
  including its full dwell, then close automatically with an overall animated exit.
- Add a one-page today-and-next-days weather forecast with equally sized daily maximum/minimum values.
- Center each forecast number and its Persian label in identical columns, independently of digit count.
- Add a folder-backed, manually advanced Quran-page Sequence example with several high-quality
  full-frame pages instead of placeholder SVG artwork.
- Add an Azan lower-third Countdown with an editable absolute date/time and remaining-time Steps;
  at zero it becomes «اذان مغرب به افق تهران» and remains until manual Stop, rather than closing itself.
- Add a real-Looks multibox with one full-screen plate, larger two/four-plate layouts and a
  three-plate layout with two above one; no detached per-input titles or background plates.
- Drive weather pictures from a visible, normally authored weather-type choice and image-change
  value rules, using one consistently styled, continuously animated icon family. Remove the
  unexplained forecast percentage.
- Derive league ranks from visible row order, use uniform rank/points treatment and subtle zebra
  rows, and include the team crests from the owner-specified Varzesh3 reference.
- Keep all eighteen league rows inside a navy/slate/ivory panel, enter top-to-bottom, exit last-to-first,
  then fade the background through visible authored keyframes.
- Adopt the owner's saved league heading, badge removal, frame-84 keyframes and 200/50/30 ms row
  entrance/exit/stagger, normalizing asset references without changing the original project.
- Present Quran pages as one wide full-screen ornamental title or verse/translation image per
  Sequence item, following the owner's latest examples instead of the superseded two-page spreads.
- Re-check nested ticker text, lifecycle/loop markers and every old/new Persian starter after import.
- Keep full-screen starters as one main composition; reserve separate on-air wrapper compositions
  for small overlays such as logos, tickers and the Azan lower third.
- Give the full-screen examples a cohesive, premium broadcast visual treatment with restrained
  atmospheric backdrops, clear hierarchy and consistent spacing.
- Use the official APASAI logo as a replaceable image asset anywhere a starter needs a network mark,
  so replacing the image preserves the starter's authored animation; no logo tile/background.
- Extend the guest-title name plate under its transparent APASAI image, using the same animated
  background rather than adding a separate logo backplate.
- Present the APASAI mark, name and website link on the Designer landing/About surfaces and in the
  CG Control header.
- Generate and verify a real landing-card poster for every starter.
- Add a short, smooth 30 fps motion excerpt at a modest 1.15× speed for every starter, lazy-played from the landing card on
  hover/focus so the gallery demonstrates motion without downloading or waiting through full
  playout durations.
- Keep the gallery Persian-only; an English Premier League starter is explicitly out of scope.

## Impact

- Affected PRD: D-179.
- Affected packages: `@cg/starter-templates`, Designer starter assets/shell and CG Control shell.
- Uses existing scene, field, Sequence, Repeater, Countdown, value-rule and multibox contracts; no
  weather- or league-specific runtime behavior is introduced.
