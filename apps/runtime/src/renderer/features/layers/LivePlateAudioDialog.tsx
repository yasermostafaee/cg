import { useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Button } from '../../ui/Button.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
import type { OperatorRowName } from '../../ui/operatorNaming.js';
import { lookOptionsOf } from './LookPicker.js';
// The ONE vocabulary, shared with the LIVE SOURCES strip and the row's summary — so the
// dialog's SOLO and the panel's SOLO cannot address different sets, and the dialog's state
// words cannot disagree with the strip's about whether a guest can be heard.
import {
  pct,
  plateAudioPill,
  soloMap,
  UNSEATED_PILL,
  type PlateAudioPill,
  type RowPlateAudio,
} from './plateAudio.js';

/**
 * C-015 phase 6 (6.5f) — **RAISE (or mute) ONE ROW's plates: the operator surface for the
 * explicit recorded intent the mute rule defers to.**
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
 *
 * The audio rule is that every producer the bridge creates is created MUTED, and audio is
 * raised only by an explicit recorded intent NAMING THE LAYER. Phase 6 of C-015 enumerated
 * the MUTE half at five sub-tasks and never enumerated the surface that records the intent —
 * so until this existed **every Live Source plate was permanently silent**.
 *
 * ── WHERE IT LIVES ─────────────────────────────────────────────────────────
 *
 * **ON THE ROW, beside the source swap** (owner, 2026-08-14): under pressure, on air, "which
 * source" and "how loud" are one decision made in one place. `RUNTIME-REDESIGN-01` Phase 6
 * added the second door the reference wires — a RIGHT-CLICK (or `ContextMenu` / `Shift+F10`)
 * on a seated plate in LIVE SOURCES opens this same dialog on the plate's OWNING ROW with that
 * plate's fader focused. Two doors, one dialog, one map.
 *
 * ── WHAT IT COMMITS ───────────────────────────────────────────────────────
 *
 * Each control commits on release, with no Apply. Every gesture goes through the MAP door
 * (`stack.set-plate-volumes`): SOLO is a CROSS-PLATE statement — _"this plate and NONE of its
 * siblings"_ — and a sequence of single-plate calls cannot make one. The bridge holds the row's
 * live-seat lock for the whole map, so a look switch cannot land in the middle of a SOLO.
 *
 * 🔴 **`ON = 100 % · OFF = 0 %`, and OFF-then-ON RETURNS TO 100 %, NOT TO THE PREVIOUS FADER
 * VALUE** — the footer says so in the reference's own words. Restoring the previous level
 * needs a SECOND store of intent beside the bridge's `#plateVolumes` (the `B-100` / `P-012`
 * class): only one of the two would survive a blip, and a plate would come back at a volume
 * nobody chose.
 *
 * 🔴 **SOLO is scoped to THIS ROW's plates — including the frames the active look HIDES — and
 * nothing outside it.** The set is every plate the template declares plus every plate the
 * ledger has seated for this row (a seated record is the bridge's own second way of accounting
 * for a plate), which is the union pre-seat and therefore includes the held frames.
 *
 * ── A12 — NO SECOND CLAIM ABOUT AIR ────────────────────────────────────────
 *
 * The state word under each fader is `plateAudioPill`'s — AUDIBLE, SILENT, HIDDEN BY THIS
 * LOOK — read from the LEDGER's `held`, and a plate with no seat reads NOT SEATED. This dialog
 * used to derive `audible = value > 0` locally and print _"audible on air"_ under a raised
 * plate, which on a READY row was a claim about air that nothing on the channel backed (and
 * a second copy of the one predicate, golden rule 6). The reference's `On air` badge in its
 * context line is NOT adopted for the same reason (`design.md` §12.8).
 *
 * ── THE MEASURED SHAPE (`08-live-audio.html`, Chromium, 1280 × 800) ─────────
 *
 * A subtitle naming the row under the title; a context line (`N frames · look`, and the hint
 * that changes apply on release); a three-column head (`Frame / source · Requested gain ·
 * Audio controls`); one 85 px row per plate — index chip, name and `Frame N · Layer c-l`;
 * a 28 px fader with its readout and state word; `ON · OFF · SOLO` at 58 × 36 — and a footer
 * carrying `ON = 100% · OFF = 0%` and SOLO's scope. The reference's MUTE-less verb row is
 * adopted: MUTE was OFF's twin, and two names for one write is the pair a reader has to
 * disambiguate under pressure. Numbers in `theme.ts` (`AUDIO_DIALOG_PX`).
 */

export interface LivePlateAudioDialogProps {
  item: StackItemState;
  template: TemplateInfo;
  /**
   * Golden rule 11 — the row named in the OPERATOR's words (`operatorRowName`), never composed
   * here. Its ids ride on the subtitle's `title`.
   */
  name: OperatorRowName;
  /**
   * The plates the bridge's ledger holds a seat for on this row, with the two facts audibility
   * needs and the coordinate each seat is on. Read off the SAME rows the LIVE SOURCES tab
   * renders (`rowPlateAudioOf`), so the words here and the words there are one evaluation.
   * Empty for a row that owns nothing — every declared plate then reads NOT SEATED.
   */
  seatedPlates?: readonly RowPlateAudio[] | undefined;
  /** The plate whose fader takes focus when the dialog opens — the one the operator pointed at. */
  focusPlateId?: string | undefined;
  /**
   * Apply a MAP of this row's plate volumes, in ONE call.
   *
   * ⚠ A MAP and not a plate/volume pair, because SOLO is a cross-plate statement. `refused`
   * names the plates that did not move — a partial application must be visible rather than
   * averaged into one boolean.
   */
  onApplyVolumes: (
    volumes: Record<string, number>,
  ) => Promise<{ ok: boolean; refused: readonly string[] }>;
  onClose: () => void;
}

/** One plate as the dialog lists it: declared or seated, with the facts the words need. */
interface DialogPlate {
  plateId: string;
  /** Position in the template's declaration, 1-based; seated-only plates count on after it. */
  index: number;
  seated: RowPlateAudio | undefined;
}

export function LivePlateAudioDialog({
  item,
  template,
  name,
  seatedPlates = [],
  focusPlateId,
  onApplyVolumes,
  onClose,
}: LivePlateAudioDialogProps): React.JSX.Element {
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * What the operator is dragging RIGHT NOW, before it is committed.
   *
   * Kept apart from `item.plateVolumes` deliberately: the published state is the bridge's
   * answer, and showing a slider position the bridge has not accepted would be the
   * optimistic-UI lie this project refuses everywhere else. On a refusal this is dropped and
   * the published value stands.
   */
  const [dragging, setDragging] = useState<Record<string, number>>({});

  const intents = item.plateVolumes ?? {};
  // `?? `, never `||`: a recorded intent of 0 is a REAL authored value ("muted by the
  // operator") and must not fall through to the default that happens to equal it.
  const shown = (plateId: string): number => dragging[plateId] ?? intents[plateId] ?? 0;

  /**
   * THE ROW'S PLATES: every plate the template DECLARES, then every plate the ledger has
   * SEATED for this row that the declaration does not name.
   *
   * Declared first, because this dialog can be opened on a row that is not on air, where
   * there is no ledger to read and arming the plates ahead of the take is the whole point.
   * Seated second, because a ledger record is the bridge's own second way of accounting for a
   * plate (a stranded or adopted seat has no declaration to match) and SOLO must reach it.
   * Deduplicated by plate id: a fill+key pair puts one `sourceId` on two ledger records.
   */
  const seatedById = new Map(seatedPlates.map((p) => [p.plateId, p]));
  const declared = template.liveSources?.sources.map((p) => p.sourceId) ?? [];
  const ids = [...new Set([...declared, ...seatedById.keys()])];
  const plates: DialogPlate[] = ids.map((plateId, i) => ({
    plateId,
    index: i + 1,
    seated: seatedById.get(plateId),
  }));
  const plateIds = plates.map((p) => p.plateId);

  /**
   * Apply a map and reconcile the optimistic state.
   *
   * ⚠ The optimistic value is dropped for EVERY plate the map named, not just the one a
   * pointer was on: SOLO writes N plates and any of them could have been mid-drag.
   */
  const commit = (volumes: Record<string, number>): void => {
    setRefusal(null);
    void onApplyVolumes(volumes).then((res) => {
      setDragging((d) => {
        const next = { ...d };
        for (const plateId of Object.keys(volumes)) delete next[plateId];
        return next;
      });
      if (!res.ok) {
        setRefusal(
          res.refused.length > 0
            ? `The change was refused for ${res.refused.join(', ')} — those plates are unchanged.`
            : 'The volume change was refused.',
        );
      }
    });
  };

  // The look whose name the context line carries — the ROW's recorded look, else the
  // template's default, through the one helper the picker reads.
  const looks = lookOptionsOf(template.liveSources);
  const activeLook =
    looks?.find((l) => l.id === item.activeLookId) ??
    looks?.find((l) => l.id === template.liveSources?.defaultLookId) ??
    null;
  // Focus lands on the plate the operator pointed at, else the first fader.
  const focusId = plateIds.includes(focusPlateId ?? '') ? focusPlateId : plateIds[0];

  return (
    <Modal
      title="Live plate audio"
      onClose={onClose}
      size="wide"
      {...(refusal !== null && { message: { role: 'refusal' as const, text: refusal } })}
      footer={
        <>
          {/*
            🔴 THE TWO SENTENCES AN OPERATOR MUST NOT HAVE TO DISCOVER UNDER PRESSURE — the
            reference's own footer words, kept beside the action they qualify.
          */}
          <span className="cg-audio-foot-info" data-audio-foot-info="">
            ON = 100% · OFF = 0% — ON is full volume, not a return to the previous fader level.
            <br />
            SOLO silences all other frames of this row, including hidden frames. There is no un-solo
            — raise the others again on their own faders.
          </span>
          <ModalAction actionRole="cancel" onClick={onClose}>
            Close
          </ModalAction>
        </>
      }
    >
      {/* Golden rule 11 — WHICH ROW this dialog is about, in the operator's words, ids on hover.
          `R-028`: the real layer number stays visible in the sentence. */}
      <p className="cg-audio-subtitle" data-audio-subtitle="" title={name.title}>
        <OperatorNames name={name} />
        {name.layer !== null && <span> · {name.layer}</span>}
      </p>
      <div className="cg-audio-context" data-audio-context="">
        <span>
          {String(plates.length)} {plates.length === 1 ? 'frame' : 'frames'}
          {activeLook !== null && (
            <>
              {' · '}
              <bdi>{activeLook.label}</bdi>
            </>
          )}
        </span>
        <span className="cg-audio-hint">Changes apply on release</span>
      </div>
      <p className="cg-audio-intro">
        Every live plate starts <strong>silent</strong> — a plate carries its guest’s live
        microphone, so nothing the bridge puts on a layer is audible until it is raised here. This
        is a per-plate setting for <strong>this row</strong>; it survives a source swap and a bridge
        restart, and it can be set before the take.
      </p>
      <div className="cg-audio-head" aria-hidden="true">
        <span>Frame / source</span>
        <span>Requested gain</span>
        <span>Audio controls</span>
      </div>
      {plates.map((plate) => {
        const value = shown(plate.plateId);
        const pill: PlateAudioPill =
          plate.seated === undefined
            ? UNSEATED_PILL
            : // The PUBLISHED intent, not the drag value: the word says what the bridge holds.
              plateAudioPill(intents[plate.plateId], plate.seated.held);
        const inputId = `vol-${item.itemId}-${plate.plateId}`;
        // `R-028` — the real coordinate stays visible in the sentence. Said as the coordinate
        // (`on 1-10`), never a hand-built `Layer N`, which is a ROW's name (`cg/bank-shape`).
        const seatLine =
          plate.seated?.coordinate !== undefined ? `on ${plate.seated.coordinate}` : 'not seated';
        return (
          <div
            key={plate.plateId}
            className={`cg-audio-row${plate.plateId === focusId ? ' cg-audio-row--focused' : ''}`}
            data-audio-plate={plate.plateId}
            data-plate-audio-state={pill.label}
          >
            <div className="cg-audio-source">
              <span className="cg-audio-index" aria-hidden="true">
                {String(plate.index)}
              </span>
              <div>
                <label htmlFor={inputId} className="cg-audio-name">
                  <bdi>{plate.plateId}</bdi>
                </label>
                <small className="cg-audio-seat">
                  Frame {String(plate.index)} · {seatLine}
                </small>
              </div>
            </div>
            <div className="cg-audio-slider">
              <input
                id={inputId}
                className="cg-field"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(value * 100)}
                aria-label={`Volume for ${plate.plateId}`}
                aria-valuetext={pct(value)}
                {...(plate.plateId === focusId ? { 'data-modal-autofocus': '' } : {})}
                onChange={(e) => {
                  const next = Number(e.target.value) / 100;
                  setDragging((d) => ({ ...d, [plate.plateId]: next }));
                }}
                // Committed on RELEASE, not on every drag frame: one AMCP command per
                // decision rather than one per pixel.
                onPointerUp={() => {
                  commit({ [plate.plateId]: shown(plate.plateId) });
                }}
                onKeyUp={() => {
                  commit({ [plate.plateId]: shown(plate.plateId) });
                }}
              />
              <output className="cg-audio-readout" htmlFor={inputId}>
                {pct(value)}
              </output>
              <small className="cg-audio-state" style={{ color: pill.tone }} title={pill.detail}>
                {pill.label}
              </small>
            </div>
            <span className="cg-audio-verbs">
              {/*
                ON and OFF as two named buttons rather than one toggle: a toggle has to be READ
                before it can be pressed, and under pressure that read is a guess. OFF always
                means silence whatever the plate was doing, which is the urgent direction.
              */}
              <Button
                variant="secondary"
                onClick={() => {
                  commit({ [plate.plateId]: 1 });
                }}
                title="ON = full volume (100%). It does not return to the previous fader level."
                aria-label={`Full volume for ${plate.plateId} (100%, not the previous level)`}
              >
                ON
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  commit({ [plate.plateId]: 0 });
                }}
                title="OFF = 0%. Silence this plate."
                aria-label={`Silence ${plate.plateId}`}
              >
                OFF
              </Button>
              <Button
                variant="caution"
                disabled={plateIds.length < 2}
                onClick={() => {
                  commit(soloMap(plateIds, plate.plateId));
                }}
                title={
                  plateIds.length < 2
                    ? 'This row has only one plate — there is nothing to solo against.'
                    : 'Set this plate to 100% and every other plate on this row to 0%, including ' +
                      'the frames the current look hides. There is no un-solo.'
                }
                aria-label={`Solo ${plate.plateId} — silences the other ${String(plateIds.length - 1)} plate(s) on this row, with no restore`}
              >
                SOLO
              </Button>
            </span>
          </div>
        );
      })}
    </Modal>
  );
}
