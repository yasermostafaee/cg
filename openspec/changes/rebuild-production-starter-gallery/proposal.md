# Change: Rebuild the production starter gallery

## Why

The bundled Persian starters demonstrate older, narrow slices of Designer. They do not teach the
current high-volume data, file-backed, image-sequence, countdown-step or multibox workflows that a
broadcast designer now needs to discover from the landing page.

## What Changes

- Re-audit and visually verify every existing Persian starter against the current schema/runtime.
- Add a one-page Iran Premier League table with Persian labels and digits and no update-date line.
- Add a multi-page Iran province-capital weather graphic driven by Sequence + Repeater data, ordered
  by the Persian alphabet without regional grouping.
- Add a one-page today-and-next-days weather forecast.
- Add a folder-backed, manually advanced Quran-page Sequence example with several high-quality
  full-frame pages instead of placeholder SVG artwork.
- Add a target-time Countdown example with remaining-time Steps and conditional treatment.
- Add a polished real-Looks multibox example with four presets from one to four equal plates.
- Drive weather pictures from an operator weather-type choice and value rules, using one consistent
  animated icon family.
- Re-check nested ticker text, lifecycle/loop markers and every old/new Persian starter after import.
- Keep full-screen starters as one main composition; reserve separate on-air wrapper compositions
  for small overlays such as logos and tickers.
- Give the full-screen examples a cohesive, premium broadcast visual treatment with restrained
  atmospheric backdrops, clear hierarchy and consistent spacing.
- Use the official APASAI logo as a replaceable image asset anywhere a starter needs a network mark,
  so replacing the image preserves the starter's authored animation.
- Present the APASAI mark, name and website link on the Designer landing/About surfaces and in the
  CG Control header.
- Generate and verify a real landing-card poster for every starter.
- Add a short accelerated motion preview for every starter, lazy-played from the landing card on
  hover/focus so the gallery demonstrates motion without downloading or waiting through full
  playout durations.
- Keep the gallery Persian-only; an English Premier League starter is explicitly out of scope.

## Impact

- Affected PRD: D-179.
- Affected packages: `@cg/starter-templates`, Designer starter assets/shell and CG Control shell.
- Uses existing scene, field, Sequence, Repeater, Countdown, value-rule and multibox contracts; no
  weather- or league-specific runtime behavior is introduced.
