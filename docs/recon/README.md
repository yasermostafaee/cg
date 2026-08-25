# `docs/recon/` — captured evidence

Raw artifacts and written recon that PRD items and OpenSpec designs cite as evidence, so a claim can
be checked against the thing itself instead of trusted as prose.

- [2026-07-28-casparcg-250-validation.md](2026-07-28-casparcg-250-validation.md) — C-018 CasparCG
  2.5.0 Stable hardware validation.
- [d-086-export-scoping.md](d-086-export-scoping.md) — D-086 export-scoping recon.
- [2026-08-22-confidence-grab-measurement.md](2026-08-22-confidence-grab-measurement.md) — the
  C-016 / C-023 confidence-grab measurement runbook (§A), the 2× discriminator (§B) and the AMCP
  probes the repo already owes (§C). **A FORM, not a report** — its tables are empty until the box
  fills them. Driven by `tools/caspar-amcp-probe/bin/confidence-probe.mjs`.
- [2x-live-source-plant-check.md](2x-live-source-plant-check.md) — the six values that decide
  whether the on-air 2× is a `cg` defect at all. Reproduced as §B above so one visit serves both.
- [2026-08-25-decklink-model-walk.md](2026-08-25-decklink-model-walk.md) — the four questions about
  the `decklink` producer model that source cannot answer: the persistent ID as a PRODUCER argument
  (Q1), AMCP device enumeration (Q2), letterbox-vs-stretch on a mismatched raster (Q3 — a BLOCKING
  dependency for any `MIXER FILL` computed from a source aspect), and whether a second SDI input
  exists for a fill/key pair (Q4 — the gate on C-027). **A FORM, not a report.** It also records
  what the 2026-08-24 run already MEASURED — the plant has a **DeckLink SDI 4K**, index `1`,
  persistent ID `23487013`, proven in both directions — which is what disproved the "no capture
  card" claim C-020 and C-021 carried until then.
- **`ciab-client-tools.json`** — the tool definitions of the plant's **CIAB client**, a **MODIFIED
  CasparCG Client**, not stock CasparCG and **not a description of the CasparCG SERVER**. Its
  `Matrix / Route` tool drives an external Samim or BlackMagic VideoHub over IP and is not AMCP at
  all; `ATEM / *` addresses a Blackmagic ATEM switcher; `Channel / ChannelInput`,
  `Channel / ChannelRecord` and `Add / ChannelSnapshot` are that product's own tools. Only the
  **`Mixers` folder** tracks AMCP's `MIXER` surface closely enough to be evidence about the server —
  and even there the names are the client's (`Transform` for `MIXER FILL`, `Clipping` for
  `MIXER CLIP`, `Crop` for `MIXER CROP`). **Its capture date is UNKNOWN and the owner says it may be
  out of date.** Cite it by entry name (e.g. `ChannelInput`, `Commit`, `ChromaKey`), and never read
  a client tool as a server capability.

Files here are kept **byte-identical to what the tool emitted** — `.prettierignore` exempts
`ciab-client-tools.json` for the same reason it exempts `tools/*/evidence/**`: formatting an
artifact edits the record.
