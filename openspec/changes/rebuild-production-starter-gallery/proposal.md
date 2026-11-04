# Change: Rebuild the production starter gallery

## Why

The bundled Persian starters demonstrate older, narrow slices of Designer. They do not teach the
current high-volume data, file-backed, image-sequence, countdown-step or multibox workflows that a
broadcast designer now needs to discover from the landing page.

## What Changes

- Re-audit and visually verify every existing Persian starter against the current schema/runtime.
- Add a one-page Persian Azadegan League table with Persian labels and digits.
- Add a multi-page Iran province-capital weather graphic driven by Sequence + Repeater data.
- Add a one-page today-and-next-days weather forecast.
- Add a folder-backed image Sequence example.
- Add a target-time Countdown example with remaining-time Steps and conditional treatment.
- Add a polished multibox example.
- Generate and verify a real landing-card poster for every starter.
- Keep the gallery Persian-only; an English Premier League starter is explicitly out of scope.

## Impact

- Affected PRD: D-179.
- Affected package: `@cg/starter-templates` and Designer starter assets/posters.
- Uses existing scene, field, Sequence, Repeater, Countdown, value-rule and multibox contracts; no
  weather- or league-specific runtime behavior is introduced.
