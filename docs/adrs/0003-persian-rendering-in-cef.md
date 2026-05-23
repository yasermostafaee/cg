# ADR 0003 — Persian rendering in CasparCG CEF

- **Status:** Accepted
- **Date:** 2026-05-23
- **Spike:** M1 Spike A
- **Capture:** [`fixtures/spike-captures/spike-a-caspar-1080i50.png`](../../fixtures/spike-captures/spike-a-caspar-1080i50.png)

## Context

Phase 1 §1.2 flagged Persian/Arabic rendering inside CasparCG's CEF as a blocking risk. The whole product premise rests on broadcast-quality Persian: if CEF can't shape Persian correctly with Vazirmatn (or an equivalent), we'd need a HarfBuzz-WASM fallback at the broadcast-tier — significantly more engineering.

M1 Spike A exercised the question end-to-end: load `tools/spikes/persian-reference/index.html` (17 sections covering plain Persian, mixed bidi, ZWNJ, digits, punctuation, weights, emoji, lower-third mocks) into CasparCG 2.3.x via `PLAY 1-20 [HTML]`, capture the screen consumer at 1080i50, compare against the same page in desktop Chrome.

## Decision

**Persian rendering in CasparCG 2.3.x CEF is production-quality with Vazirmatn loaded from Google Fonts.** No fallback shaper required.

Specifically:

- **Letter shaping** (initial/medial/final/isolated forms) renders correctly across all observed text. `خبر فوری` → `kha-be-re ` ` foo-ri` with proper joining and detachment.
- **Bidi at sentence and word level** works per Unicode UAX #9. Latin brand names embedded in RTL flow render at the visual right (`OpenAI` at the start of an RTL line).
- **Digits** in all three numeral systems (Latin, Persian `۰-۹`, Arabic-Indic `٠-٩`) render distinctly and don't get auto-converted by the renderer.
- **Multi-weight Vazirmatn** loads from Google Fonts CDN — provided the CasparCG host has internet access. CEF's font-fetch path works.
- **Color emoji** renders correctly (PASS per user observation; not visible in the captured frame because it's below the 1080 fold).

## Consequences

- **Templates ship with Vazirmatn bundled inside the .vcg.** Google Fonts CDN works for the spike, but production stations may be air-gapped. M3.4 (starter template) bundles the WOFF2 files; M3 §6 of `vcg-format` already supports `fonts/` zip entries.
- **No HarfBuzz-WASM fallback needed.** Risk R1 in Phase 8 §16 closes.
- **Bidi caveat for label/value patterns.** In an RTL container, plain text like `Persian:` renders visually as `:Persian` because the colon is weak-bidi. For label/value layouts the designer needs to either (a) put the label in its own LTR span (`<span dir="ltr">Persian:</span>`), (b) wrap in `<bdi>`, or (c) place the colon at the logical start (`:Persian` source text → `Persian:` visual). Worth documenting in the designer guide; not a runtime concern.

## Alternatives considered

- **HarfBuzz-WASM shaper inside template-runtime.** Considered as a fallback if CEF's text engine proved insufficient. Rejected — adds ~200 KB to the broadcast bundle and is no longer necessary.
- **Pre-rasterized Persian text to PNG at runtime.** Considered as a fallback for ZWNJ edge cases. Rejected — CEF handles ZWNJ correctly when Vazirmatn (or any properly-built Arabic-script font) is loaded.

## Open follow-ups

- **Air-gapped font loading test.** This spike loaded Vazirmatn via Google Fonts CDN. M3.4 needs to verify the same fidelity when fonts are bundled inside the .vcg (`fonts/Vazirmatn-Variable.woff2`) and referenced by relative `@font-face`. Expected to work identically — `font-display: block` + `document.fonts.ready` is what guarantees rendering.
- **ZWNJ section visual diff** vs Chrome (section 5 of the reference card) — not captured in the spike frame; user reported "OK" verbally. Recapture if ZWNJ ever becomes a regression suspect.
- **CEF version stability across CasparCG minor releases.** This spike used 2.3.x. Document the observed CEF version in `compatibility.cefMin` on `.vcg` manifests we know to work; bump as we encounter newer CasparCG.
