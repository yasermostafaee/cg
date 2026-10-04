# Design — state over prose

## 1. Withheld, not hidden — and which controls got which

_"Hiding is not the same as disabling. A control that vanishes teaches nothing about why it is
unavailable."_ The choice per control, with the reason:

| control                                 | choice                                                  | why                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plate `Rotation`, `Opacity`             | **disabled**, reason as tooltip, row dimmed             | one row each; the author looks for them exactly where every other kind has them, and the reason is the whole of `D-137`'s constraint                                                   |
| plate `Filter` section                  | **disabled header** (`withheld` tag, reason as tooltip) | a whole section of controls would be twelve tooltips saying one thing; the header carries it once and the body is never mounted                                                        |
| plate keyframe diamonds                 | **absent** (unchanged)                                  | a diamond is a per-field affordance with no place to carry a sentence; the withheld rotation/opacity rows and the `i` say why the plate is static                                      |
| Frame `stroke` colour at width 0        | **disabled**, value still shown                         | the point of the state is that the colour IS kept; showing it dimmed says so without a sentence                                                                                        |
| hold loop                               | **state row** with an `inert` / `empty` / `active` tag  | it is a readout of two markers, not a control; the tag is the state, one short line is the remedy, the `i` is the three-loops teaching                                                 |
| `Pin content start`                     | **left enabled** under `manual` / `static`              | the marker is a PROMISE ABOUT TIME the entrance leg honours whatever the mode (`playout-controller.ts:325`) and the follow anchor for media — disabling it would disable a live effect |
| video `drives hold` with no out-point   | **disabled**, reason as tooltip                         | with no out-point the composition is `static` and every hold source is ignored; the flag has no effect until an out point exists                                                       |
| video / Lottie follow with no out-point | **state row** + remedy inline, mechanism behind `i`     | "Following nothing yet" is a state with a remedy ("set an out point in Playout"); the anchors sentence is mechanism                                                                    |

## 2. Where a sentence goes — the classification rule, applied conservatively

| kind                                          | destination                       |
| --------------------------------------------- | --------------------------------- |
| teaching (read once, ever)                    | behind the `i`, at reading size   |
| constraint (why a control is missing/limited) | ON the control                    |
| state + remedy                                | inline, short, beside its control |
| mechanism behind a state                      | behind the `i`                    |
| facts                                         | fields                            |
| differentiator (a chooser)                    | a comparable badge + one line     |

🔴 Nothing that names a remedy, a blocking condition or a refusal goes behind the `i`. When a
sentence's kind is unclear it stays inline: a sentence wrongly hidden is invisible, a sentence
wrongly kept is only noise. The clock's format-token legend stays inline for that reason (it is
consulted every time a format is typed, not read once).

## 3. The `i` is the shared modal, not a tooltip

A tooltip is inspector-size text that cannot be selected, scrolled or read twice. The `i` opens the
existing `Modal` (0.9rem, the owner's 2026-07-22 message-surface size) with a capped reading measure
— half the point of moving the text is to set it at a size that can be read.

## 4. §5 — the composition is a reusable object, and the orphan is not the bug

`looks.ts` `removeLook` (its docstring and the trash button's title): _"its COMPOSITION stays in
the project (the authored sub-scene is recoverable work, listed in the Compositions panel —
deleting it is the author's separate, explicit act)"_. So the model is REUSABLE, and the defect is
that nothing said so at the moment it mattered and nothing let the author reuse it.

**Established before fixing** (`looks-orphan.test.ts`): after `removeLook` of every look, the next
`addLook` created a SECOND composition named `look-1` — case 1, clutter. It did not reuse the
orphan's entry (case 2) and it did not adopt its content (case 3): the new composition had no
layers. Reported because the prompt asked for it to be checked rather than assumed.

The fix, in that model:

- the default namer avoids every existing COMPOSITION name as well as every look id, so a new look
  after a removal is `look-4`, never a second `look-1`;
- `addLookFromComposition(compId)` — the reuse door: instance an existing composition full-frame
  in the group's home document and register it, exactly as `addLook` does for a fresh one; the
  Looks panel offers it as **Make it a look** for every composition that is not already a look and
  can be nested without a cycle;
- `removeLook` raises a notice naming the composition that stays and the door that brings it back.

No cascade. Deleting a composition may take hours of authoring with it and stays the author's own
act in the Compositions panel, one undo step like every other scene write.

## 5. The home cards' badge is DERIVED, not authored

`StarterEntry.playout` is computed from the starter's entry composition by `describePlayout` in
`@cg/starter-templates`: the effective mode (`playoutOf`), the hold source, the timed hold in
seconds, and — because the logo sting's loop lives in a NESTED composition while its entry is
`manual` — the cycle length of any loop-cycle composition the entry instances. A hand-authored
badge would be one more string that can drift from the scene it describes; a derived one cannot.
