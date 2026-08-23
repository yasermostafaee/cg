import { useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Button } from '../../ui/Button.js';
// The ONE vocabulary, shared with the LIVE SOURCES strip and the row's summary — so the
// dialog's SOLO and the panel's SOLO cannot address different sets or round differently.
import { pct, soloMap } from './plateAudio.js';

/**
 * C-015 phase 6 (6.5f) — **RAISE (or mute) ONE PLATE's audio: the operator surface
 * for the explicit recorded intent the mute rule defers to.**
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
 *
 * The audio rule is that every producer the bridge creates is created MUTED, and
 * audio is raised only by an explicit recorded intent NAMING THE LAYER. Phase 6
 * enumerated the MUTE half at five sub-tasks and never enumerated the surface that
 * records the intent — so until this existed **every Live Source plate was
 * permanently silent**. The mechanism was built and tested a session earlier; this
 * is the half an operator can reach.
 *
 * ── WHERE IT LIVES, AND THE TWO PLACEMENTS THAT WERE REJECTED ─────────────
 *
 * **ON THE ROW, beside the source swap** (owner, 2026-08-14). Under pressure, on
 * air, "which source" and "how loud" are one decision made in one place — and 6.9c
 * already settled that the audio intent belongs to the PLATE rather than to the
 * producer instance, so a control expressing a plate-level property belongs where
 * the plate's other per-run property already is.
 *
 * Rejected, recorded so neither is re-proposed: **inside the swap dialog** (it
 * turns a two-second adjustment into opening the swap flow, and couples two
 * independent acts), and **the PLAYOUT tab** (further from the operator's flow than
 * the row they are already looking at).
 *
 * ⚠ **It is a DIALOG rather than an inline row control, and that is forced by the
 * row rather than chosen.** A row carries a VARIABLE number of plates while the
 * verb block is a fixed six-column grid whose sticky header prints the word above
 * each glyph (`layerTable.ts`); a conditional inline control would misalign every
 * header word from its button — which that file names as the DANGEROUS failure,
 * because this product's STOP and CLEAR are the inverse of the reference
 * product's. So the affordance sits beside SOURCE in the row's own action set,
 * which is as close to the row as a per-plate control can get.
 *
 * ── WHAT IT COMMITS ───────────────────────────────────────────────────────
 *
 * Each control commits on release, with no Apply: an Apply is another action, and
 * under pressure another action is one that does not happen. `0` is a REAL value —
 * "the operator muted this plate" — and is recorded, never treated as a reset.
 *
 * ── `add-multibox-audio` — WHAT CHANGED, AND WHAT DELIBERATELY DID NOT ────
 *
 * The dialog gains **ON / OFF** and **SOLO** beside the fader, and every gesture now goes
 * through the MAP door (`stack.set-plate-volumes`) rather than the single-plate one. That is
 * not a refactor for tidiness: SOLO is a CROSS-PLATE statement — _"this plate and NONE of its
 * siblings"_ — and a sequence of single-plate calls cannot make one. The bridge holds the
 * row's live-seat lock for the whole map, so a look switch cannot land in the middle of a
 * SOLO and leave two guests up.
 *
 * 🔴 **OFF-then-ON RETURNS TO 100 %, NOT TO THE PREVIOUS FADER VALUE**, and the dialog says so
 * in words. Restoring the previous level needs a SECOND store of intent beside the bridge's
 * `#plateVolumes`, answering the same question a second way — the `B-100` / `P-012` class,
 * whose specific failure here is that only one of the two stores is retained, so a plate comes
 * back from a bridge blip at a volume nobody chose.
 *
 * ⚠ **This dialog did NOT become the only surface, and it did not stop being useful.** The
 * always-visible strip lives in LIVE SOURCES, where every seated plate is already enumerated;
 * this is where ONE ROW's plates are adjusted against each other, which is the thing a list of
 * every plate on the channel is worse at.
 */

const styles = {
  intro: { margin: '0 0 0.9rem', fontSize: '0.8rem', lineHeight: 1.5, color: colors.textMuted },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(6rem, 1fr) auto minmax(8rem, 1.2fr) 3.5rem',
    gap: '0.6rem',
    alignItems: 'center',
    padding: '0.45rem 0',
  },
  /**
   * The verb row, on its own line UNDER the fader rather than as three more grid columns.
   *
   * A dialog is not the layer table and has no fixed-column contract to protect, but the same
   * arithmetic applies: three more columns would squeeze the fader — the control an operator
   * spends the most time in — to make room for buttons they press once.
   */
  verbs: {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: '0.4rem',
    padding: '0 0 0.35rem',
  },
  plate: { fontSize: '0.82rem', fontWeight: 600 },
  note: { display: 'block', fontSize: '0.7rem', fontWeight: 400, color: colors.textMuted },
  live: { color: colors.pending, fontSize: '0.7rem' },
  readout: {
    fontSize: '0.78rem',
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
  },
} as const;

export interface LivePlateAudioDialogProps {
  item: StackItemState;
  template: TemplateInfo;
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

export function LivePlateAudioDialog({
  item,
  template,
  onApplyVolumes,
  onClose,
}: LivePlateAudioDialogProps): React.JSX.Element {
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * What the operator is dragging RIGHT NOW, before it is committed.
   *
   * Kept apart from `item.plateVolumes` deliberately: the published state is the
   * bridge's answer, and showing a slider position the bridge has not accepted
   * would be the optimistic-UI lie this project refuses everywhere else. On a
   * refusal this is dropped and the published value stands.
   */
  const [dragging, setDragging] = useState<Record<string, number>>({});

  const plates = template.liveSources?.sources ?? [];
  const intents = item.plateVolumes ?? {};

  // `?? `, never `||`: a recorded intent of 0 is a REAL authored value ("muted by
  // the operator") and must not fall through to the default that happens to equal
  // it. Zero is falsy, and this repo has paid for that three times.
  const shown = (plateId: string): number => dragging[plateId] ?? intents[plateId] ?? 0;

  /**
   * Apply a map and reconcile the optimistic state.
   *
   * ⚠ The optimistic value is dropped for EVERY plate the map named, not just the one a
   * pointer was on: SOLO writes N plates and any of them could have been mid-drag.
   */
  const commit = (volumes: Record<string, number>): void => {
    setRefusal(null);
    void onApplyVolumes(volumes).then((res) => {
      // Dropped either way: on success the published state now carries it, and on failure it
      // never happened.
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

  /**
   * SOLO's scope: every plate this TEMPLATE declares.
   *
   * ⚠ Declared, and not the ledger's seated set — this dialog is the only audio surface that
   * can be opened on a row which is not on air, where there is no ledger to read and arming
   * the plates ahead of the take is the whole point. Every declared plate is one the bridge
   * accepts (it validates against this same declaration), and a `0` written to an unseated
   * plate is a recorded intent with nothing sent — exactly what the mute rule wants.
   */
  const declaredIds = plates.map((p) => p.sourceId);

  return (
    <Modal
      title="Live plate audio"
      onClose={onClose}
      size="wide"
      {...(refusal !== null && { message: { role: 'refusal' as const, text: refusal } })}
      footer={
        <ModalAction actionRole="cancel" onClick={onClose}>
          Close
        </ModalAction>
      }
    >
      <p style={styles.intro}>
        Every live plate starts <strong>silent</strong> — a plate carries its guest’s live
        microphone, so nothing the bridge puts on a layer is audible until it is raised here. This
        is a per-plate setting for <strong>this row</strong>, and it survives a source swap and a
        bridge restart. It can be set before the take.
        <br />
        {/*
          🔴 THE ONE SENTENCE AN OPERATOR MUST NOT HAVE TO DISCOVER UNDER PRESSURE.

          ON is full volume, not "back to where it was". Someone who assumes otherwise puts a
          guest back at 100 % having meant 40 %, on air, and there is nothing on screen that
          would have told them. Restoring the previous level would need a second store of
          intent beside the bridge's — the `B-100` / `P-012` class — and only one of the two
          would be retained across a blip, so the plate would come back at a volume nobody
          chose. The trade is deliberate; saying it here is the price of making it.
        */}
        <strong>ON is full volume (100 %)</strong> — it does not return a plate to its previous
        fader level. <strong>SOLO</strong> raises one plate and silences the others on this row, and
        there is no un-solo.
      </p>
      {plates.map((plate) => {
        const value = shown(plate.sourceId);
        const audible = value > 0;
        return (
          <div key={plate.sourceId} style={styles.row}>
            <label htmlFor={`vol-${item.itemId}-${plate.sourceId}`} style={styles.plate}>
              {plate.sourceId}
              <span style={styles.note}>
                {audible ? <span style={styles.live}>audible on air</span> : 'silent'}
              </span>
            </label>
            {/*
              A MUTE button beside the slider, not only a slider at zero. Muting is
              the urgent direction — an open microphone is the failure an operator
              has seconds to fix — and dragging a slider to exactly zero under
              pressure is a worse gesture than pressing one button.
            */}
            <Button
              variant="secondary"
              disabled={!audible}
              onClick={() => {
                commit({ [plate.sourceId]: 0 });
              }}
              aria-label={`Mute ${plate.sourceId}`}
            >
              MUTE
            </Button>
            <input
              id={`vol-${item.itemId}-${plate.sourceId}`}
              className="cg-field"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(value * 100)}
              aria-label={`Volume for ${plate.sourceId}`}
              onChange={(e) => {
                const next = Number(e.target.value) / 100;
                setDragging((d) => ({ ...d, [plate.sourceId]: next }));
              }}
              // Committed on RELEASE, not on every drag frame: one AMCP command per
              // decision rather than one per pixel.
              onPointerUp={() => {
                commit({ [plate.sourceId]: shown(plate.sourceId) });
              }}
              onKeyUp={() => {
                commit({ [plate.sourceId]: shown(plate.sourceId) });
              }}
            />
            <span style={styles.readout}>{pct(value)}</span>
            <span style={styles.verbs}>
              {/*
                ON and OFF as two named buttons rather than one toggle: a toggle has to be
                READ before it can be pressed, and under pressure that read is a guess. OFF
                always means silence whatever the plate was doing, which is the urgent
                direction. MUTE above stays — it is OFF's twin beside the fader, and removing
                a control an operator already reaches for to make room for a tidier set is not
                an improvement.
              */}
              <Button
                variant="secondary"
                onClick={() => {
                  commit({ [plate.sourceId]: 1 });
                }}
                title="ON = full volume (100%). It does not return to the previous fader level."
                aria-label={`Full volume for ${plate.sourceId} (100%, not the previous level)`}
              >
                ON
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  commit({ [plate.sourceId]: 0 });
                }}
                aria-label={`Silence ${plate.sourceId}`}
              >
                OFF
              </Button>
              <Button
                variant="caution"
                disabled={declaredIds.length < 2}
                onClick={() => {
                  commit(soloMap(declaredIds, plate.sourceId));
                }}
                title={
                  declaredIds.length < 2
                    ? 'This template has only one plate — there is nothing to solo against.'
                    : 'Raise this plate and silence every other plate on this row. There is no ' +
                      'un-solo — raise the others again on their own faders.'
                }
                aria-label={`Solo ${plate.sourceId} — silences the other ${String(declaredIds.length - 1)} plate(s) on this row, with no restore`}
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
