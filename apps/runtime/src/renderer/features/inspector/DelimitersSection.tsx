import { useState, useSyncExternalStore } from 'react';
import { Settings2, Trash2 } from 'lucide-react';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
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
 * ── A SECTION OF STATION SETUP NOW, NOT ITS OWN MODAL (`STATION-SETUP-02`) ──
 *
 * This was deliberately its own dialog, for two reasons that are both still true and are
 * both honoured differently now: (1) it is a statement about the operator's source FILES,
 * not about the playout server — so it is its own SECTION with its own heading, not a row
 * under Servers; (2) the server panel's Apply is gated while anything is on air, which is
 * wrong for choosing what a comma means — so this section COMMITS AS YOU GO and says so in
 * its legend, and the footer's APPLY SERVERS neither covers it nor gates it. The gear
 * beside the picker still opens it, as a deep link into this section, so it is still found
 * where the need is discovered.
 *
 * The refusal goes to the dialog's pinned region through `report` (`runtime-modal-message-
 * region`); "Reset to defaults" is a body control here, because there is no footer of this
 * section's own to carry a destructive action.
 */

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
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
  hint: { fontSize: '0.72rem', color: colors.textMuted, margin: 0 },
} as const;

export function DelimitersSection({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  useSyncExternalStore(subscribeDelimiters, delimitersVersion);
  const delimiters = listDelimiters();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  const say = (refusal: string | null): void => {
    report(refusal === null ? null : { role: 'refusal', text: refusal });
  };

  const add = async (): Promise<void> => {
    const refusal = await addDelimiter(label, value);
    say(refusal);
    if (refusal !== null) return;
    setLabel('');
    setValue('');
  };

  return (
    <>
      <div style={styles.list}>
        {delimiters.map((d) => (
          <div key={d.id} style={styles.row}>
            <span style={styles.label}>{d.label}</span>
            <span style={styles.sample}>{d.value}</span>
            <Button
              variant="danger"
              aria-label={`Remove delimiter ${d.label}`}
              onClick={() => void removeDelimiter(d.id).then(say)}
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
        <Button variant="add" onClick={() => void add()}>
          Add
        </Button>
        {/*
          `danger`, because it is: it discards every delimiter the operator added. The
          in-body destructive vocabulary is the trash icon's `danger`; the footer's solid
          amber belongs to `ModalAction`, and this control is not in a footer.
        */}
        <Button
          variant="danger"
          aria-label="Reset delimiters to defaults"
          onClick={() => void resetDelimiters().then(say)}
        >
          Reset to defaults
        </Button>
      </div>

      <p style={styles.hint}>
        Type <code>\n</code> for a new line and <code>\t</code> for a tab — everything else splits
        on exactly the characters you type. Removing a delimiter does not change any field already
        using it.
      </p>
    </>
  );
}

/** The gear beside the picker — opens Station setup at this section. */
export function ManageDelimitersButton({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <Button
      variant="ghost"
      aria-label="Manage delimiters"
      title="Add or remove delimiters (Station setup)"
      onClick={onOpen}
    >
      <Icon icon={Settings2} />
    </Button>
  );
}
