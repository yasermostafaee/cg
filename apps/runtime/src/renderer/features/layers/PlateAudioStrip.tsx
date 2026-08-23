import { useState } from 'react';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { pct } from './plateAudio.js';
import type { LiveLayerRowView } from './liveLayerRows.js';
import { soloMap } from './plateAudio.js';

/**
 * `add-multibox-audio` — **ONE PLATE'S AUDIO, ON THE ROW ITSELF: the state, the fader,
 * ON/OFF and SOLO, with no dialog to open first.**
 *
 * ── WHY THIS EXISTS BESIDE THE DIALOG THAT ALREADY DID THIS ─────────────────
 *
 * `LivePlateAudioDialog` is reachable from ONE row's action set and shows nothing until it is
 * opened. So the console's answer to *"is this guest audible?"* was **open a dialog and look**
 * — for every row, one at a time — while `StackItemState.plateVolumes` was already on the wire
 * carrying the answer for all of them. Audio is the one property of a graphic an operator
 * cannot see; a surface that requires a click to reveal it is not a surface for a gallery.
 *
 * The dialog stays. It is where a row's plates are adjusted together, and it now carries the
 * same ON/OFF and SOLO. This is the same information, always visible, on the tab that already
 * enumerates every seated plate.
 *
 * ── 🔴 A PILL, NEVER A METER ────────────────────────────────────────────────
 *
 * Everything here describes what was ASKED FOR. Nothing in this product can currently say
 * whether sound is PRESENT: CasparCG's programme channel reports ONE peak pair for the whole
 * channel — the maximum across every mixed layer — so a per-input level does not exist to be
 * read until an installation has a monitor-channel array (`add-multibox-audio` design.md §6,
 * gated on the plant walk). A bar or a needle here would claim the thing this data cannot say,
 * and "we asked for 100 %" would silently become "this guest is talking".
 *
 * ── 🔴 A HELD PLATE IS NOT GREYED ───────────────────────────────────────────
 *
 * Grey reads as DISABLED. A held plate's controls are live on purpose: arming its audio
 * BEFORE switching to the look that shows it is the before-the-take affordance the whole mute
 * rule exists to preserve, and the bridge records that intent without sending anything. What
 * changes for a held plate is the WORDING, not the availability — see `plateAudioPill`.
 */

const styles = {
  strip: {
    display: 'grid',
    gridTemplateColumns: 'minmax(9rem, auto) minmax(6rem, 1fr) 3rem auto',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.35rem 0 0',
  },
  pill: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 },
  dot: { fontSize: '0.7rem', lineHeight: 1 },
  pillLabel: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  readout: {
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
    color: colors.textMuted,
  },
  buttons: { display: 'flex', gap: '0.35rem' },
} as const;

export interface PlateAudioStripProps {
  row: LiveLayerRowView;
  /**
   * Every plate this ROW's item owns — SOLO's scope. Passed in rather than derived here for
   * the reason `releaseScopeOf` is: the set a control acts on and the set the operator can see
   * must be one evaluation.
   */
  siblings: readonly string[];
  /**
   * Why a command cannot leave the browser, when it cannot. The controls stay PRESENT and go
   * disabled with the reason — the station tab's rule: an enabled button whose command cannot
   * leave the browser is not a capability, it is the appearance of one.
   */
  refusal: string | undefined;
  /** Apply a map of plate volumes to this row's item. ONE call, whatever the gesture. */
  onApply: (volumes: Record<string, number>) => Promise<{ ok: boolean; refused: string[] }>;
}

export function PlateAudioStrip({
  row,
  siblings,
  refusal,
  onApply,
}: PlateAudioStripProps): JSX.Element | null {
  /**
   * What the operator is dragging RIGHT NOW, before it is committed.
   *
   * Kept apart from the published intent for the dialog's reason: the published state is the
   * bridge's answer, and showing a slider position the bridge has not accepted would be the
   * optimistic-UI lie this project refuses everywhere else.
   */
  const [dragging, setDragging] = useState<number | null>(null);

  const audio = row.audio;
  // `null` means the console cannot honestly state this plate's audio — blind, or stranded.
  // See `LiveLayerRowView.audio`. Showing a strip here would be inventing an answer.
  if (audio === null) return null;

  // `??` twice, never `||`: a recorded intent of 0 is a REAL authored value ("muted by the
  // operator") and must not fall through to the default that happens to equal it.
  const shown = dragging ?? audio.volume ?? 0;
  const inputId = `plate-vol-${row.coordinate}`;

  const apply = async (volumes: Record<string, number>): Promise<{ accepted: boolean }> => {
    const res = await onApply(volumes);
    setDragging(null);
    return { accepted: res.ok };
  };

  return (
    <div style={styles.strip} data-plate-audio={row.plate}>
      <span
        style={styles.pill}
        title={audio.pill.detail}
        data-plate-audio-state={audio.held ? 'held' : shown > 0 ? 'audible' : 'silent'}
      >
        {/*
          A DOT plus a WORD, matching `.cg-pill`'s contract elsewhere in this app: the hue is
          never the only signal. A screen reader gets the word and the detail; a colour-blind
          operator gets the word.
        */}
        <span aria-hidden="true" style={{ ...styles.dot, color: audio.pill.tone }}>
          ●
        </span>
        <span style={{ ...styles.pillLabel, color: audio.pill.tone }}>{audio.pill.label}</span>
      </span>
      <input
        id={inputId}
        className="cg-field"
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(shown * 100)}
        disabled={refusal !== undefined}
        {...(refusal !== undefined ? { title: refusal } : {})}
        aria-label={`Volume for ${row.plate} on ${row.coordinate}`}
        onChange={(e) => {
          setDragging(Number(e.target.value) / 100);
        }}
        // Committed on RELEASE, not on every drag frame: one AMCP command per decision
        // rather than one per pixel.
        onPointerUp={() => {
          void apply({ [row.plate]: dragging ?? shown }).catch(() => undefined);
        }}
        onKeyUp={() => {
          void apply({ [row.plate]: dragging ?? shown }).catch(() => undefined);
        }}
      />
      <span style={styles.readout}>{pct(shown)}</span>
      <span style={styles.buttons}>
        {/*
          ON and OFF as two buttons rather than one toggle.

          A toggle has to be READ before it can be pressed — "is it on now, so pressing turns
          it off?" — and the answer under pressure is a guess. Two named buttons are
          idempotent: OFF always means silence, whatever state the plate was in, which is the
          urgent direction and the one an operator has seconds to get right.
        */}
        <AsyncButton
          variant="secondary"
          run={() => apply({ [row.plate]: 1 })}
          onError={reportCommandError}
          disabled={refusal !== undefined}
          {...(refusal !== undefined ? { title: refusal } : { title: ON_TITLE })}
          aria-label={`Full volume for ${row.plate} (100%, not the previous level)`}
        >
          ON
        </AsyncButton>
        <AsyncButton
          variant="secondary"
          run={() => apply({ [row.plate]: 0 })}
          onError={reportCommandError}
          disabled={refusal !== undefined}
          {...(refusal !== undefined ? { title: refusal } : {})}
          aria-label={`Silence ${row.plate}`}
        >
          OFF
        </AsyncButton>
        <AsyncButton
          variant="caution"
          run={() => apply(soloMap(siblings, row.plate))}
          onError={reportCommandError}
          disabled={refusal !== undefined || siblings.length < 2}
          title={
            refusal ??
            (siblings.length < 2
              ? 'This row has only one plate — there is nothing to solo against.'
              : SOLO_TITLE)
          }
          aria-label={`Solo ${row.plate} — silences the other ${String(siblings.length - 1)} plate(s) on this row, with no restore`}
        >
          SOLO
        </AsyncButton>
      </span>
    </div>
  );
}

/**
 * 🔴 **THE ONE SENTENCE THAT HAS TO BE ON THE CONTROL ITSELF.**
 *
 * OFF writes `0` and ON writes `1`. ON does NOT return the plate to whatever the fader said
 * before OFF, and an operator who assumes it does will put a guest back at full when they
 * meant to put them back at forty percent.
 *
 * Restoring the previous level needs a SECOND store of intent living beside the bridge's
 * `#plateVolumes` and answering the same question a second way — the `B-100` / `P-012` class
 * this repo has now paid for five times, and here its specific failure is that only one of the
 * two stores is retained, so after a bridge blip the plate returns at a volume nobody chose.
 * The trade is deliberate; saying so on the button is the price of making it.
 */
const ON_TITLE = 'ON = full volume (100%). It does not return to the previous fader level.';

const SOLO_TITLE =
  'Raise this plate and silence every other plate on this row. There is no un-solo — ' +
  'raise the others again on their own faders.';
