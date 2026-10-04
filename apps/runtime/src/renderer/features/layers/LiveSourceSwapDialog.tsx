import { useState, useSyncExternalStore } from 'react';
import { assignedSourceId, plateLabel, type TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { ChoiceLabel, SourcePicker } from '../sources/SourcePicker.js';
import {
  currentSourceAssignments,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';

/**
 * R-048 / C-015 phase 6 (6.9 / 6.9e) — **repoint ONE plate of an ON-AIR row at a
 * different live source.**
 *
 * The case is a client requirement: a three-plate template is on air, one input
 * drops, that plate goes black, and the other two are fine. The operator patches
 * around it without taking the graphic off air.
 *
 * ── 6.9e — REACHABLE IN TWO ACTIONS, AND NOT ONE MORE ──────────────────────
 *
 * Open from the row (one), choose a source (two). It is used under pressure on
 * air, so it may not live in settings, behind a chain of dialogs, or anywhere the
 * operator has to FIND the item first — the row they are already looking at is the
 * row that is wrong. Each plate commits on change: there is no Apply step, because
 * an Apply is a third action and under pressure a third action is one that does not
 * happen.
 *
 * ── 6.9 — THE LAYERING IS STATED IN THE UI, not only in the design ─────────
 *
 * Three levels, and the operator has to be able to tell them apart to use this
 * safely:
 *
 *   1. the installation's CATALOG — what lives this station has;
 *   2. the template's ASSIGNMENT — the default for every row carrying it on this channel
 *      (`CHANNEL-SOURCES-01`: defaults belong to a channel);
 *   3. THIS — one row's substitution, on top of both.
 *
 * 🔴 **It does not write back.** An emergency substitution that silently became the permanent
 * configuration would change every other row carrying that template, and nobody would be told.
 * ~~…and the dialog says so in as many words.~~ 🔴 `CONSOLE-POLISH-01-A` (`B-306`): the four-line
 * paragraph that said so is GONE — an operator surface carries labels, values, state facts and
 * refusals only, and explanation lives in the docs. What the dialog states is the scope in its
 * title (`…for this row`), each plate's template assignment, and `swapped for this row` where one is.
 *
 * 🔴 `B-306` — **A PLATE IS `Plate N`, ITS ID ON THE `title`** (golden rule 11), as the Inspector's
 * Look inputs and the defaults dialog name it; `plate.sourceId` is the template author's word for a
 * hole in a layout. Every SOURCE it names goes through the one choice label (`ChoiceLabel`): the
 * Playout's name in its own direction, `none set`, `Not listed` with the id on its `title`,
 * `Unavailable`. What a swap SENDS is unchanged.
 */

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(6rem, 1fr) minmax(10rem, 1.4fr)',
    gap: '0.6rem',
    alignItems: 'center',
    padding: '0.4rem 0',
  },
  plate: { fontSize: '0.82rem', fontWeight: 600 },
  assigned: { display: 'block', fontSize: '0.7rem', fontWeight: 400, color: colors.textMuted },
  overridden: { color: colors.pending, fontSize: '0.7rem' },
} as const;

export interface LiveSourceSwapDialogProps {
  item: StackItemState;
  template: TemplateInfo;
  /**
   * `CHANNEL-SOURCES-01` — the channel of the row that opened it: the template's default a revert
   * returns to is that channel's own.
   */
  channel: number;
  /** `sourceId: null` reverts the plate to the template's assignment. */
  onSwap: (
    plateId: string,
    sourceId: string | null,
  ) => Promise<{ ok: boolean; message?: string | undefined }>;
  onClose: () => void;
}

export function LiveSourceSwapDialog({
  item,
  template,
  channel,
  onSwap,
  onClose,
}: LiveSourceSwapDialogProps): React.JSX.Element {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const [refusal, setRefusal] = useState<string | null>(null);
  const assignments = currentSourceAssignments();
  const plates = template.liveSources?.sources ?? [];
  const override = item.sourceOverride ?? {};

  const assignedFor = (plateId: string): string | undefined =>
    assignedSourceId(assignments, channel, template.templateId, plateId) ?? undefined;

  const change = (plateId: string, value: string): void => {
    setRefusal(null);
    // The empty option is REVERT, not "no source": it puts the plate back on the
    // template's assignment, which is the way out of an emergency patch.
    void onSwap(plateId, value === '' ? null : value).then((res) => {
      if (!res.ok) setRefusal(res.message ?? 'The swap was refused.');
    });
  };

  return (
    <Modal
      title="Live source for this row"
      onClose={onClose}
      size="wide"
      {...(refusal !== null && { message: { role: 'refusal' as const, text: refusal } })}
      footer={
        <ModalAction actionRole="cancel" onClick={onClose}>
          Close
        </ModalAction>
      }
    >
      {plates.map((plate, i) => {
        const assigned = assignedFor(plate.sourceId);
        const swapped = override[plate.sourceId];
        // The one numbering (`plateLabel`); the id stays on the label's `title`.
        const label = plateLabel(plates, plate.sourceId) ?? `Plate ${String(i + 1)}`;
        return (
          <div key={plate.sourceId} style={styles.row} data-swap-plate={plate.sourceId}>
            <label
              htmlFor={`swap-${item.itemId}-${plate.sourceId}`}
              style={styles.plate}
              title={plate.sourceId}
            >
              {label}
              <span style={styles.assigned} data-swap-assigned="">
                <ChoiceLabel
                  choice={{ value: '', label: 'Template assignment', names: assigned ?? null }}
                />
                {swapped !== undefined && (
                  <span style={styles.overridden}> · swapped for this row</span>
                )}
              </span>
            </label>
            {/*
              🔴 `PLAYOUT-SOURCES-01` §2.A — THE ONE PICKER. `R-048` 6.9e is kept to the letter:
              open the row's swap, then CHOOSE — opening the field and clicking an input is the one
              choose, exactly as the native select was, and it commits at once. No confirm step.
            */}
            <SourcePicker
              id={`swap-${item.itemId}-${plate.sourceId}`}
              // `B-309` — the picker's name is the plate's, in the operator's words — never its id.
              aria-label={`Live source for ${label}`}
              value={swapped ?? ''}
              onChange={(sourceId) => change(plate.sourceId, sourceId)}
              // `B-303` — the words and the name kept apart: the name in its own isolate and direction.
              choices={[{ value: '', label: 'Use template assignment', names: assigned ?? null }]}
              channel={item.slot?.channel}
            />
          </div>
        );
      })}
    </Modal>
  );
}
