# Video import element — import a clip as a lifecycle-aware element (D-128)

## Why

The client's broadcast furniture archive is video — legacy AVI, `rawvideo` + BGRA, carrying REAL
alpha (not baked-black). Today it cannot enter a template at all: there is no `video` element
type, no video import path in the ProjectAssetsPanel, and no video branch in either exporter. The
pieces that DO exist are inert plumbing: the manifest already allows `kind: 'video'`
(`AssetEntrySchema`), the asset layer already maps `mp4`/`webm` → `'video'` (`KIND_BY_EXT`,
`PickKind`, the bridge's MIME branch), and both exporters' MIME tables already know
`video/mp4` / `video/webm` — bytes could be stored and named, but nothing creates, renders, or
exports a video element.

As with the D-125 Lottie, the gap that matters is **not** "play a video" — it is **LIFECYCLE**.
An opaque, self-playing clip only earns its place if it plugs into IN / HOLD / OUT, so a native
ticker on top can hold the graphic on air over it (the D-107/D-112 model, unchanged) and the
outro still fires on stop. D-125 built the element-outro seam this element needs
(`playOutro()`, the one-shot outro ledger, every exit path routed through it); this change makes
a second element kind join that seam.

## What Changes

- **Import → crop → convert → place.** The operator imports ANY ffmpeg-decodable video (including
  the legacy `rawvideo`/BGRA AVI archive). An import modal shows a source preview on which an
  OPTIONAL crop region can be marked; conversion then bakes exactly that region (ffmpeg `crop`)
  into ONE canonical stored form — WebM/VP9 with alpha preserved, audio STRIPPED (`-an`) — stored
  as a `video` asset. A new `video` element is created from it and placed on the canvas.
- **In-app converter, offline.** The ffmpeg.wasm converter ships IN-APP, single-threaded and
  VENDORED (no CDN fetch, no COOP/COEP requirement), lazy-loaded on first import, never at
  startup. Multi-GB sources mount via WORKERFS (never loaded whole into memory), with progress
  and cancellation.
- **Opaque, positionable, timed.** The element is positioned / scaled / rotated /
  opacity-animated and timed on the timeline like any other element; the Inspector exposes hold
  behavior, the phase marks (`introEnd` / `outroStart` / optional `idle` — OPTIONAL and MANUAL;
  video has no bodymovin `markers` equivalent) and hold-driving — never the clip's internal
  content.
- **Lifecycle.** On play the clip runs from its start; at the hold point it HOLDS by LOOPING (the
  default — the INVERSE of the Lottie's `freeze`, because video furniture is authored as a loop)
  or freezes opt-in. `drivesHold` carries the Lottie's inverse default (absent ⇒ does NOT drive).
  A marked outro plays through the EXISTING D-125 element-outro seam on every exit path;
  pause/resume stays in lockstep with the injected `RuntimeClock` (the anti-drift question —
  `<video>` has its own clock — is addressed head-on in `design.md`).
- **Both exporters + CEF.** Preview, `.vcg`, and single-file HTML render identically; the
  single-file export carries the video bytes inline with ZERO external requests and must pass the
  existing `cef-compat` scan. An export exceeding the single-file size threshold is reported by
  the EXISTING preflight/issues path before export.
- **`VideoPlaceholderElementSchema` is FROZEN**, not repurposed — it is the live-source plate
  placeholder (D-137), a different feature. This change adds a NEW `VideoElementSchema`.

## Capabilities

- **NEW** `designer-video-element` — the element, its import/conversion flow, lifecycle
  participation, Inspector surface, and both export paths.
- **MODIFIED** `designer-playout-lifecycle` — the "Coordinated animated exit (Out) versus
  immediate clear (Stop)" requirement's definition of _an element that OWNS an outro_ widens from
  "a `lottie` element with an outro segment" to include a `video` element with a marked outro
  (`phases.outroStart`). No other living spec is genuinely modified: the Designer-side import UX
  requirements in `designer-project-assets` stay true as written (video imports through its own
  modal, a NEW flow specified in the new capability), and per the D-125 precedent the element's
  hold participation, Inspector registry entries, and export behavior live in the element's own
  capability.

## Impact

- `@cg/shared-schema` — new `VideoElementSchema` + `VideoPhasesSchema` (additive; no
  schema-version bump), alongside the untouched `VideoPlaceholderElementSchema`.
- `apps/designer` — video import UI (modal: source preview, crop marking, progress, cancel),
  converter wiring behind the bridge, Inspector sections, canvas render.
- `@cg/template-runtime` — `VideoDriver` (content-driver contract + `playOutro()`), scene-builder
  mount, hold/loop/freeze, pause/resume lockstep.
- `packages/single-file-export` + `apps/designer` Exporter — video bytes in both outputs; size
  preflight; `cef-compat` coverage.
- New vendored ffmpeg.wasm payload (location w.r.t. git is an OPEN question — see `design.md`).
- Phased delivery: a hardware-gating SPIKE first (`tools/spikes/`), then schema/ingest, canvas +
  Inspector, runtime lifecycle, exporters, and an owner-verified CasparCG 2.3.x CEF smoke as the
  pre-archive gate (see `tasks.md`).
