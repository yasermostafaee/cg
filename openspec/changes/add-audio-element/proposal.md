# Sound effects that play with a template's entrance and exit (`D-165`)

## Why

The owner (2026-10-14): _"We also need **sound import**, mostly for **effects between templates**."_
A short sound — a whoosh, a hit, a sting — that plays when a graphic enters or leaves, authored in
the template, and heard on air without anything the operator has to do.

## What Changes

- **Schema (additive).** An `audio` element: `assetId`, `durationMs`, `start` — the graphic's
  `entrance`, a `time` in ms after it, or its `exit` — `volumeDb` (−60…+6, default 0) and optional
  `fadeInMs` / `fadeOutMs`. An `audio` asset kind whose metadata (`audio`) records the source name,
  length, peak dBFS, rate and channels. Every older scene and asset parses unchanged. ONE predicate,
  `hasSoundEffects`, answers "does this template make sound".
- **Template runtime.** The page plays the sound itself (measured, §0.1): an `AudioDriver` decides
  WHEN — once per occurrence, never looped, never gating a hold; an exit sound is not cut by the
  settle that follows the exit; a hard Clear (the page removed) plays nothing; a scrub plays nothing;
  a hidden sound never plays — and a small Web Audio graph decides HOW (the element's gain, its fades,
  a look-park silence for a hidden look, and the page's master mute, `CG.setSoundMuted`).
- **Designer.** Assets `+` → `Audio…` imports WAV, MP3, OGG, M4A (and OPUS, AAC, FLAC by extension)
  as a batch through the in-app converter into ONE stored form — 16-bit PCM WAV, 48 kHz stereo — and
  measures its length and peak, shown on the tile; nothing is normalised. A mono sound keeps its
  level. Dropping a sound on the canvas places ONE `audio` element, which has no box on the canvas
  and its own Inspector section (length, peak, starts, volume, fades). The Preview offers a Sound
  switch, on by default.
- **Exports.** The `.vcg` packs `assets/audio/<sha>.wav` (`kind: 'audio'`); the single-file HTML
  inlines `data:audio/wav`. A missing sound is a preflight error.
- **CG Control.** `TemplateInfo.hasSound`, derived once at import, marks the row with a speaker — a
  fact, not a control. PVW is silent: the rehearsal frame mutes the page through its own runtime.
- **No change to CG Bridge and no new AMCP command.** The page layer's existing volume rule (muted
  before every `CG ADD`, raised to 1 at the take before `CG PLAY`) already makes a template's sound
  audible from its take and silent while cued.

## Impact

- `@cg/shared-schema` (element, asset kind, predicate), `@cg/shared-ipc` (`assets.storeBytes.audio`,
  `TemplateInfo.hasSound`), `@cg/template-runtime` (driver, graph, scene builder, runtime wiring, the
  `setSoundMuted` export), `@cg/single-file-export` (sound inlining), the Designer (import, converter,
  tile, placement, Inspector, Preview, exporter, asset store) and CG Control (import, row mark, PVW).
- A template authored before this change is unaffected. A template with sound must be imported into
  CG Control again to show the row mark (`hasSound` is derived at import, like `hasNext`).
- New programme audio from CG on the row's page layer: the Playout team should be told (report).
