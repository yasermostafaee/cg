import { colors } from '../../theme.js';

/**
 * `add-multibox-audio` — **THE ONE VOCABULARY FOR "WHAT IS THIS PLATE'S AUDIO DOING", and
 * the four operator gestures expressed as maps.**
 *
 * React-free and in its own module for `liveLayerRows`' reason: FOUR surfaces answer this
 * question now — the LIVE SOURCES strip, the PVW overlay glyph, the layer row's summary and
 * the per-row dialog — and four surfaces deriving the same fact independently is precisely
 * how one of them comes to disagree with the others about whether a guest can be heard. Audio
 * is the one property of a graphic an operator CANNOT see, so a disagreement here is
 * invisible until air.
 *
 * ── 🔴 `0` IS A REAL AUTHORED VALUE, AND EVERY READ HERE TESTS `=== undefined` ────
 *
 * A recorded `0` means _"the operator muted this plate"_. An ABSENT key means _"nobody has
 * said"_. They are different states, only one of them was CHOSEN, and zero is falsy — which
 * this repo has paid for three times. Nothing in this module uses `||`, and nothing folds the
 * two together.
 *
 * ── 🔴 AN INTENT IS NOT A MEASUREMENT ────────────────────────────────────────────
 *
 * Everything here describes what was ASKED FOR. Nothing here knows whether sound is actually
 * present — CasparCG's programme channel reports ONE peak pair for the whole channel, so a
 * per-input level does not exist to be read yet (see `add-multibox-audio` design.md §6). Every
 * indicator built on this module is therefore a **PILL** and never a bar, a needle or a meter
 * shape: a pill drawn as a meter would claim the thing this data cannot say.
 */

/**
 * What one plate's audio is doing, in the operator's terms.
 *
 * THREE states, and the third is not a shade of the second. `held` is §12.4's disposition —
 * the plate is seated but the active LOOK punches no hole in front of it, so the bridge keeps
 * it muted and idle. That is why a raised held plate is silent, and an operator who cannot
 * tell it from an ordinary mute will go looking for a fault in the input.
 */
export type PlateAudioState = 'audible' | 'silent' | 'held';

/**
 * The state of one plate.
 *
 * 🔴 **`held` WINS OVER THE VOLUME, whatever the volume is**, because the look — not the
 * intent — is what decides audibility for a held plate. Reporting a held-and-raised plate as
 * `audible` would be the console asserting sound that the hold's mute is actively preventing;
 * reporting a held-and-muted one as `silent` would hide the reason it is not going to become
 * audible when the operator raises it.
 *
 * `volume` is read with `=== undefined`, never truthiness — see the header.
 */
export function plateAudioState(volume: number | undefined, held: boolean): PlateAudioState {
  if (held) return 'held';
  if (volume === undefined) return 'silent';
  return volume > 0 ? 'audible' : 'silent';
}

/**
 * 🔴 **THE ONE ANSWER TO "WHAT IS THIS PLATE'S AUDIO DOING" — every surface asks THIS.**
 *
 * `add-multibox-audio` shipped with TWO definitions of "has sound" on one screen: the strips
 * and the dialog derived AUDIBLE/SILENT/ARMED from {@link plateAudioPill}, while the layer
 * row's summary counted `plateIntent > 0` on its own. That split is the whole of
 * `B-164`, and it produced two wrong numbers at once — an INTENT numerator (a held plate
 * armed at 100% counted as raised while it was silent on air) over a SEATED denominator (a
 * held plate is invisible and still inflated the total).
 *
 * The split is closed by making this the only place the three facts are derived, and by having
 * {@link plateAudioPill} and {@link audioSummary} both read it. It is the golden-rule-6 shape:
 * a second local copy of "can this be heard" is exactly how one surface comes to disagree with
 * the other about a property the operator CANNOT see.
 *
 * ⚠ **`audible` and `armed` are NOT the same question, and a held plate is where they part.**
 * `armed` is the recorded INTENT — the operator raised it. `audible` additionally requires the
 * active look to show the plate, because §12.4's hold keeps a seated-but-unshown plate muted
 * and idle no matter what the intent says. For a SHOWN plate the two agree; for a held one they
 * must not, and folding them is the defect.
 *
 * ⚠ Still an INTENT, never a measurement — see the module header. `audible` means "the console
 * asked for this plate's sound and nothing it knows about is suppressing it", not "a sample
 * reached the output".
 */
export interface PlateAudioVerdict {
  /** The three-state disposition — the same one the pill wears. */
  state: PlateAudioState;
  /** Sound is being asked for AND the look is not suppressing it. */
  audible: boolean;
  /** The operator raised this plate. TRUE for a held plate too — that is the point. */
  armed: boolean;
}

export function plateAudioVerdict(volume: number | undefined, held: boolean): PlateAudioVerdict {
  const state = plateAudioState(volume, held);
  return {
    state,
    audible: state === 'audible',
    // `=== undefined` and then `> 0`, never truthiness: an explicit 0 is a CHOICE to mute and
    // an absent key is nobody having said, and both must fail this test for different reasons
    // (module header). Zero is falsy, which this repo has paid for three times.
    armed: volume !== undefined && volume > 0,
  };
}

/** Percent, for the operator. The wire takes a 0–1 gain. */
export function pct(volume: number): string {
  return `${String(Math.round(volume * 100))}%`;
}

/*
  ⚠ **A `plateIntent(item, plateId)` helper lived here and was REMOVED, not left unused** —
  the same call this module already made about `panicMap` below, for the same reason.

  It read one plate's recorded volume off a `StackItemState`, and it existed because
  `audioSummary` took the ITEM and did the join itself. That join was the wrong shape: reading
  an intent map is not enough to answer "is this plate audible", because audibility also needs
  §12.4's `held`, which lives on the LEDGER and not on the item. `B-164` moved the join to the
  panel — `rowPlateAudioOf` reads both facts off the same `LiveLayerRowView`s the strips render
  — and with it this helper's only caller went away.

  Noted rather than silently deleted because the pull towards re-adding one is real: if you
  find yourself reaching for a plate's volume off the stack item inside this module, the
  question to ask is whether you also have its `held`, because a verdict built on one of the
  two is the defect this item fixed.
*/

export interface PlateAudioPill {
  /** The WORD. Never omitted — the hue is never the only signal (theme.ts's rule). */
  label: string;
  /** The dot's colour. */
  tone: string;
  /** The longer reading, for a tooltip and an accessible name. */
  detail: string;
}

/**
 * How each state READS.
 *
 * ── COLOUR, AND WHY EACH CANDIDATE WAS RULED IN OR OUT ──────────────────────────
 *
 *   - **GREEN is out absolutely.** It is the sacred ON AIR mark of the layer TABLE, and a
 *     plate borrowing it would put a second, unrelated air claim on a different surface —
 *     the rule `liveLayerRows` already states for this very tab.
 *   - **AMBER is out for `held`**, which is the choice a reader will question. Amber means
 *     ATTENTION here, and `held` is a NORMAL, CHOSEN disposition — the neighbouring module
 *     says so in as many words: *"`held` is a normal, chosen disposition and wears a WORD,
 *     not a hue."* Following that rule is what keeps the two surfaces agreeing.
 *   - **SKY for `audible`.** It is unused on this surface, it is not a state hue anywhere in
 *     the LIVE SOURCES tab, and "this plate can be heard" is a positive statement rather than
 *     something to go and look at.
 *   - **MUTED GREY for `silent`**, because silence is the DEFAULT: every producer the bridge
 *     creates is created muted, so the common case should recede.
 */
const PILL: Record<'audible' | 'silent', PlateAudioPill> = {
  audible: {
    label: 'AUDIBLE',
    tone: colors.ready,
    detail: 'This plate is raised, so its source can be heard on air.',
  },
  silent: {
    label: 'SILENT',
    tone: colors.textMuted,
    detail:
      'This plate is not raised. Every live plate starts silent — a plate carries its ' +
      'guest’s live microphone, so nothing is audible until it is raised here.',
  },
};

/**
 * `held`'s hue, kept beside the other two rather than in {@link plateAudioPill}'s body — the
 * three states' colours belong in one place even though this one's WORDING is computed.
 *
 * NEUTRAL, and that is the neighbouring module's rule rather than a choice made here: *"`held`
 * is a normal, chosen disposition and wears a WORD, not a hue."* Amber would make a held plate
 * read as something to go and look at, and the LIVE SOURCES tab already refuses to say that
 * about the same state one row up.
 */
const HELD_TONE = colors.text;

/**
 * The pill for one plate.
 *
 * 🔴 **A HELD PLATE READS DIFFERENTLY DEPENDING ON WHETHER IT IS ARMED, and that is the one
 * place a state carries two wordings.** "Armed, not audible" and "not raised" are different
 * things to tell an operator looking at a box they cannot hear:
 *
 *   - **armed and held** — you already raised this; it is silent because the look hides it,
 *     not because anything is wrong. Do NOT go looking for a fault in the input.
 *   - **not armed and held** — raising it now is exactly the right move, and it will take
 *     effect when a look that shows this box is entered.
 *
 * That second sentence is the whole reason the control stays LIVE on a held plate rather than
 * being disabled: arming a held plate's audio BEFORE switching to its look is the
 * before-the-take affordance the mute rule exists to preserve.
 */
export function plateAudioPill(volume: number | undefined, held: boolean): PlateAudioPill {
  // The SHARED verdict, not a local re-derivation — `armed` used to be computed inline here
  // and nowhere else could reach it, which is half of why the row summary grew its own rule.
  const { state, armed } = plateAudioVerdict(volume, held);
  if (state !== 'held') return PILL[state];
  return {
    label: armed ? 'ARMED · HIDDEN BY THIS LOOK' : 'HIDDEN BY THIS LOOK',
    tone: HELD_TONE,
    detail: armed
      ? 'Armed, not audible — the current look does not show this box. It becomes audible ' +
        'the moment a look that shows it is entered; nothing is wrong with the input.'
      : 'Not audible — the current look does not show this box. Raising it now takes effect ' +
        'when you switch to a look that shows it.',
  };
}

/**
 * 🔴 **SOLO — one map, built HERE so that every surface offering SOLO addresses the same set.**
 *
 * The RAISED plate is placed FIRST in the map, and that is not cosmetic: the bridge applies
 * entries in insertion order, so a map that fails half-way has silenced siblings rather than
 * raised ones. Silence is the safe direction; a half-applied SOLO that left two guests up is
 * not.
 *
 * ⚠ **THE SIBLING SET IS THE ITEM'S SEATED PLATES**, as the bridge's own ledger reports them —
 * not the template's declaration and not the active look's membership. Three reasons, and they
 * point the same way: only a SEATED plate can be audible; the pre-seat is the UNION of every
 * look, so a HELD plate is in the set and correctly receives a recorded-only `0`; and the
 * ledger is the same array the panel is already rendering, so what SOLO addresses and what the
 * operator can see cannot disagree.
 *
 * ⚠ Every sibling is named EXPLICITLY rather than left out of the map. An absent key means
 * "leave this plate alone", so omission would make SOLO a no-op on everything but the chosen
 * plate.
 */
export function soloMap(
  seatedPlateIds: readonly string[],
  plateId: string,
): Record<string, number> {
  const map: Record<string, number> = { [plateId]: 1 };
  for (const id of seatedPlateIds) {
    if (id !== plateId) map[id] = 0;
  }
  return map;
}

/*
  ⚠ **A `panicMap(seatedPlateIds)` helper lived here and was REMOVED, not left unused.**

  It built PANIC's all-zero map for one row, back when the renderer resolved PANIC's SCOPE from
  the on-air rows. That scope was the defect (`B-122`'s shape: an emergency control gated on
  believed status), and PANIC is now a bridge verb that takes no arguments and reads its own
  ledger — so nothing calls this, and a helper nothing calls is the written-but-unreachable
  class this repo has filed repeatedly. Noted rather than silently deleted because the pull
  towards re-adding one is real: if you find yourself building a panic map in the renderer, the
  question to ask is why the browser is choosing the scope of an emergency verb at all.
*/

/**
 * One plate this row owns, with the two facts audibility needs.
 *
 * Built by the panel from the SAME `LiveLayerRowView`s the LIVE SOURCES tab renders
 * (`rowPlateAudioOf`), so the chip and the strips below it cannot describe different plates.
 * `volume` is the recorded intent — `undefined` is a REAL third state ("nobody has said") and
 * is never collapsed to `0` on the way here.
 */
export interface RowPlateAudio {
  plateId: string;
  volume: number | undefined;
  held: boolean;
}

export interface AudioSummary {
  /** Plates the active look SHOWS whose sound is being asked for. */
  audible: number;
  /** Plates the active look SHOWS. The denominator, and the whole of `B-164`'s first half. */
  shown: number;
  /** Plates that are armed but HELD — outside the fraction, never folded into it. */
  armedHidden: number;
  /** The chip's text. */
  label: string;
  /** The sentence, for the tooltip and the accessible name. */
  detail: string;
}

/**
 * The layer row's compact READ-ONLY summary.
 *
 * 🔴 **`B-164` — BOTH NUMBERS WERE COUNTING THE WRONG THING, AND THE FIX IS THE AXIS, NOT THE
 * ARITHMETIC.**
 *
 * The owner measured one row, one template declaring three plates, three looks:
 *
 * | look   | boxes on screen | the chip read |
 * | ------ | --------------- | ------------- |
 * | ghab-1 | 1               | `audio 1/2`   |
 * | ghab-2 | 2               | `audio 1/3`   |
 * | ghab-3 | 3               | `audio 1/3`   |
 *
 *   - **The DENOMINATOR counted SEATS, not what the look SHOWS.** The bridge pre-seats the
 *     UNION of every look, so a held plate is seated, invisible, and was still inflating the
 *     total — which is precisely `1 box → /2` and `2 boxes → /3`.
 *   - **The NUMERATOR counted INTENT, not audibility.** A held plate armed at 100% — which the
 *     audio dialog EXISTS to permit, so the operator can arm a box before switching to its
 *     look — read as raised while it was silent on air. The chip could say `2/2` with one
 *     plate making sound. That half is worse and the owner has not hit it yet.
 *
 * ⚠ **The wrong axis is SEATED vs SHOWN, and the fix is NOT to count DECLARED plates.**
 * `LayerRow.tsx`'s prop still argues why seated beats declared — a declared plate with no
 * producer cannot be audible — and that argument is untouched. Both numbers here are drawn
 * from the SEATED set; what changed is that the fraction is narrowed to the shown part of it.
 *
 * ⚠ **The armed-but-hidden count is reported SEPARATELY and never inside the fraction.** The
 * operator armed that plate deliberately and needs to know it is waiting; putting it in the
 * numerator would claim sound that the hold is preventing, and dropping it would silently lose
 * the one thing the pre-arm affordance exists to make visible.
 *
 * Returns `null` when the row owns no live plates at all — what keeps the chip off every
 * ordinary row. A row whose active look shows NO plates still summarises (`audio 0/0` is
 * suppressed by `plates.length === 0`, not by `shown === 0`): an all-held row with something
 * armed has a real thing to say.
 */
export function audioSummary(plates: readonly RowPlateAudio[]): AudioSummary | null {
  // Deduplicated by plate id: a fill+key pair puts the same `sourceId` on TWO ledger records,
  // and counting both would double every keyed guest.
  const unique = [...new Map(plates.map((p) => [p.plateId, p])).values()];
  if (unique.length === 0) return null;
  let audible = 0;
  let shown = 0;
  let armedHidden = 0;
  for (const plate of unique) {
    // ONE verdict function, the same one the strips and the dialog read.
    const verdict = plateAudioVerdict(plate.volume, plate.held);
    if (plate.held) {
      if (verdict.armed) armedHidden++;
      continue;
    }
    shown++;
    if (verdict.audible) audible++;
  }
  const label =
    `audio ${String(audible)}/${String(shown)}` +
    // Only when non-zero: an ordinary row must not carry a permanent `· 0 armed`.
    (armedHidden > 0 ? ` · ${String(armedHidden)} armed` : '');
  return { audible, shown, armedHidden, label, detail: summaryDetail(audible, shown, armedHidden) };
}

/**
 * The summary said as a sentence.
 *
 * 🔴 **IT CLAIMS ONLY WHAT THE CONSOLE KNOWS.** The old wording was _"N of this row's M live
 * plates are raised"_ — and "raised" is an INTENT word being used where a reader takes it as a
 * report about air. Nothing in this console can know a sample reached the output: CasparCG's
 * programme channel reports ONE peak pair for the whole channel, so a per-input level does not
 * exist to be read (`add-multibox-audio` design.md §6). So the sentence says what was ASKED
 * FOR, and says out loud that it is not a measurement — rather than leaving a reader to infer
 * which of the two they are looking at.
 */
function summaryDetail(audible: number, shown: number, armedHidden: number): string {
  const head =
    shown === 0
      ? 'This look shows no live plates.'
      : `Sound is asked for on ${String(audible)} of the ${String(shown)} live ` +
        `${shown === 1 ? 'plate' : 'plates'} this look shows.`;
  const waiting =
    armedHidden === 0
      ? ''
      : ` ${String(armedHidden)} more ${armedHidden === 1 ? 'is' : 'are'} armed but hidden by ` +
        `this look — ${armedHidden === 1 ? 'it becomes' : 'they become'} audible on switching ` +
        `to a look that shows ${armedHidden === 1 ? 'it' : 'them'}.`;
  return (
    `${head}${waiting} Nothing here measures the output — this is what the console asked for. ` +
    `Open LIVE SOURCES, or this row's audio dialog, to change it.`
  );
}
