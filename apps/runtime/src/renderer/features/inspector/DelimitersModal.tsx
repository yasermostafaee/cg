import { useState, useSyncExternalStore } from 'react';
import { Settings2, Trash2 } from 'lucide-react';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import {
  addDelimiter,
  delimitersVersion,
  listDelimiters,
  removeDelimiter,
  resetDelimiters,
  subscribeDelimiters,
} from './delimiterStore.js';

/**
 * R-034 — manage the delimiter list the field picker offers.
 *
 * Deliberately its OWN modal, opened from beside the picker rather than as a
 * section of the server-settings panel. Two reasons: this is a statement about
 * the operator's source FILES, not about the playout server, and the server
 * panel's Apply is gated while anything is on air — a gate that is right for a
 * host change and wrong for choosing what a comma means. Opening it from beside
 * the control also puts it where the operator discovers the need.
 */

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    marginBottom: '0.6rem',
  },
  row: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  label: { flex: 1, minWidth: 0, overflowWrap: 'anywhere' as const },
  sample: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: colors.textMuted,
    whiteSpace: 'pre' as const,
  },
  addRow: { display: 'flex', gap: '0.4rem', alignItems: 'flex-end', flexWrap: 'wrap' as const },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem' },
  fieldLabel: { fontSize: '0.72rem', color: colors.textMuted },
  hint: { fontSize: '0.72rem', color: colors.textMuted, margin: '0.5rem 0 0' },
} as const;

export function DelimitersModal({ onClose }: { onClose: () => void }): JSX.Element {
  useSyncExternalStore(subscribeDelimiters, delimitersVersion);
  const delimiters = listDelimiters();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    const refusal = await addDelimiter(label, value);
    setError(refusal);
    if (refusal !== null) return;
    setLabel('');
    setValue('');
  };

  return (
    <Modal
      title="Text file delimiters"
      onClose={onClose}
      /*
        §3 — THE REFUSAL MOVES OUT OF THE BODY.

        It was the LAST CHILD of the dialog's content: `<p style={styles.error}
        role="alert">` after the delimiter list, the add row and the hint. Two
        defects in one line, and this dialog had both — the placement the primitive
        exists to prevent (inside the scroll container, so a long delimiter list
        puts the reason for a refusal below the fold) and a local `colors.error`,
        which measures 2.13:1 on this surface.

        The dialog was ON the primitive and went around its message region, which
        is the drift worth naming: adopting a primitive's CHROME while re-deciding
        one of its contracts leaves a surface that reads consistent and is not.
      */
      {...(error !== null ? { message: { role: 'refusal' as const, text: error } } : {})}
      footer={
        <>
          {/*
            §2 — `destructive`, because it is: it discards every delimiter the
            operator added. It was a `ghost`, which is the treatment that reads as
            static text rather than a control — the wrong signal for the one button
            here that throws work away.
          */}
          <ModalAction
            actionRole="destructive"
            onClick={() => void resetDelimiters().then(setError)}
          >
            Reset to defaults
          </ModalAction>
          {/* The action this dialog exists to end on, in the same corner as every
              other dialog's primary. */}
          <ModalAction actionRole="primary" onClick={onClose}>
            Done
          </ModalAction>
        </>
      }
    >
      <div style={styles.list}>
        {delimiters.map((d) => (
          <div key={d.id} style={styles.row}>
            <span style={styles.label}>{d.label}</span>
            <span style={styles.sample}>{d.value}</span>
            <Button
              variant="danger"
              aria-label={`Remove delimiter ${d.label}`}
              onClick={() => void removeDelimiter(d.id).then(setError)}
            >
              <Icon icon={Trash2} />
            </Button>
          </div>
        ))}
      </div>

      <div style={styles.addRow}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Name</span>
          <input
            className="cg-field"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="New delimiter name"
            placeholder="tab"
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Splits on</span>
          <input
            className="cg-field"
            style={{ width: '6rem' }}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="New delimiter character"
            placeholder="\t"
          />
        </label>
        <Button variant="secondary" onClick={() => void add()}>
          Add
        </Button>
      </div>

      <p style={styles.hint}>
        Type <code>\n</code> for a new line and <code>\t</code> for a tab — everything else splits
        on exactly the characters you type. Removing a delimiter does not change any field already
        using it.
      </p>
      {/* The refusal is NOT rendered here any more — see the `message` prop above. */}
    </Modal>
  );
}

/** The gear that opens {@link DelimitersModal}, for use beside the picker. */
export function ManageDelimitersButton({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <Button
      variant="ghost"
      aria-label="Manage delimiters"
      title="Add or remove delimiters"
      onClick={onOpen}
    >
      <Icon icon={Settings2} />
    </Button>
  );
}
