# Tasks — production starter gallery (D-179, owner re-review)

## 1. Contract and audit

- [x] 1.1 Register D-179 and the Persian-only starter list, excluding the English league example.
- [x] 1.2 Audit the five existing starters for current schema, lifecycle, binding and visual regressions.

## 2. Data-rich starters

- [x] 2.1 Add the one-page Persian Iran Premier League table.
- [x] 2.2 Add the multi-page Iran province-capital weather Sequence + Repeater example.
- [x] 2.3 Add the one-page today-and-next-days weather forecast without requiring Sequence.

## 3. Capability starters

- [x] 3.1 Add the folder-backed image Sequence example.
- [x] 3.2 Add the target-time Countdown with remaining-time Steps and conditional treatment.
- [x] 3.3 Add the polished multibox example.

## 4. Gallery and verification

- [x] 4.1 Register the new Persian starters with clear landing-card copy and stable order.
- [x] 4.2 Generate a real poster for every new starter and visually inspect desktop and card-sized output.
- [x] 4.3 Add focused schema/feature/default/catalog tests and run package build/typecheck/tests.
- [x] 4.4 Run Designer smoke coverage, strict OpenSpec validation and the full repository gate before push.

## 5. Owner re-review corrections

- [x] 5.1 Replace the Azadegan sample with the Iran Premier League; keep Persian labels/digits and
      remove the unnecessary update-date line.
- [x] 5.2 Rebuild province-capital weather so one weather-type choice field drives a value rule that
      swaps a consistent, attractive animated icon pack automatically.
- [x] 5.3 Replace the folder Sequence's placeholder SVGs with several high-quality full-frame Quran
      page images, make page advance manual by default, and verify operator page turning.
- [x] 5.4 Rebuild the multibox sample around the real Looks capability with four presets (one, two,
      three and four equal-sized plates per preset); keep captions outside the live-picture area so
      they remain visible in output.
- [x] 5.5 Repair the nested ticker composition so its crawl text measures and renders once rather
      than overlapping when the on-air composition instances it.
- [x] 5.6 Audit starter lifecycle markers so every loop/hold visualization is internally consistent;
      no dotted start may imply a missing Hold start.
- [x] 5.7 Regenerate posters, visually inspect every old and new Persian starter in Designer and
      Preview, and rerun focused package plus full-repository verification.
- [x] 5.8 Remove redundant on-air wrapper compositions from full-screen starters (league, weather,
      Quran pages and multibox); keep wrapper compositions only where a small overlay such as a logo
      or ticker needs a separate on-air placement.
- [x] 5.9 Replace fictional vector network marks with the official APASAI image asset while keeping
      animation on the image element so an operator can replace only the asset.
- [x] 5.10 Add APASAI logo/name/link branding to the Designer landing and Help/About surfaces and to
      an appropriate persistent CG Control surface.
- [x] 5.11 Add lazy, silent, accelerated WebM previews to every gallery card; play them on hover or
      keyboard focus, reset to the poster on leave, and respect reduced-motion preferences.
