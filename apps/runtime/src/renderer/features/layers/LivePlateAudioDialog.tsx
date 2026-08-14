import { useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Button } from '../../ui/Button.js';

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
  plate: { fontSize: '0.82rem', fontWeight: 600 },
  note: { display: 'block', fontSize: '0.7rem', fontWeight: 400, color: colors.textMuted },
  live: { color: colors.pending, fontSize: '0.7rem' },
  readout: {
    fontSize: '0.78rem',
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
  },
} as const;

/** Percent, for the operator. The wire takes a 0–1 gain. */
const pct = (v: number): string => `${String(Math.round(v * 100))}%`;

export interface LivePlateAudioDialogProps {
  item: StackItemState;
  template: TemplateInfo;
  onSetVolume: (
    plateId: string,
    volume: number,
  ) => Promise<{ ok: boolean; reason?: string | undefined }>;
  onClose: () => void;
}

export function LivePlateAudioDialog({
  item,
  template,
  onSetVolume,
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

  const commit = (plateId: string, volume: number): void => {
    setRefusal(null);
    void onSetVolume(plateId, volume).then((res) => {
      // The optimistic value is dropped either way: on success the published state
      // now carries it, and on failure it never happened.
      setDragging((d) => {
        const { [plateId]: _drop, ...rest } = d;
        return rest;
      });
      if (!res.ok) {
        setRefusal(
          res.reason === 'disconnected'
            ? 'Not connected to CasparCG — the change was refused, not queued. Reissue it once the server is back.'
            : `The volume change was refused (${res.reason ?? 'unknown'}).`,
        );
      }
    });
  };

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
                commit(plate.sourceId, 0);
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
                commit(plate.sourceId, shown(plate.sourceId));
              }}
              onKeyUp={() => {
                commit(plate.sourceId, shown(plate.sourceId));
              }}
            />
            <span style={styles.readout}>{pct(value)}</span>
          </div>
        );
      })}
    </Modal>
  );
}
