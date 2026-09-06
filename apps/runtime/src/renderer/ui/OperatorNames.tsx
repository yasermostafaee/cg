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
