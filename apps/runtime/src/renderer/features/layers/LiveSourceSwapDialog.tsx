import { useState, useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import {
  currentSourceAssignments,
  currentSourceCatalog,
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
 *   2. the template's ASSIGNMENT — the default for every row carrying it;
 *   3. THIS — one row's substitution, on top of both.
 *
 * 🔴 **It does not write back**, and the dialog says so in as many words. An
 * emergency substitution that silently became the permanent configuration would
 * change every other row carrying that template, and nobody would be told.
 */

const styles = {
  intro: { margin: '0 0 0.9rem', fontSize: '0.8rem', lineHeight: 1.5, color: colors.textMuted },
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
  onSwap,
  onClose,
}: LiveSourceSwapDialogProps): React.JSX.Element {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const [refusal, setRefusal] = useState<string | null>(null);
  const catalog = currentSourceCatalog();
  const assignments = currentSourceAssignments();
  const plates = template.liveSources?.sources ?? [];
  const override = item.sourceOverride ?? {};

  const assignedFor = (plateId: string): string | undefined =>
    assignments.assignments.find(
      (a) => a.templateId === template.templateId && a.plateId === plateId,
    )?.sourceId;
  const nameFor = (sourceId: string | undefined): string =>
    catalog.sources.find((s) => s.id === sourceId)?.name ?? '— none —';

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
      <p style={styles.intro}>
        This changes <strong>this row only</strong>, for this run. The template’s own assignment and
        the installation’s source list are left exactly as they are, so every other row carrying
        this template is unaffected — and the substitution never becomes the permanent
        configuration. Choose <em>Use template assignment</em> to put a plate back.
      </p>
      {plates.map((plate) => {
        const assigned = assignedFor(plate.sourceId);
        const swapped = override[plate.sourceId];
        return (
          <div key={plate.sourceId} style={styles.row}>
            <label htmlFor={`swap-${item.itemId}-${plate.sourceId}`} style={styles.plate}>
              {plate.sourceId}
              <span style={styles.assigned}>
                assigned: {nameFor(assigned)}
                {swapped !== undefined && (
                  <span style={styles.overridden}> · swapped for this row</span>
                )}
              </span>
            </label>
            <select
              id={`swap-${item.itemId}-${plate.sourceId}`}
              className="cg-field"
              value={swapped ?? ''}
              onChange={(e) => {
                change(plate.sourceId, e.target.value);
              }}
            >
              <option value="">Use template assignment ({nameFor(assigned)})</option>
              {catalog.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </Modal>
  );
}
