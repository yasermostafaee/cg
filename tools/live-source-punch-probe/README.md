# Live Source backdrop-punch probe — task 1.5b

**Status: NOT YET RUN.** This directory is a measurement kit, not a result. Nothing in the
`live-source-multibox` change may be read as answering 1.5b until the form at the bottom of this
file is filled in from a real run.

- The task: `openspec/changes/live-source-multibox/tasks.md` §1.5b (extended by §1.5f)
- The design: `openspec/changes/live-source-multibox/design.md` §9a and §9a.1
- The page: [`punch-probe.html`](./punch-probe.html) — one self-contained file, no build step

---

## Why this exists

The whole HTML page is **one CasparCG layer**, sitting above the Live Source layers. A multi-box
layout normally carries a **designed opaque backdrop** behind its boxes — that is what the client
authors. Painting nothing at the plate is therefore **necessary and not sufficient**: the backdrop
survives at the plate's rect and the live picture behind the layer is never seen. The plate has to
**erase** what the template painted beneath it.

Two mechanisms could do that. **Neither has been chosen, and choosing one on reasoning is the
mistake this task exists to prevent.** They behave differently on a Chromium-71-era CEF in ways that
are not predictable from a modern browser — `B-066` was exactly that: a `tsconfig` setting that
passed every local check and `SyntaxError`d on CEF 71, on air.

> **Measure on the CEF inside the plant's CasparCG 2.3.2. A desktop-Chrome result answers a
> different question and does not count.**

---

## Running it

1. Copy `punch-probe.html` into the CasparCG server's `templates/` directory.
2. Put **any visible producer on a LOWER layer** of the same channel — colour bars, a clip, a live
   input, anything you can recognise through a hole. Example:

   ```
   PLAY 1-5 "AMB"
   CG ADD 1-10 "punch-probe" 1
   ```

3. Cycle the three states with **`CG NEXT 1-10`**. Nothing else needs typing.
   Other ways in, if that one is awkward: click the output preview, press `0` / `A` / `B`, open the
   file with `?m=a`, or `CG UPDATE 1-10 "{\"m\":\"a\"}"`.

The page prints the active mechanism and the **browser's user-agent string** in the corner, so a
photo of the screen records which CEF the measurement was taken on.

### The three states

| State        | What it is                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **0 — none** | **Control.** No punch. The backdrop covers both plates.                                                                         |
| **A**        | `mix-blend-mode: destination-out` on an **inner fill node**, with the frame and shadow on the **outer** node (§9a.1's scoping). |
| **B**        | The **backdrop** is masked with the plate rects. The plates erase nothing.                                                      |

🔴 **Check state 0 first, every time.** If the live layer is already visible through a plate in the
control state, the backdrop is not opaque, or it is not beneath the plates, and no reading taken
afterwards means anything. State 0 should look **wrong** — that is what makes states A and B
readable.

---

## The pass/fail card

**Two criteria. They are independent — criterion 2 is not a refinement of criterion 1.** A mechanism
that punches perfectly and eats its own frame passes (1) and **fails the feature**.

### Criterion 1 — the hole is really transparent

- Looking at the **programme output** (not a browser preview), the lower layer's picture is visible
  through **both** plate rects.
- The visible area is the **whole plate rect**, not part of it, and not a lighter or darker version
  of the backdrop.
- ✅ pass — the live picture is there. ❌ fail — the backdrop is still there, or the region went
  black/grey/translucent instead of clear.

### Criterion 2 — the frame and the shadow survive

- The **orange frame** is drawn all the way around both plates, unbroken, at full width.
- The **drop shadow** is still visible around each plate.
- ✅ pass — both intact. ❌ fail — the frame is missing, partially eaten, thinned on one or more
  sides, or the shadow is gone.

> An erase driven by the element's own painted alpha — which `destination-out` is — will erase the
> frame too unless it is scoped to the fill area. Mechanism A in this page **is** scoped that way, so
> if the frame still disappears, the scoping does not hold on this CEF and that is the finding.

### Record the measurement, not the expectation

Write down what the screen did, including "it did something I did not expect" and "I could not
tell". A null or confusing run is a real result and is worth more than a tidy one that was partly
guessed — §9.3 of this project produced an instruction that could not be run as written, and a first
attempt at it scored a null run as a verdict. Both cost a trip.

---

## Result form

**Copy this block into the change's `tasks.md` (or paste it back to CC) once it is filled in.**
An unfilled form is not a result and 1.5b stays open.

```text
LIVE SOURCE PUNCH PROBE — RESULT
date:                     ____________________
run by:                   ____________________

CasparCG version:         ____________________   (from the server console banner)
CEF / user-agent string:  ____________________   (printed on the page; a photo captures it)
channel / layer used:     ____________________
producer on the lower layer: _________________

state 0 (control) — backdrop covers both plates?      YES / NO
  (if NO: stop. the rig is wrong and A/B mean nothing)

MECHANISM A — mix-blend-mode: destination-out
  criterion 1  hole really transparent, live layer visible?   PASS / FAIL / UNCLEAR
  criterion 2  frame AND shadow intact?                       PASS / FAIL / UNCLEAR
  notes: ______________________________________________

MECHANISM B — mask the backdrop
  criterion 1  hole really transparent, live layer visible?   PASS / FAIL / UNCLEAR
  criterion 2  frame AND shadow intact?                       PASS / FAIL / UNCLEAR
  notes: ______________________________________________

photo / capture taken?    YES / NO      where: ______________

anything unexpected: _________________________________
```

---

## What happens next

- 1.5b is answered by the form above, and **only** by it.
- **1.5c** (implement the chosen mechanism) is blocked until then, and so are **1.5f** and **1.5h**.
- **1.5d** (`border-radius`) is a separate revisit after 1.5c. ⚠ One fact for whoever takes it:
  Chromium follows `border-radius` on an **`outline`** only from ~94, well above the CEF 71
  baseline, and the plate's frame is an outline (`buildLiveSource`) — so rounding the hole and the
  frame _together_ will need its own answer rather than falling out of the punch.
- **If both mechanisms pass**, prefer the one with the weaker coupling on the evidence, and record
  why. **If neither passes**, that is the most valuable outcome this kit can produce: it means the
  punch is not a CSS problem and `design.md` §9b (the multi-box on a channel of its own) becomes the
  live option rather than the fallback.
