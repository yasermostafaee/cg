# live-plate-fit-mode — a live plate is FITTED into its box, not cropped to it

Implements [[C-028]] (`docs/prd/caspar.md`).

## Why

**The client's decision, 2026-08-23, relayed by the owner: the picture must not be cut.** A live
input keeps its own aspect, is centred on both axes inside its box, and the leftover margin on the
short axis shows **the template's own background, never black**. The box's shape stops being
authoritative for the picture.

Today's behaviour — scale to COVER the box and centre-crop the overflow — survives as a
**selectable** mode. The owner accepted the consequence in advance: a stroke or frame authored tight
around a box no longer hugs the picture when the source aspect differs. That is a trade the client
made, not a defect to engineer away.

## The measured premise

Measured on the plant 2026-08-25, production 2.5.0 `69e8ad5`
(`docs/recon/2026-08-25-decklink-model-walk.md` Q3). A 16:9 input into a 4:3 channel with
`MIXER FILL 0.25 0.25 0.5 0.5` filled the box **edge to edge on both axes** — 415 px tall against
the 291 px a letterboxing producer would have given.

⇒ **CasparCG applies NO aspect correction of its own.** The source-aspect correction is REQUIRED
and there is no double-count. This was the blocking unknown; it is now a measurement.

## What changes

- **ONE pure function**, `fitPictureToBox` in `@cg/shared-schema`, returns the picture rect and the
  VISIBLE rect for a box + source aspect + mode. Both consumers read it and neither re-derives any
  part of it: the bridge turns it into `MIXER FILL` / `MIXER CLIP`, the template turns the same
  computation into its mask hole.
- **`contain` becomes the default fit mode**, authored per element and overridable per assignment.
- **The mask hole is punched at the VISIBLE rect**, so under `contain` the margin shows the
  template's own background rather than the channel behind the CG layer.
- **`LIVE_PLATE_ASPECT_MISMATCH` becomes mode-conditional** — a refusal under `cover`, a
  non-blocking warning under `contain`, never deleted.

## Blast radius — an ON-AIR behaviour change

`contain` is the new default, so **an existing template renders differently on air** for any plate
whose source aspect is both KNOWN and DIFFERENT from its box. Where nothing states an aspect, or
where the two already agree, nothing changes at all (the last two scenarios of the fit requirement
pin exactly that). Permitted under the `P-031` compatibility floor — nothing has shipped to a client
— but named here because it is a change to what reaches air, not only to what the code does.

## Where the mode lives — [[C-028]]'s OPEN note, decided

[[C-028]] recorded this as OPEN rather than guessing. It is settled here from the client's own
recorded words — _"choosable in the Designer and overridable by the operator"_:

- **Authored per ELEMENT.** Not per SOURCE: one source seated in a 16:9 box and a 3:4 box needs
  different fits, so a per-source field would be wrong in both places at once.
- **Overridable per ASSIGNMENT** at run time — the operator half, carried on
  `TemplateSourceAssignment`, which already exists as the per-installation record for a plate.
- **Resolution order: assignment override → element → `contain`.** Deliberately echoes `D-147`'s
  shape without touching it: that chain resolves the ASPECT (source outranks author, because the
  author cannot see the feed), this one resolves the MODE (operator outranks author, because the
  mode is a presentation choice the author states and the operator may revise on the day). They
  stay separate concerns and are resolved by separate functions.

## Deliberately NOT in scope

- **`resolvePlateAspect`'s chain is UNCHANGED** — source `format` → source `aspect` → element
  `expectedAspect` → nothing (`assumed: true`). The `D-147` decision that the SOURCE outranks the
  AUTHOR stands on its own reasoning and is untouched.
- **The "nobody stated an aspect" case is UNCHANGED** — no aspect means no fit and no refusal in
  either mode, and the picture fills the box exactly as today. A fit is impossible without a known
  aspect.
- **`D-155` / `aspect-lock-live-source` is NOT re-opened.** Its justification merely shifts: locking
  a box to the source aspect now prevents background gaps rather than preventing cropping.
