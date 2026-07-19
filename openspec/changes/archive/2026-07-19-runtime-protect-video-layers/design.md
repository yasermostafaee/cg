# Design — protect video layers (R-015)

## The discriminator, verified

The producer kind genuinely reaches every consumer that needs it:

- The occupancy tap stores the raw kind per layer (`OscOccupancyTap.note` keeps
  `event.producer` verbatim; `occupied()` returns it).
- The orphan feed carries it end-to-end: `OrphanLayerSchema.producer` (`@cg/shared-ipc`) and
  the banner already renders it ("ffmpeg producer").
- Real CasparCG reports `html` for HTML producers and distinct kinds (`ffmpeg`, `image`,
  `route`, `decklink`, …) for everything else; ADR 0004 pins OSC as the only per-layer
  producer signal on the 2.3+ lineage.

One consumer deliberately does NOT see the kind: the Reconciler collapses producer to
`present`/`empty` at observation time (`reconciler.ts` `applyOsc`). That blindness is part of
the restart-misadoption limit below — noted, untouched.

## Decisions

**Refusal predicate: "fresh html observation", not "not video".** `clearLayer` allows a CLEAR
only when the primary tap's fresh occupancy for that exact layer reports `html`. Everything
else refuses `foreign`: an observed non-html kind (provably not ours), an unrecognised kind
(fail-safe — never enumerate video kinds), and NO fresh observation at all. The last case is
load-bearing: on a B-094 install (AMCP alive, OSC dead) or after entries age out, silence is
evidence of nothing — and a CLEAR licensed by nothing could cut a video. This also closes the
programmatic hole: `layers.clear` with an arbitrary coordinate now refuses unless the layer
was verifiably showing our kind of producer.

Consequence, stated: a FROZEN html-orphan row (primary died; warnings freeze per R-009)
refuses `foreign` where it used to attempt the send and fail `amcp-error`. Same outcome
(nothing cleared), honest reason ordering: we refuse because we cannot verify, not because
the wire happened to be down.

**One new reason, not two.** `foreign` covers both "observed non-html" and "no fresh
observation". Splitting them would put two names on one operator-visible behaviour (the
affordance never appears for either), and the only caller that could tell them apart is a
programmatic one that should be refused anyway.

**The banner split keys on `producer === 'html'`.** html orphans keep the amber `role="alert"`
strip and confirm-gated Clear byte-for-byte. Non-html rows move to a separate neutral strip:
`role="status"` (it is information, not a problem), surface text colours (`textMuted` tones —
the C-012 palette pass's neutral vocabulary; never amber, never the on-air red), no button.
Copy names the kind and the truth: "Layer 1-1 is carrying video (ffmpeg) — placed by another
system. Not clearable from here." The operator wanted to SEE the layer is occupied; a
permanently-amber alert would make normal read as wrong.

**Mock fidelity over test shims.** The amcp-mock's media `PLAY`/`LOAD` now records
`producer: 'ffmpeg'` (HTML keyword or `http(s)` URL still → `html`), matching real CasparCG.
The pre-existing `clear-all-broadcast-safety` assertion that a `.mov` program feed reads
`html` was the mock's lie — updated to `ffmpeg`, which strengthens that test's own point.

## Known limits (recorded, deliberately not fixed here)

**Blind tap fails dark, and that is the right direction.** On an install receiving no OSC,
occupancy is unknown: nothing is surfaced, so nothing is offered — the prohibition holds
structurally (you cannot clear what is never offered, and `layers.clear` refuses `foreign`
without a fresh observation) but the "show occupancy neutrally" requirement cannot be met —
there is nothing to show. B-094's NO OSC indicator is the companion signal explaining why.
#355's blind-tap guard is untouched.

**Restart misadoption — judged, recorded as a limit.** B-092's restore trusts
browser-retained intent: a foreign producer that landed on a retained-intent layer while the
bridge was dead is adopted as ours, and the Reconciler's kind-blindness (`present`/`empty`)
then lets the row claim ON AIR off the video's OSC. The narrow fix looked clean — refuse to
adopt a non-html producer onto an html item's retained layer — but the refusal has no honest
landing today: skipping the adopt falls through to the re-ADD branch, which would
stage-replace the video (the exact off-air accident #353 measured); parking the item needs a
SECOND `unverifiable` cause (the existing one hard-codes "no OSC has ever arrived" —
`OSC_UNVERIFIABLE` — and the renderer words it accordingly), which means reconciler surface +
operator-facing wording — B-092/B-093 redesign, not a producer-kind check. Recorded here;
the follow-up belongs beside C-014's occupancy-aware allocation work.

## Test strategy

- Bridge integration (`tools/caspar-bridge`): a foreign media play surfaces as an `ffmpeg`
  orphan; `clearLayer` refuses it `{ ok: false, reason: 'foreign' }` AND no `CLEAR` reaches
  the wire (recorded via `setHandler`); an html orphan still clears; an unobserved layer
  refuses `foreign`. Isolated and under full parallel `pnpm test`; sockets/mocks torn down in
  `afterEach`.
- Banner DOM tests: html orphan → alert strip + Clear; `ffmpeg` → neutral strip, no Clear, no
  alert role; unrecognised kind (`decklink`) → treated exactly as video (fail-safe).
- E2E: the seeded mock boots one html orphan AND one video layer; Playwright asserts the
  html Clear flow (existing) and the neutral no-Clear video row (new).
