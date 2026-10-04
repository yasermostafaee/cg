# The playhead drives the canvas, and the loop range is authorable — one change, two filed items

> 🔴 **DESIGN-FIRST. NO IMPLEMENTATION TASK IN `tasks.md` IS READY TO START.** Every task is
> gated behind the open questions in `design.md` §9. This change exists to make the two items
> designable; it deliberately does not make them buildable yet. See §"Status" below.

## Why

Two `high — client-required` Designer items, both marked **RECON-FIRST**, both owing a design
before any code:

- **D-133** (`docs/prd/designer.md:3484`) — a **loop range** on the timeline: authorable
  UNCONDITIONALLY, drawn with full-height markers, and — the part that is the item, not a detail
  of it — **the playhead wraps at the loop end while the driver's content CONTINUES across the
  seam**. A ticker set to repeat 3× keeps flowing, unbroken, through the wrap.
- **D-135** (`docs/prd/designer.md:3548`) — **the canvas follows the playhead** for Lottie and
  video, under BOTH scrub and PLAY. Today Play animates keyframed properties only; video and
  Lottie motion exist solely in the Preview, so the canvas silently misrepresents the composition
  during the one operation the operator uses to judge it.

**They are authored as ONE change because they are one question asked twice: what does the playhead
drive, and what follows it.** The recon (§1 of `design.md`) found that both items land on the same
two functions and the same protocol message:

- the canvas is an **iframe running `@cg/template-runtime`**, and the ONLY thing the playhead sends
  it is `{ action: 'scrub', frame }` → `runtime.tick(frame)`
  (`apps/designer/src/platform/preview.ts:899`);
- `runtime.tick(frame)` does exactly three things — keyframed properties, stamped repeater rows,
  lifespan gates (`packages/template-runtime/src/runtime.ts:2112`). **It touches no Lottie player
  and no `<video>`.** That single omission IS D-135.
- D-133's seam rule is a statement about **what `tick(frame)` must NOT touch**: the wrap repaints
  the furniture and must leave the content drivers running. Designing "what the playhead drives"
  without designing "what it must not reset" is how a loop that restarts the ticker gets built and
  then has to be unbuilt.

Splitting them would put the two halves of one function's contract in two changes.

## What changes

1. **The loop range becomes a first-class, UNCONDITIONALLY authorable timeline object** — start
   and end markers with full-height indicator lines, offered on the main scene whether or not a
   content-driven element exists. The gated "Pin content start" affordance
   (`PlayoutSection.tsx:621`, `hasContentElement`) becomes at most a shortcut, never the only path.
2. **The loop range MAPS ONTO THE SHIPPED LIFECYCLE — no new lifecycle mode is invented.**
   `[contentStart → outPoint]` IS the loop range, and looping is a **rendering of the existing
   HOLD** rather than a new phase. The evidence and the full argument are `design.md` §3; the
   headline is that the seam-continuation rule **falls out of the shipped machine for free**,
   because the content drivers were never part of the held range in the first place.
3. **`runtime.tick(frame)` gains frame-mapped media**: each Lottie is positioned with
   `goToAndStop`, each `<video>` by `currentTime`, through each element's phase mapping. Because
   the canvas's Play is _already_ a stream of `tick(frame)` calls, **both halves of D-135 land in
   one function** — scrub and play cannot disagree, because they are the same call.
4. **The ticker / sequence / clock carve-out is preserved VERBATIM** and re-stated as a spec
   requirement in its own right, so it cannot be eroded by a later reading: they stay
   **deliberately time-driven and do not follow the playhead**, under scrub and under play alike.

## What does NOT change

- **`loop-cycle` playout mode.** It is a DIFFERENT loop — whole open/close cycles, each re-running
  the intro — and the naming collision is a live hazard (`design.md` §3.4). This change adds no
  behaviour to it and renames nothing in it.
- **The Preview.** It keeps the real `play()` path with the real drivers, and stays the frame-true
  rendition. The canvas is an authoring surface; §5.3 states plainly what it gives up.
- **Export.** Nothing here reaches `.vcg`, on-air rendering, or the runtime controller.

## Status — why nothing is ready to start

Both items are RECON-FIRST and both were filed owing a design. That design exists now, and it
answers the question the prompt named as the crux — **play-and-re-anchor vs position-by-
`currentTime`** — decisively, with evidence and cost (`design.md` §5). What it does NOT do is
guess the owner's product decisions. Four are recorded as **open questions** in `design.md` §9,
each with both candidate answers and what each costs:

| #    | Question                                                              |
| ---- | --------------------------------------------------------------------- |
| §9.1 | What does a loop range MEAN under a `timed` hold — inert, or looping? |
| §9.2 | Does an unconditional loop range imply an unconditional out-point?    |
| §9.3 | Canvas video under BACKWARD play (J) and BOUNCE — the three answers   |
| §9.4 | Does a Lottie/video that is NOT a hold driver follow the playhead?    |

`tasks.md` names which task each question gates. **No task may be started before its gate is
answered**, and §9.3 in particular changes the shape of the implementation rather than a constant
in it.

## Out of scope, deliberately

**D-151 is NOT folded in** (`docs/prd/designer.md:4266` — adding content longer than its host warns
and offers to extend the host duration). It needs no design; it needs one product answer, on
whether the add-time dialog gets a third "add anyway" choice. Folding it in here would make a
design wait on a product decision that is unrelated to what the playhead drives.
