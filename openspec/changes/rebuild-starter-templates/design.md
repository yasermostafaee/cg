# Design — rebuild starter templates (D-119)

## Two-comp structure, and why the entry comp is the full frame (for now)

Every starter is: a small **footprint comp** (the graphic's own bounds) nested
inside a **full 1920×1080 comp**. Rationale, all code-traced during the change:

- Export is per-composition — the OPEN comp is lifted onto the shipped scene
  root (`scopeSceneToComposition`), and `compositionClosure` walks strictly
  DOWNWARD, so exporting the full comp packages the footprint comp while
  exporting the footprint comp would exclude the full one.
- The produced page renders 1:1 at the channel resolution with the stage at
  the document origin and no MIXER positioning from the bridge — a
  small-canvas export lands at the channel's TOP-LEFT. Until Runtime operator
  positioning exists, only a full-frame export puts the graphic at its
  authored on-screen position. Hence `entryCompositionId` = the full comp
  today; the footprint comp records the future on-air target via its name and
  the `onair:<compId>` scene tag.

## Where lifecycle/playout/keyframes live (nested-cascade findings)

Each composition scope runs its OWN `PlayoutController` on its own
`FrameDriver`; child controllers play at parent `play()`, ungated. Three
consequences shaped the starters:

1. A child comp with no lifecycle resolves to `static` — it plays its ENTIRE
   timeline (exit keyframes included) as one intro, holds on the post-exit
   pose, and hard-cuts on stop. So **every footprint comp carries its own
   `lifecycle` + `playout`**.
2. A parent's `loop-cycle` restart does NOT replay nested keyframes (child
   controllers loop themselves; only content drivers reset per cycle). So the
   logo sting's `loop-cycle` lives on the **footprint comp** (`repeat:
'infinite'` — a finite/unset repeat would settle after one cycle and never
   replay), while the full comp holds `manual`.
3. The root settles — hiding the whole stage via `cg-pending` — when its OWN
   outro ends, without awaiting children, and a zero-animation scope's phases
   are instant paints. So every full comp carries an **envelope opacity track**
   on the instance element (keeps the scope animated → real-time phases) and
   an outro ~0.2 s LONGER than the footprint's stop-exit.

The ticker's live dot must keep blinking on air, but keyframes freeze during
the hold — the dot is therefore a nested `loop-cycle`/`holdMs: 0` pulse comp
(continuous ambient loop), faded in/out by the strap's own keyframes on exit.

The IRIB composite's right panel is a `sequence` element whose items are
COMPOSITION items (Tehran clock / Greenwich clock / brand text). Sequence
composition items are wired as fresh subtree roots that self-drive their
content, so the wall clocks inside them tick live while the panel rotates.

## Self-close semantics

- `title`: both comps `auto-out` + timed 6 s. The intros are the same length,
  so the two holds start aligned; the full comp's longer outro keeps the stage
  visible through the card's exit.
- `sequence`: both comps `auto-out` + `content-driven`. The footprint comp is
  a coordinator (self-settles when its FINITE sequence completes and the strap
  exit finishes); the full comp's content wait aggregates that settle, then
  plays its envelope outro.

## Known platform gaps recorded as bugs (not fixed here)

- B-068: `ensureCompositions` drops root `lifecycle`/`playout` when migrating
  a legacy root-layers scene (the starters avoid it by being
  composition-centric). (Filed as B-066; renumbered — main's #289 took B-066.)
- B-067: the Runtime app's inspector builds its field form from flat root
  `scene.fields` only; two-comp templates' fields live on the footprint comp
  and surface via D-025 aggregation (Designer preview form and the `.vcg` GDD
  manifest already aggregate). To revisit with Runtime operator positioning.
