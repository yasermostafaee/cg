import { aspectForFormat, type SourceDefinition } from '@cg/shared-ipc';
import { DEFAULT_LIVE_FIT_MODE, type LiveFitMode } from '@cg/shared-schema';

/**
 * C-015 phase 6 (task 6.3) — **THE FIT ASPECT: which number the crop is driven by,
 * and what happens when nobody states one.**
 *
 * design.md §3a's chain, in order, and the order IS the decision:
 *
 *   1. the assigned source's `format` → its display aspect (`1080i5000` → 16:9);
 *   2. the assigned source's explicit `aspect`, where the format determines none;
 *   3. the element's `expectedAspect` — the author's best guess, LAST;
 *   4. nothing at all → see the D-147 decision below.
 *
 * 🔴 **WHY THE SOURCE OUTRANKS THE AUTHOR, AND WHY THAT IS NOT A PREFERENCE.**
 * Crop-to-fill DISCARDS PICTURE. Driving it from an authored guess would silently
 * cut the wrong part of a face — and the author cannot see the feed, so their guess
 * is about what they DESIGNED FOR, not about what arrives. The installation's
 * operator, who defined "Studio A", is the only party who knows.
 *
 * 🔴 **AND WHY A TYPED `aspect` OUTRANKS NOTHING BUT COMES AFTER `format`.** A
 * hand-entered aspect is a number that can be wrong on air while looking entirely
 * reasonable; `1080i5000` is 16:9 whatever anyone types beside it. So the explicit
 * value is consulted only where the format has nothing to say.
 */

/** A distinct code per refusal, so the operator is told WHICH problem this is. */
export const LIVE_PLATE_ASPECT_MISMATCH = 'live-source-aspect-mismatch';

/**
 * How much disagreement between the author's `expectedAspect` and the source's real
 * aspect is TOLERATED before the take is refused: 1%, relative.
 *
 * Derived from the two things it has to separate, not picked:
 *
 *  - **What it must ABSORB** — an author types a rounded decimal. 16:9 is
 *    1.777…, and `1.78` is 0.12% away; 4:3 is 1.333… and `1.33` is 0.25% away.
 *    Refusing a take on air because someone wrote two decimal places would be a
 *    refusal that teaches operators to stop stating the field at all.
 *  - **What it must CATCH** — a genuine format difference. The two closest
 *    distinct display aspects in the catalog vocabulary are 16:9 (1.778) and DCI
 *    1080 (2048/1080 = 1.896), **6.6% apart**; 16:9 versus 4:3 is 33% apart. Every
 *    real mismatch is an order of magnitude outside this band.
 *
 * So 1% sits with a factor of four of headroom above the worst rounding and a
 * factor of six below the smallest real difference.
 */
export const ASPECT_MATCH_TOLERANCE = 0.01;

export interface PlateAspectInput {
  /** The operator-facing handle for the plate — used in the refusal message. */
  readonly plateId: string;
  /** The catalog entry this plate is ASSIGNED to. Resolved by the caller (6.7). */
  readonly source: SourceDefinition;
  /** The author's assertion about the feed's shape, when they made one. */
  readonly expectedAspect: number | undefined;
  /**
   * ⭐ `C-028` — the RESOLVED fit mode ({@link resolvePlateFitMode}), which decides
   * whether a contradicted aspect REFUSES the take or merely warns.
   *
   * 🔴 **REQUIRED, with no default, and that is deliberate.** A defaulted mode is how
   * this becomes a silent no-op: default it to `cover` and every call site that has not
   * learned about modes keeps refusing exactly as before while the feature looks
   * shipped; default it to `contain` and a forgotten call site silently stops refusing a
   * take that would genuinely crop. Requiring it makes the COMPILER enumerate the call
   * sites, which is the one thing that cannot be forgotten.
   */
  readonly fitMode: LiveFitMode;
}

export type PlateAspectOutcome =
  | {
      readonly ok: true;
      /**
       * The aspect the crop is driven by, or `null` for NO CROP — see the D-147
       * decision on {@link resolvePlateAspect}.
       */
      readonly aspect: number | null;
      /**
       * TRUE when nothing in the chain stated an aspect and the fit fell through to
       * "assume the hole's own shape".
       *
       * A separate field rather than `aspect === null` because the two are different
       * questions and a consumer needs both: `aspect` says what the geometry does,
       * this says how much we KNOW. It is what lets a row or a log say "fitted
       * unverified" instead of claiming a verified fit — the honesty half of a
       * decision that deliberately does not refuse.
       */
      readonly assumed: boolean;
      /**
       * ⭐ `C-028` — **the mismatch that DID happen and was not refused, because the mode
       * is `contain` and nothing is cropped.**
       *
       * 🔴 **The reason travels with the outcome in BOTH arms.** This carries the SAME
       * `errorCode` and the SAME `message` the refusal would have — the mode decides the
       * DISPOSITION, never the wording. A `contain` arm that returned a bare boolean, or
       * no signal at all, would lose the one sentence that tells an operator which plate
       * disagrees with which source; a refusal that loses its reason is a worse defect
       * than the one it prevents, and so is a warning that loses it.
       *
       * Absent means no disagreement — never "a disagreement we decided not to mention".
       */
      readonly warning?: {
        readonly errorCode: typeof LIVE_PLATE_ASPECT_MISMATCH;
        readonly message: string;
      };
    }
  | {
      readonly ok: false;
      readonly errorCode: typeof LIVE_PLATE_ASPECT_MISMATCH;
      /** Names the plate, the author's number and the source's — never a bare code. */
      readonly message: string;
    };

/**
 * Resolve the fit aspect for ONE plate, or refuse.
 *
 * ── ⭐ THE D-147 DECISION — NEITHER SIDE STATES AN ASPECT (2026-08-14) ───────
 *
 * design.md §3a step 4 left this open with two candidates: **assume the hole's own
 * aspect (⇒ no crop)**, or **refuse the take with a distinct errorCode**.
 *
 * **DECIDED: assume the hole's own aspect — NO CROP — and mark the result
 * `assumed`.** The reasoning, in the order it actually decided the matter:
 *
 * 1. 🔴 **`AUTO` IS A FIRST-CLASS, DELIBERATE CONFIGURATION, AND REFUSING WOULD
 *    OUTLAW IT.** This is the argument from the CODE rather than from taste, and it
 *    is on its own sufficient. `LIVE_SOURCE_FORMATS` includes `AUTO`;
 *    `aspectForFormat` returns `null` for it and for nothing else, and its own
 *    docstring calls it _"a request to the hardware, not a statement about the
 *    picture"_. An operator who picks `AUTO` — because the card negotiates, or
 *    because the feed varies — has configured the system correctly. Refusing their
 *    take would make a supported catalog value unusable, and nothing in the UI
 *    would tell them why.
 * 2. **THE REFUSALS IN THIS DESIGN ARE FOR CONFLICT, NOT FOR ABSENCE.** The other
 *    two are a plate with NO ASSIGNMENT (nothing to show at all) and an
 *    `expectedAspect` that DISAGREES with the source (two facts that contradict).
 *    Both are positive knowledge of a problem. This case is the absence of a
 *    cosmetic detail on a plate that is otherwise fully configured.
 * 3. **THE HARMS ARE NOT COMPARABLE.** Assuming gives a picture that may be
 *    stretched — which is exactly today's behaviour for every source, and what this
 *    whole feature improves on. Refusing gives a BLACK BOX where a guest should be,
 *    on a plate the operator correctly assigned. Refusing a remedy because a detail
 *    is unknown is fail-STUCK, not fail-safe.
 * 4. **§3's own fallback ladder is written as DEGRADATION, not as a gate** — the
 *    fallback exists so the feature is _"usable before every source is fully
 *    described"_, and D-147 made `expectedAspect` optional precisely so an author
 *    who cannot see the feed _"is not forced into a guess that can refuse a take on
 *    air"_. Refusing here would reintroduce, at the installation end, the very
 *    forced guess D-147 removed at the authoring end.
 *
 * ⚠ **FLAGGED FOR THE OWNER as a reversible choice.** It is a judgement about which
 * on-air failure is worse, and the owner may weigh a stretched face against a black
 * box differently. `assumed` is the seam: it already carries the fact, so switching
 * to a refusal is a change at THIS function and its callers, not a redesign.
 */
export function resolvePlateAspect(input: PlateAspectInput): PlateAspectOutcome {
  // Steps 1 and 2, through the canonical `sourceAspect` order — never re-spelled
  // here, or the fit would come to disagree with what the catalog UI displays.
  const fromFormat =
    input.source.format === undefined ? null : aspectForFormat(input.source.format);
  const stated = fromFormat ?? input.source.aspect ?? null;
  const expected = input.expectedAspect;

  /*
   * THE VALIDATION, which is a DIFFERENT ROLE from the fallback below and must not
   * be collapsed into it (design.md §3a's own warning).
   *
   * `expectedAspect` is the AUTHOR'S ASSERTION — "this window is designed for a
   * 16:9 feed" — and the bridge's job is to check the assigned source against it and
   * REFUSE rather than silently crop something the author never anticipated. It
   * appearing at step 3 of the fit chain is a fallback for an undescribed source,
   * not a promotion to fit input.
   *
   * Both must be present for a disagreement to exist: an absent `expectedAspect` is
   * "I am not asserting anything" (D-147's third state), not a claim of 0.
   */
  let warning: NonNullable<Extract<PlateAspectOutcome, { ok: true }>['warning']> | undefined;
  if (stated !== null && expected !== undefined) {
    const relative = Math.abs(stated - expected) / expected;
    if (relative > ASPECT_MATCH_TOLERANCE) {
      /*
        ⭐ `C-028` — ONE CONDITION, ONE STATEMENT OF FACT, TWO DISPOSITIONS.

        🔴 The disagreement is detected identically in both modes and the FACTS are
        written once: the plate, the author's number and the source's. That half is what
        "the reason travels with the outcome" means, and building it above the branch is
        what stops the warning drifting into saying something the refusal does not.

        ⚠ **The CONSEQUENCE clause differs, and it must.** The shipped sentence —
        _"Cropping it would cut a part of the picture the author never saw"_ — is FALSE
        under `contain`, where nothing is cropped. Repeating it verbatim would hand the
        operator a reason that does not apply to what they are looking at, which is a way
        of losing the reason rather than keeping it. So `cover` keeps its wording
        untouched and `contain` states its own true consequence: the picture will not
        fill the box the author drew.

        Under `contain` the harm this refusal guards against cannot occur, and a take
        blocked on air for an impossible harm is a refusal that teaches operators to stop
        stating the field at all. Under `cover` the harm is real and the refusal stands.
      */
      const detail = {
        errorCode: LIVE_PLATE_ASPECT_MISMATCH,
        // NAMES the plate and BOTH numbers. A bare "aspect mismatch" sends the
        // operator to guess which of several plates, and to guess which side to fix.
        message:
          `plate "${input.plateId}" is designed for a ${fmt(expected)} feed, but the ` +
          `assigned source "${input.source.name}" delivers ${fmt(stated)}. ` +
          (input.fitMode === 'cover'
            ? `Cropping it would cut a part of the picture the author never saw — ` +
              `re-assign the plate, or correct the source's format.`
            : `Nothing is cropped — the picture is fitted whole and the margin shows the ` +
              `template — but it will not fill the box the author drew.`),
      } as const;
      if (input.fitMode === 'cover') return { ok: false, ...detail };
      warning = detail;
    }
  }

  // Step 3: the author's guess, for an undescribed source.
  if (stated !== null) {
    return { ok: true, aspect: stated, assumed: false, ...(warning !== undefined && { warning }) };
  }
  if (expected !== undefined) return { ok: true, aspect: expected, assumed: false };
  // Step 4: the D-147 decision. NO CROP, and say that we are assuming.
  return { ok: true, aspect: null, assumed: true };
}

/**
 * ⭐ `C-028` — **THE FIT MODE for one plate: the operator's override, then the author's,
 * then `contain`.**
 *
 * 🔴 **THIS CHAIN RUNS THE OPPOSITE WAY ROUND FROM {@link resolvePlateAspect}'S, AND
 * THAT IS THE DECISION RATHER THAN AN INCONSISTENCY.** They resolve different kinds of
 * fact and collapsing them would get one of the two wrong:
 *
 *  - The **aspect** is a MEASURABLE PROPERTY of the feed. The author cannot see the feed,
 *    so their `expectedAspect` is a statement about what they DESIGNED FOR, and the
 *    installation — which knows what actually arrives — outranks it (`D-147`).
 *  - The **mode** is a PRESENTATION CHOICE about that feed. The author states what the
 *    design wants, and the operator, who is looking at the picture on the day, is the
 *    only party who can say the design's choice is wrong for this shot. So the operator
 *    outranks the author here.
 *
 * Absent at BOTH levels is `contain` — the `C-028` default, and never `cover`. A caller
 * that read `undefined` as `cover` would keep today's picture on air while looking
 * entirely implemented, which is why the fall-through is a named constant rather than a
 * literal at each site.
 *
 * ⚠ Deliberately NOT folded into `resolvePlateAspect`. That function's outcome is
 * `ok`/refusal and this one cannot fail; giving it a second answer would make a total
 * function partial for no reason, and would put the two chains where a later reader could
 * "align" them.
 */
export function resolvePlateFitMode(
  override: LiveFitMode | undefined,
  authored: LiveFitMode | undefined,
): LiveFitMode {
  return override ?? authored ?? DEFAULT_LIVE_FIT_MODE;
}

/** An aspect as an operator reads it: `16:9` where it is a familiar one, else `1.85`. */
function fmt(aspect: number): string {
  const known: readonly [string, number][] = [
    ['16:9', 16 / 9],
    ['4:3', 4 / 3],
    ['21:9', 21 / 9],
    ['1:1', 1],
  ];
  for (const [label, value] of known) {
    if (Math.abs(aspect - value) / value <= ASPECT_MATCH_TOLERANCE) return label;
  }
  return aspect.toFixed(3).replace(/\.?0+$/, '');
}
