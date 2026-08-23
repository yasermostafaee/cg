import type { StackItemState } from '@cg/shared-schema';
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

/** Percent, for the operator. The wire takes a 0–1 gain. */
export function pct(volume: number): string {
  return `${String(Math.round(volume * 100))}%`;
}

/**
 * The plate's recorded intent, or `undefined` when nobody has said.
 *
 * A one-line helper rather than an inline lookup because it is the exact place the `?? 0`
 * temptation appears: a caller that defaults to `0` here can no longer tell "chosen silent"
 * from "never asked", and both this module's pill wording and the row summary depend on the
 * difference.
 */
export function plateIntent(item: StackItemState, plateId: string): number | undefined {
  return item.plateVolumes?.[plateId];
}

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
  const state = plateAudioState(volume, held);
  if (state !== 'held') return PILL[state];
  const armed = volume !== undefined && volume > 0;
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

/**
 * PANIC's map for ONE row — every plate it owns, at zero.
 *
 * Deduplicated, because a fill+key pair puts the same `sourceId` on two ledger records and a
 * map with the key written twice is the same map written twice.
 */
export function panicMap(seatedPlateIds: readonly string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const id of seatedPlateIds) map[id] = 0;
  return map;
}

/**
 * The layer row's compact READ-ONLY summary: how many of a row's plates are raised.
 *
 * `total` is the SEATED count rather than the declared one, for `soloMap`'s reason — the two
 * numbers have to describe the same set or `audio 2/4` names a denominator the strip below it
 * does not have.
 *
 * Returns `null` when the row owns no live plates at all, which is what keeps the summary off
 * every ordinary row rather than printing `audio 0/0`.
 */
export function audioSummary(
  item: StackItemState,
  seatedPlateIds: readonly string[],
): { raised: number; total: number; label: string } | null {
  const unique = [...new Set(seatedPlateIds)];
  if (unique.length === 0) return null;
  const raised = unique.filter((id) => {
    const v = plateIntent(item, id);
    // `=== undefined` and then `> 0`: an explicit 0 is NOT raised, and neither is an absent
    // key, but they arrive here as different values and must not be folded by a truthiness
    // test that happens to agree today.
    return v !== undefined && v > 0;
  }).length;
  return {
    raised,
    total: unique.length,
    label: `audio ${String(raised)}/${String(unique.length)}`,
  };
}
