# designer-export-block-visible — a blocked Export shows WHICH box is wrong

Implements [[D-157]] (`docs/prd/designer.md`).

## Why

The owner: _"if two Live Source boxes overlap by even 1 px, or a box leaves the canvas, the Export
button goes dead and I cannot tell why."_

🔴 **The rule does not change.** `live-source-overlap` is `severity: 'error'` on purpose and only an
error blocks an export; `live-source-off-frame` exists because such an element used to be DELETED
silently. Neither is softened and no "export anyway" escape is added. **The complaint is about the
surface, not the policy.**

## The reason already exists in the data

Almost nothing here needed computing:

- every issue already carries `elementId`, and `label()` already puts the element's name into the
  message;
- an overlap already files TWO issues, one per participant, so a mark driven off `elementId` marks
  both offenders for free;
- `useIssues` already re-runs the preflight on every scene change (debounced 200 ms), so a mark driven
  off it clears the moment the geometry is fixed.

## What was measured about the surface

- `IssuesPanel` has **one** mount, inside a `Modal` opened only by a status-bar pill that exists only
  while there are issues. Its own non-embedded branch is dead code.
- **1 click** to read the message, **2** to reach the box — and clicking a row **closes the modal**, so
  the message and the offending box are never on screen together.
- The `window.alert` naming the Issues panel is **unreachable**: the same `errorCount > 0` that
  triggers it sets `disabled` on the button in the same render.
- The `title="Resolve validation errors first"` sits on a **natively disabled** button, where browsers
  suppress `title` and the app's own tooltip (which listens on `pointerover`) never fires.

⇒ [[B-141]] / [[B-143]] / [[B-144]] — _"the system knows something and does not say it."_

## What changes

1. **The canvas marks every element that is the subject of an error-severity issue** — the design
   system's existing `danger` token, plus a non-chromatic badge (shared `Icon`) and an accessible
   description carrying the issue's own message. Both overlap participants are marked; the marks clear
   when the geometry is fixed.
2. **The blocked Export button stops being inert.** It keeps `aria-disabled` so assistive technology
   still hears "unavailable", but the click lands and **opens the Issues panel and selects the
   offenders** — the one-click route from the button the author pressed to the full message.
3. **The unreachable `window.alert` is removed** and the generic tooltip is replaced by one that names
   the count and the first offender.

## The decision on task 3 — option (b), because (a) is not implementable here

The alternative was to keep the button disabled and enrich its tooltip. That cannot work on this
control: its only delivery mechanism is a `title` on a disabled button, which the browser suppresses
and the app's own tooltip cannot see. Enriching a string that never renders would reproduce the exact
defect this change removes.

⚠ The refusal opens the panel rather than raising a toast: `showNotice` is a 5-second transient and
[[B-173]] already records that designed refusal sentences outlive it. A short notice names the count
and the first offender; the panel holds the full text for as long as the author wants it.

⚠ `!hasComp` keeps a genuinely `disabled` button — there is no composition to export and no issue to
explain, so a click would have nothing to say.

## Deliberately NOT in scope

- **No tolerance is added to the overlap rule.** While reading the geometry for this change, a second
  defect was found: the rule is violable INVISIBLY by sub-pixel float residue. Filed as [[B-180]], with
  three candidate fixes and none chosen — an epsilon on this rule is a decision with on-air
  consequences and it is the owner's.
- **The issue MESSAGES are not rewritten.** They are already good.
- **The mark is a designer-side overlay**, not a change to the plate the preview iframe paints — which
  is also what lets one test assert the rule and the surface for the same fixture.
