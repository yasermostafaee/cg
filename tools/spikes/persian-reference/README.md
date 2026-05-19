# Persian Reference Render — Spike A

A single-file HTML test card exercising 17 sections of Persian/Arabic shaping concerns. Loads identically in modern Chrome and in CasparCG 2.3.x CEF (in theory — that's what the spike measures).

## Sections (in order)

| #   | Test                                    |
| --- | --------------------------------------- |
| 1   | Latin baseline (font fallback sanity)   |
| 2   | Plain Persian sentence (basic shaping)  |
| 3   | Mixed RTL/LTR (bidi at sentence level)  |
| 4   | Latin / Persian / Arabic-Indic digits   |
| 5   | ZWNJ (می‌خواهم vs میخواهم)              |
| 6   | ZWJ (rare but specified)                |
| 7   | Persian punctuation («» ، ؛ ؟)          |
| 8   | Font weights — 400 / 500 / 700          |
| 9   | Multi-line Persian paragraph (RTL wrap) |
| 10  | Numbers + units (mixed direction)       |
| 11  | Emoji embedded in Persian text          |
| 12  | Long compound words with ZWNJs          |
| 13  | Persian date                            |
| 14  | Lower-third mock                        |
| 15  | Breaking news banner mock               |
| 16  | Ticker line (static)                    |
| 17  | Bidi corner: Latin word at line start   |

Each section has a `<p class="note">` describing what a PASS looks like.

## Use locally (browser baseline)

```pwsh
start "" "tools\spikes\persian-reference\index.html"
```

Or drag the file into Chrome. Take a full-page screenshot.

## Use against CasparCG (the actual spike)

```
# In amcp-poke:
PLAY 1-20 [HTML] "file:///<ABSOLUTE_PATH>/tools/spikes/persian-reference/index.html"
CG 1-20 PLAY 1
```

The card is hidden (`body.cg-pending` has `visibility: hidden`) until `window.play()` or `window.cg.play()` is called. CasparCG's `CG ... PLAY 1` triggers that via the global adapter.

## Network dependency

Fonts load from Google Fonts CDN. The CasparCG VM must reach `fonts.googleapis.com` and `fonts.gstatic.com`. If air-gapped, replace the `<link>` tag with relative `@font-face` rules and copy the WOFF2 files into this directory.

## Pass / fail

There is no automated assertion. Spike A is **eyes-on-pixels**. Compare the Chrome screenshot to the CasparCG frame grab side by side; any difference is a finding worth writing into ADR 0003.
