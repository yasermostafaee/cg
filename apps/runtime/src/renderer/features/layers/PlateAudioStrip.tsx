import { useState } from 'react';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Tag } from '../../ui/Tag.js';
import { reportCommandError } from '../status/commandFeedback.js';
import {
  OFF_TITLE,
  ON_TITLE,
  SOLO_ALONE_TITLE,
  SOLO_TITLE,
  pct,
  plateAudioState,
  soloMap,
} from './plateAudio.js';
import type { LiveLayerRowView } from './liveLayerRows.js';

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
 * ── `RUNTIME-REDESIGN-01` PHASE 6 — THREE CELLS OF THE PLATE TABLE ──────────
 *
 * The strip is the last three columns of the LIVE PLATES table (`07-live-plates.html` as
 * rendered): the AUDIO word, the GAIN fader with its readout, and the AUDIO CONTROLS. It lays
 * itself out as a SUBGRID of the row it sits in, so the words line up under the table head
 * without this component knowing the row's columns. The numbers are `PLATES_PX` (`theme.ts`).
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
  /*
    ⚠ `PLATES-AUDIO-11` §2 — KEYED BY ITEM AND PLATE, NOT BY COORDINATE. A declared frame
    has no coordinate, so two of them on one row would have produced the same `id` and the
    `<label>`/`<output>` association would have pointed at whichever rendered first.
  */
  const inputId = `plate-vol-${row.itemId}-${row.plate}`;

  const apply = async (volumes: Record<string, number>): Promise<{ accepted: boolean }> => {
    const res = await onApply(volumes);
    setDragging(null);
    return { accepted: res.ok };
  };

  return (
    <div className="cg-plate-strip" data-plate-audio={row.plate}>
      <Tag
        className="cg-plate-pill"
        title={audio.pill.detail}
        /*
          🔴 `plateAudioState`, NOT a local ternary — golden rule 6, and the two versions had
          already come apart. An inline `held ? … : shown > 0 ? …` reads the OPTIMISTIC drag
          value while the pill beside it reads the PUBLISHED one, so mid-drag this attribute
          said `audible` under a pill that said SILENT. Both now answer from the one predicate,
          on the one value: what the BRIDGE has accepted.
        */
        data-plate-audio-state={plateAudioState(audio.volume, audio.held)}
      >
        {/*
          A DOT plus a WORD, matching `.cg-pill`'s contract elsewhere in this app: the hue is
          never the only signal. A screen reader gets the word and the detail; a colour-blind
          operator gets the word.
        */}
        <span
          aria-hidden="true"
          className="cg-plate-pill-dot"
          style={{ backgroundColor: audio.pill.tone }}
        />
        <span className="cg-plate-pill-label" style={{ color: audio.pill.tone }}>
          {audio.pill.label}
        </span>
      </Tag>
      <span className="cg-plate-gain">
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
          aria-label={`Volume for ${row.plate} ${
            row.coordinate !== null ? `on ${row.coordinate}` : '(not seated)'
          }`}
          aria-valuetext={pct(shown)}
          onChange={(e) => {
            setDragging(Number(e.target.value) / 100);
          }}
          // Committed on RELEASE, not on every drag frame: one AMCP command per decision
          // rather than one per pixel.
          onPointerUp={() => {
            // `shown` already IS `dragging ?? published ?? 0` — see above. Re-testing `dragging`
            // here would be a third place the same fall-through is spelled out.
            void apply({ [row.plate]: shown }).catch(() => undefined);
          }}
          onKeyUp={() => {
            void apply({ [row.plate]: shown }).catch(() => undefined);
          }}
        />
        <output className="cg-plate-readout" htmlFor={inputId}>
          {pct(shown)}
        </output>
      </span>
      <span className="cg-plate-verbs">
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
          {...(refusal !== undefined ? { title: refusal } : { title: OFF_TITLE })}
          aria-label={`Silence ${row.plate}`}
        >
          OFF
        </AsyncButton>
        <AsyncButton
          variant="caution"
          run={() => apply(soloMap(siblings, row.plate))}
          onError={reportCommandError}
          disabled={refusal !== undefined || siblings.length < 2}
          title={refusal ?? (siblings.length < 2 ? SOLO_ALONE_TITLE : SOLO_TITLE)}
          aria-label={`Solo ${row.plate} — silences the other ${String(siblings.length - 1)} plate(s) on this row, with no restore`}
        >
          SOLO
        </AsyncButton>
      </span>
    </div>
  );
}

/*
  🔴 `PLATES-AUDIO-11` §4 — THE THREE VERB SENTENCES MOVED TO `plateAudio.ts`, AND THE MOVE IS
  THE POINT RATHER THAN A TIDY-UP.

  They lived here and a second, SHORTER spelling of the SOLO one lived in the dialog — which
  §4(b) then asked to carry the no-un-solo clause the strip already had. Adding it there would
  have made two copies agree ONCE; the vocabulary module is what makes them unable to disagree
  again. Same argument `plateAudioPill` is built on, one axis over: a verb's promise is operator
  copy about an irreversible write, and two spellings of it is how one surface comes to promise
  something the other does not.
*/
