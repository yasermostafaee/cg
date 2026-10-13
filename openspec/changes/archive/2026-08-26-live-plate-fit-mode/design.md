# design — live-plate-fit-mode

## §0 — the one computation, and where it lives

```
fitPictureToBox(box, sourceAspect, mode) -> { picture, visible }
```

Pure, total, no I/O, in `packages/shared-schema/src/live-fit.ts`.

**Why `@cg/shared-schema` and not a new package.** `CLAUDE.md`'s "Where features go" table has no
geometry row, so the home is chosen rather than looked up. It goes here for the reason
`live-geometry.ts`'s own header already gives for `liveSourceFit`: **this is the one package the
page, the bridge and `@cg/vcg-format` all already depend on.** The template runtime imports it, the
bridge imports it, and neither can see the other. A new `@cg/geometry` would add a workspace whose
entire content is one function that this package's existing consumers already reach; putting it in
the bridge would make the page unable to import it, which is precisely how the second spelling gets
written.

**Why it returns TWO rects and not one.** The two consumers do not want the same rect, and that is
the whole reason a naive "fitted rect" is not enough:

|                                                                 | `contain`   | `cover` |
| --------------------------------------------------------------- | ----------- | ------- |
| `picture` — the whole picture, where it is drawn (`MIXER FILL`) | ⊆ box       | ⊇ box   |
| `visible` — what is SEEN (`MIXER CLIP`, the mask hole)          | = `picture` | = box   |

**`visible` is `picture ∩ box` in both modes**, which is what makes one function honest for both.
Returning only "the fitted rect" would be right for `contain` and wrong for `cover`, where the
picture deliberately exceeds the box and the hole must stay AT the box. They ship together for the
same reason `LiveSourceFit` ships `fill` + `clip` together: a caller that could set one without the
other can put a fill outside its clip, which renders nothing at all.

**Equivariance is load-bearing and is pinned by a test.** The bridge fits in RASTER pixels; the page
fits in SCENE pixels. Scene → raster is `pad + s·(t + x)` with a single uniform `s` (`outputScale`
is a `min`, never a per-axis pair) — a similarity transform, under which an aspect-preserving fit
commutes. That is the only reason both sides may call one function in two spaces and agree. If
`outputScale` ever became per-axis this would silently break, so a test asserts the commutation
directly rather than trusting the reading.

## §1 — 🔴 THE BRIDGE→PAGE TRANSPORT: the site the brief did not anticipate

**The page cannot compute the fitted rect on its own, and this is not an implementation detail —
it decides the shape of the change.**

`sceneMaskHoles` builds the mask FROM THE SCENE ALONE, and its own header says why that rule
exists: _"A condition belongs in the mask ONLY IF it can be evaluated from the SCENE ALONE …
assignment does not."_ But the fitted rect needs the SOURCE ASPECT, and under `D-147` the source
outranks the author — so the fit input is an INSTALLATION fact the scene does not carry and the
page cannot know.

**Deriving it page-side from the element's `expectedAspect` while the bridge derives it from the
assigned source is exactly `B-149`: hole ≠ picture, on air.** Two machines, two aspects, one hole.

So the page is TOLD. The transport already exists and was built to be extended — `CG_CONTROL_KEY`
(`__cg`) on the `CG UPDATE` payload, whose own docstring says _"the next piece of bridge→page
control data extends this object instead of minting another top-level key"_. `CgControl` gains
`plates`, beside `look`, carrying `{ aspect, mode }` per plate id.

**Sent, not computed twice — but the RECT is not what crosses the wire.** The wire carries the two
INSTALLATION FACTS (aspect, mode); each side then calls the same `fitPictureToBox` on the box rect
IT holds. That is deliberate and it is the same shape `__cg.look` already has (_"one id, sent once,
read by one function on each side"_). Sending the rect instead would fight a rule `runtime.ts`
already states: `liveArrangementView` reads the page's CURRENT layout back _"so the mask is computed
against where the nodes now ARE rather than where the view said to put them"_. A plate moved by an
arrangement has a box the bridge's rect would be stale about. **The box is the page's fact; the
aspect and the mode are the bridge's; the fit is one function applied to both.**

## §2 — the page's fallback chain, and the window it leaves

The page resolves each plate's fit facts as:

1. `__cg.plates[plateId]` — the installation's fact, when the bridge has spoken;
2. the SCENE — `{ aspect: element.expectedAspect ?? null, mode: element.fitMode ?? 'contain' }`.

Step 2 is what a Designer preview, a Runtime rehearsal frame and a freshly-built page have. It is
honest: `expectedAspect` means _"this window is designed for a 16:9 feed"_, which is the best
available statement when no installation has spoken, and a `null` aspect means NO FIT — the hole
stays at the box, exactly as today.

⚠ **The window this leaves, and why it is acceptable.** A fresh build punches step 2's holes; the
`CG ADD` payload then arrives with step 1's facts and re-punches. Between them the page may hold a
hole computed from the author's aspect rather than the source's. That window is entirely inside the
bridge's own `ADD → (muted) → PLAY` sequence — the layer is created muted and nothing is on air
until `PLAY` — and it is the SAME window `__cg.look` already has (a fresh build enters the authored
default look; the ADD payload moves it). It is not a new class of exposure.

## §3 — ⭐ ORDERING CONSTRAINTS (`tasks.md` under-states these — read this section, not the boxes)

1. **The schema field lands BEFORE anything reads it.** `fitMode` on the element and the
   declaration, and — as corrected by `B-178`, see §6 — the per-look `fits` map, are one commit;
   the collectors that emit it, the bridge that resolves it and the UI that authors it all depend
   on the type existing. Golden rule 3. ⚠ This constraint originally named "the look-group source";
   that field is deleted, and §6 says why.
2. **`fitPictureToBox` lands BEFORE `liveSourceFit` is refactored onto it**, and `liveSourceFit`'s
   refactor must be VALUE-IDENTICAL under `cover` before any `contain` path is wired. The positive
   control (`cover` is byte-identical to today) is what makes the rest of the change safe to
   review, so it is proved first, not last.
3. **The mask hole and the mixer geometry change in the SAME commit.** They are the two halves of
   `B-149`; a commit that moves one and not the other IS the defect, momentarily, in the tree.
4. **The refusal's mode-conditionality lands AFTER the mode resolves**, never before — a refusal
   that consults a mode nothing has resolved yet would read `undefined` and take the `cover` arm
   for every plate, silently keeping today's behaviour while looking implemented.
5. **The Designer control lands LAST.** It is the only piece with no consumer depending on it, and
   authoring a field the runtime cannot yet honour is how a control ships inert (`B-051`).

## §4 — what the refusal becomes

`resolvePlateAspect` keeps its chain and its message verbatim. What changes is that the caller now
knows the MODE, and the refusal is raised only under `cover`:

- `cover` — refuse, unchanged, same `errorCode`, same message. The harm is real: cropping cuts
  picture the author never saw.
- `contain` — a non-blocking WARNING, and the take proceeds. Nothing is cropped, so the harm the
  refusal guards against cannot occur.

🔴 **The reason travels with the outcome in both arms.** The disagreement is detected once, and the
FACTS — the plate, the author's aspect, the source's — are written once, above the branch. A
`contain` arm returning a bare boolean would lose the one sentence that tells an operator which
plate disagrees with which source, and a refusal that loses its reason is a worse defect than the
one it prevents.

⚠ **CORRECTION to this section's first draft, made during implementation and recorded rather than
silently applied: the two arms do NOT share one literal message.** The shipped sentence — _"Cropping
it would cut a part of the picture the author never saw — re-assign the plate, or correct the
source's format"_ — is **FALSE under `contain`**, where nothing is cropped. Repeating it verbatim
would hand the operator a reason that does not apply to what they are looking at, which is a way of
LOSING the reason rather than keeping it. So the shared half is the FACTS and the differing half is
the CONSEQUENCE: `cover` keeps its wording untouched, `contain` states its own true one (the picture
will not fill the box the author drew). "Same message" was the wrong spelling of "same reason".

**And the mode is a REQUIRED input to `resolvePlateAspect`, with no default.** Defaulting it to
`cover` makes every unconverted call site keep refusing while the feature looks shipped; defaulting
it to `contain` makes a forgotten call site silently stop refusing a take that would genuinely crop.
Requiring it makes the COMPILER enumerate the call sites — the one enumeration that cannot be
forgotten, and available here precisely because this deliverable is a type rather than a string.

## §5 — why the mode is not on the SOURCE

Stated in the proposal and repeated here because it is the decision most likely to be "simplified"
later: the same catalog source can be seated in a 16:9 box in one template and a 3:4 box in
another. A per-source mode would have to be wrong in one of them. The mode is a property of the
PAIRING of a picture with a box, and the element is where that pairing is authored.

## §6 — 🔴 CORRECTED BY `B-178`: the LOOK-GROUP carrier, which this change got wrong

**This change shipped the mode on `LookSource.fitMode` — the look group's declared source — and
that was a defect, not a simplification.** The reasoning recorded at the time was that a source-keyed
carrier has "nowhere for two modes to be carried". It was right that there was nowhere on the
DECLARATION and wrong that there was nowhere at all: each LOOK already carries a per-`routeKey`
`rects` map, and the mode belongs beside it.

**The consequence was total for the feature's primary case.** Nothing in the product ever writes
`LookSource.fitMode` — `addLookSource` emits `{ routeKey, dynamic: false }` and the look-group editor
does not model the field — so for **every look-group template ever exported**, the author's choice
was dropped and every plate reached air on the `contain` default. The owner set two plates
side by side, one `contain` and one `cover`, and both rendered `contain`.

**As corrected:** `TemplateLookCarrier.fits: Record<routeKey, LiveFitMode>` per look, read off the
plate ELEMENT that serves that `routeKey` in that look; `lookPlateFits` as a sibling of
`lookPlateRects`; `LookSource.fitMode` deleted so there is no second home. §5's argument is not
weakened by this — it is applied one level in: a `routeKey` appears in every look in a
differently-shaped box, so per-source is one answer too few there too.

⚠ **`expectedAspect` does NOT follow it**, and the difference is the useful part: an aspect asserts a
property of the FEED, which cannot change between looks, while a mode asserts how that feed is placed
in a BOX, and a look is exactly a change of box. `LookSource.expectedAspect` is dead in the same way
and is filed separately as `B-179` — its fix re-arms a refusal that blocks takes on air, which is not
this change's to make.

Full evidence, the decision and its alternatives: `docs/prd/bugs-runtime.md` `B-178`.
