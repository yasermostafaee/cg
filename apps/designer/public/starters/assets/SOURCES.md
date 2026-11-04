# Starter artwork sources

## Weather

The five `weather-*.svg` files use one coherent Meteocons Fill icon family by Bas Milius,
from `@bybas/weather-icons` version 2.0.0, `production/fill/all/`.
Upstream: <https://github.com/basmilius/meteocons>. License: MIT; the complete notice is
included in `meteocons-LICENSE.txt` and embedded as an XML comment in each SVG so project and
template exports carry attribution with the image bytes. SVG animations retain `repeatCount="indefinite"`.

## Iran Premier League

Standings and club crest sources were read on 2026-11-04 from the page requested by the owner:
<https://www.varzesh3.com/football/league/6/لیگ-برتر-ایران>.
The `league-*.png` filenames retain the upstream file token from
`https://match-cdn.varzesh3.com/football-team/<token>.png`.
The source displayed 18 team rows (Persepolis through Mes Shahr-e Babak), last updated
9 Aban 1405 at 19:38. Its order, scores and explicitly noted two-point Malavan deduction are
preserved as a static teaching sample. Each crest was matched to its own table row, not inferred
from a separate team-name list.
They are examples, not a live feed. Club marks belong to their respective owners; no independent
redistribution license is asserted. Confirm asset rights before redistributing a customer pack.

## Wide Quran slides

Each `quran-wide-*.png` is an original, deterministic 1920×1080 slide. The owner's five supplied
reference screenshots established the cream/gold ornamental style, title/verse layout and Persian
translation wording. They are references only: no screenshot pixels, player bars or website marks
are reproduced. These wide slides supersede the earlier two-page-spread design.

Arabic for Al-Fatihah 1:1–1:3 was verified against <https://quran.com/fa/al-fatihah> and is laid out
as exact Unicode text with the Amiri Quran font, not generated/redrawn by AI. Persian wording follows
the owner's supplied examples. Decorations are original vector paths. The bundled Amiri Quran font
comes from <https://github.com/google/fonts/tree/main/ofl/amiriquran> under SIL OFL 1.1; its complete
license accompanies the regeneration font at `tools/quran-slide-source/OFL.txt`. Persian text uses
the repository's already licensed Vazirmatn. Regenerate with
`node tools/generate-quran-slide-assets.mjs`; no network requests or new dependencies are needed.

## APASAI

`apasai-logo.svg` is the repository's existing APASAI mark, with its transparent dark-background
variant and the exact brand-blue arc. It does not include the app icon's white rounded-square tile.
