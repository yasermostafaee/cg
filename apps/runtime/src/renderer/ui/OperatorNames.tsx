import type { ReactNode } from 'react';
import type { OperatorRowName } from './operatorNaming.js';

/**
 * 🔴 **THE NAMES, EACH IN ITS OWN BIDI ISOLATE.**
 *
 * `operatorRowName` decides WHAT to say; this decides how to put it on a line without the
 * bidi algorithm rearranging it. The two are separate files because the first is
 * React-free and unit-tested as pure logic, and this one is markup.
 *
 * ── WHAT THIS PREVENTS ──────────────────────────────────────────────────────
 *
 * ⚠ **No incident. This is a precaution**, taken because the repo's standing rule is that
 * Persian/RTL is non-negotiable and mixed RTL/LTR must be tested — and this line is the
 * mixture in its most exposed form. `B-232`'s first spelling rendered `names.join(' · ')`
 * as ONE text node: a row named «زیرنویس اصلی» begins with a strong RTL character, while
 * the ` · ` separators and the trailing layer coordinate are NEUTRALS. In a line whose
 * base direction is the chrome's LTR, neutrals sitting between runs of opposite direction
 * resolve against their surroundings, and which side of a name they land on stops being
 * something the author chose.
 *
 * ⚠ **The fix is NOT `dir="auto"` on the line.** That would let a Persian first name flip
 * the WHOLE line to RTL, taking the English clauses beside it — `— not put back: it is on
 * PVW` — and the layer chip with it. The line is chrome and stays LTR; it is each piece of
 * OPERATOR DATA, whose direction nobody can know in advance, that is isolated. That is
 * what `<bdi>` is for, and its UA default is precisely `unicode-bidi: isolate` with
 * `dir=auto`.
 *
 * The separators are rendered BETWEEN the isolates rather than inside them, so they sit in
 * the line's own direction and cannot be dragged into a name's run.
 */
export function OperatorNames({ name }: { name: OperatorRowName }): JSX.Element {
  return (
    <>
      {name.names.map((n, i) => (
        <span key={`${String(i)}:${n}`}>
          {i > 0 ? ' · ' : ''}
          <bdi>{n}</bdi>
        </span>
      ))}
    </>
  );
}

/**
 * 🔴 `MODAL-CHROME-10` ADDENDUM B — **A NAME THAT IS ALSO A BOX.**
 *
 * ── THE DEFECT, AND WHY IT IS NOT WHAT IT LOOKS LIKE ────────────────────────
 *
 * The owner saw Persian template titles flushed hard RIGHT in the picker's list while English
 * ones sat left. The instinct is that something translated or something is RTL. Neither: the
 * UI is English and LTR and nothing about that changed.
 *
 * `<bdi>`'s UA default is `unicode-bidi: isolate` **plus `dir=auto`** — so a `<bdi>` holding a
 * Persian name resolves its OWN `direction` to `rtl`. While it is INLINE that is harmless and
 * correct: it decides the order of the characters inside it and nothing else. The moment the
 * same element becomes a BLOCK — declared `display: block`, or blockified by being a flex or
 * grid item, which is the half that catches people — its RTL direction reaches its own
 * ALIGNMENT, and `text-align: start` resolves to RIGHT.
 *
 * 🔴 **Bidi isolation governs the TEXT'S INTERNAL ORDER. It must never decide the BOX'S
 * ALIGNMENT.** Measured in Chromium: `.cg-tpl-name` computed `display: block`,
 * `direction: rtl`, `text-align: start` — the box filled its parent exactly (left offset 0,
 * 654 of 654 px), so the BOX was never wrong; the text inside it was flushed.
 *
 * ── WHY THE OBVIOUS FIX IS FORBIDDEN ────────────────────────────────────────
 *
 * ⚠ **DO NOT DELETE THE ISOLATION, and do not force `direction: ltr` onto the name.** The
 * isolation is load-bearing: this station's names are mixed — `زیرنویس معرفی — Guest Title` is
 * Latin inside Persian — and any name carrying digits, parentheses or a Latin word reorders
 * wrongly without it. That trades a visible misalignment for a SILENT mis-rendering, which is
 * strictly worse: nobody photographs it.
 *
 * ── THE SHAPE THAT IS CORRECT, AND IT ALREADY EXISTED ONE FILE UP ───────────
 *
 * `OperatorNames` above has had it all along: a plain LTR `<span>` for the box, an INLINE
 * `<bdi>` for the characters. This is that pattern given a name so the four surfaces that got
 * it wrong take the same one rather than each inventing a fix.
 *
 * The `className` and the `title` go on the WRAPPER, which is the box: layout is the box's
 * job, and the isolate must stay inline for its own job to be safe. `dir="ltr"` is explicit
 * rather than inherited — it makes the box immune to an ancestor that ever goes RTL, which is
 * the other way `text-align: start` can resolve to the wrong side.
 */
export function IsolatedName({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <span className={className} title={title} dir="ltr">
      <bdi>{children}</bdi>
    </span>
  );
}
