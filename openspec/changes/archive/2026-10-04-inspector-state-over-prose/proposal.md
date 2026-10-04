# The Inspector says in STATE what it used to explain in prose

## Why

`DESIGNER-FIX-0905`. The owner's words about the Designer's Inspector: _"long and small and
unreadable."_ He photographed seven blocks — Playout, Video, Live Source / fit, Frame, Sequence,
Looks and the home screen's template cards — and the root cause is not length. **The UI explains
in prose what it could express in state.** A paragraph says a control "has no playback effect
here" instead of the control reading inert; a paragraph says "opacity and filters are withheld"
while the controls are simply absent; a paragraph repeats, word for word, the placeholder of the
field directly above it. And two of those paragraphs still describe a mechanism that no longer
exists: the punched "hole" the single-clock reorder (`a7976e14`) retired — `D-158` listed six such
strings and left them alone.

One defect rode in with the report: deleting a look leaves its composition behind, the Looks panel
then says "No looks yet" while the Compositions panel lists `look-1`, `look-2`, `look-3`, and the
next `+ Look` is named `look-1` again. **Two panels contradicting each other in the same frame.**

## What Changes

- **§1 Truth first.** Every Designer string that described the retired hole is rewritten against
  what the code does now — the page is composited BELOW the plates, CasparCG draws each picture
  into the plate's declared rect, the plate paints nothing, and the frame is painted on the page
  just outside the rect. The knowledge is relocated and corrected, never deleted. Finding: five
  of `D-158`'s six live in `ArrangementsSection.tsx`, which is compiled but **never rendered**
  (`InspectorPanel` does not mount it) and whose transition modes are implemented nowhere; the
  two the owner photographed are the two that were reachable. Two more Designer strings — the
  preflight's `live-source-in-stamped-scope` and `live-source-animated` refusals, and the three
  `overlaps` messages' "overlapping holes" — were additional to `D-158`'s list.
- **§2 State over prose.** A control the current mode ignores is **withheld** — rendered,
  disabled, and carrying its reason as its own tooltip — never hidden; a degenerate value reads as
  degenerate; a fact is a field; and no paragraph restates a placeholder. Concretely: a plate's
  rotation, opacity and Filter section; the Frame colour at width 0; the hold loop as a state row
  with an `inert` / `empty` / `active` tag; a follower's "no out-point" as a state row; a video's
  `drives hold` without an out-point; the video provenance as fields; the sequence's duplicated
  sentence deleted; a repeater's `0` reading as `unlimited`.
- **§3 Sentence by sentence.** Teaching and mechanism move behind an **`i`** beside the thing
  they explain, into the shared modal at reading size. Constraints go ON the control. A state and
  its remedy stay inline. Facts become fields. The home cards get a comparable playout badge plus
  one line. 🔴 Nothing that names a remedy, a blocking condition or a refusal goes behind the `i`;
  the red `N issues — export will refuse` block stays inline and gets louder.
- **§4 Legibility.** One legible default for the inline text that remains (`prose.css.ts`): a
  size that survives a narrow inspector, a line-height, a capped measure. The modal is set at the
  app's message size.
- **§5 The orphan composition.** Established by test before fixing: a colliding default name
  produces a SECOND entry (case 1 — clutter), never reuse and never adoption of the orphan's
  content. The composition is, by design, a reusable object a look points at (`looks.ts`
  `removeLook`: _"its COMPOSITION stays in the project … recoverable work"_), so the orphan is
  not the bug — that nothing said so and nothing let you reuse it was. Now: the default namer
  avoids every existing composition name; the Looks panel lists compositions not currently a look
  and offers **Make it a look** (re-adopting the authored sub-scene, plates and all); removing a
  look raises a notice naming where its composition went. No cascade — deleting a composition
  stays the author's separate, explicit act, and stays undoable.

## Capabilities

| capability                       | status                                       | this change          |
| -------------------------------- | -------------------------------------------- | -------------------- |
| `designer-inspector`             | LIVING spec                                  | `ADDED Requirements` |
| `designer-live-source`           | LIVING spec                                  | `ADDED Requirements` |
| `designer-playout-lifecycle`     | LIVING spec                                  | `ADDED Requirements` |
| `designer-video-element`         | LIVING spec                                  | `ADDED Requirements` |
| `designer-shell`                 | LIVING spec                                  | `ADDED Requirements` |
| `designer-multibox-arrangements` | in flight, owned by `multibox-layout-switch` | `ADDED Requirements` |

⚠ No in-flight change is edited and no archive is touched; `timeline-drives-loop-and-media` (which
owns the hold loop caption's original requirement) and `multibox-layout-switch` (which owns the
Looks panel) fold on top in the ordinary way when they archive.

## Impact

- `apps/designer/src/renderer/features/inspector/` — `InfoTip.tsx` (the `i` + the one-line state),
  `prose.css.ts` (the legible default), `CollapseSection.tsx` (a withheld section header),
  `controls.tsx` / `transform-fields.tsx` / `ColorPopover.tsx` (withheld fields), `field-registry.ts`
  (the reasons, beside the subtraction that needs them), `TransformSection.tsx`, `StyleSection.tsx`,
  `PlayoutSection.tsx`, `LooksSection.tsx`.
- `apps/designer/src/renderer/state/live-source-preflight.ts` — the corrected refusals, and a
  plate still wearing its factory name is no longer written as `Live Source "Live Source"`.
- `apps/designer/src/renderer/state/slices/looks.ts` — the namer, `addLookFromComposition`,
  `detachedLookCompositions`, the notice on remove.
- `packages/shared-ipc` `StarterEntry` gains an optional `playout` summary; `@cg/starter-templates`
  descriptions are one line each; `LandingView` renders the badge.
- 🔴 **Nothing in `@cg/template-runtime`, the bridge or the wire.** The authorisation boundary
  is the Designer UI and its copy.
