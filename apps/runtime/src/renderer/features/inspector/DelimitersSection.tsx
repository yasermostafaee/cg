import { useState, useSyncExternalStore } from 'react';
import { Settings2, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { DialogField, RecordDialog } from '../../ui/RecordDialog.js';
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
 * its legend, and the footer's Apply servers neither covers it nor gates it. The gear
 * beside the picker still opens it, as a deep link into this section, so it is still found
 * where the need is discovered.
 *
 * The refusal goes to the dialog's pinned region through `report` (`runtime-modal-message-
 * region`); "Reset to defaults" is a body control here, because this section's footer is a
 * quiet Close — it commits as you go and has nothing to apply.
 *
 * ── ⭐ `STATION-CHROME-01` §6 — THE INLINE ADD STRIP IS GONE ─────────────────
 *
 * It used to add through a `Name / Splits on / Add` strip below the list, which was a THIRD
 * way of adding a record in one dialog: the sources had a name field beside an Add, the
 * backup server had a reveal-the-fields toggle, and this had a two-field strip. Every Add —
 * and every Edit — now opens the same small second dialog (`RecordDialog`), so the operator
 * learns one shape and it is the shape he already knows from the others.
 */

const styles = {
  /** A delimiter's own characters, monospaced — `\n` and `،` must be told apart on sight. */
  sample: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.78rem',
    whiteSpace: 'pre' as const,
  },
  splitsOn: { width: '9rem' },
} as const;

export function DelimitersSection({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  useSyncExternalStore(subscribeDelimiters, delimitersVersion);
  const delimiters = listDelimiters();
  /** §6 — is the one small second dialog open? One flag, because there is one dialog. */
  const [adding, setAdding] = useState(false);

  const say = (refusal: string | null): void => {
    report(refusal === null ? null : { role: 'refusal', text: refusal });
  };

  return (
    <>
      {/* `STATION-CHROME-02` §3 — ONE card rhythm, and the block's own Add in its head. */}
      <section className="cg-card" aria-label="Delimiters">
        <div className="cg-card__head">
          <span className="cg-card__title">Delimiters</span>
          <span className="cg-card__spacer" />
          {/*
            🔴 §3 — SECONDARY, not `danger`, and this is a correction of a stated argument
            rather than a preference. The old note called it destructive "because it
            discards every delimiter the operator added". It restores the SHIPPED SET: no
            file is lost, no graphic leaves air, and the list is rebuildable in the dialog
            it is standing in. Red is reserved for danger on this console, and a red button
            that is not dangerous is a red button the operator learns to ignore.
          */}
          <Button
            variant="neutral"
            aria-label="Reset delimiters to defaults"
            title="Puts the shipped delimiters back"
            onClick={() => void resetDelimiters().then(say)}
          >
            Reset to defaults
          </Button>
          <Button variant="add" aria-label="Add delimiter" onClick={() => setAdding(true)}>
            Add delimiter
          </Button>
        </div>
        <div className="cg-card__body cg-card__body--table">
          <div className="cg-table-scroll">
            <table className="cg-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" style={styles.splitsOn}>
                    Splits on
                  </th>
                  <th scope="col" className="cg-table__actions">
                    <span className="cg-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {delimiters.map((d) => (
                  <tr key={d.id} data-delimiter-id={d.id}>
                    {/* Every operator string in its own `<bdi>`: a delimiter may be named in
                        Persian and split on a Latin character, and the two must not decide
                        each other's placement (golden rule 11). */}
                    <td>
                      <bdi>{d.label}</bdi>
                    </td>
                    <td>
                      <bdi style={styles.sample}>{d.value}</bdi>
                    </td>
                    <td className="cg-table__actions">
                      {/* §3 — QUIET at rest, red on intent. It was a permanently
                          red-bordered bin on every row. */}
                      <Button
                        variant="quiet"
                        className="cg-list-remove"
                        aria-label={`Remove delimiter ${d.label}`}
                        title="Remove this delimiter"
                        onClick={() => void removeDelimiter(d.id).then(say)}
                      >
                        <Icon icon={Trash2} size={15} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="cg-card__note">
          Removing a delimiter does not change any field already using it.
        </p>
      </section>

      {adding && <AddDelimiterDialog onClose={() => setAdding(false)} onReport={say} />}
    </>
  );
}

/**
 * §6 — ADD ONE DELIMITER, in the same small second dialog every other Add uses.
 *
 * The draft lives HERE and reaches the store only on the confirming press. `addDelimiter`
 * already returns an operator sentence or `null`, which is exactly `RecordDialog`'s submit
 * contract — so the refusal lands in THIS dialog's own region, in front of the field it is
 * about, rather than in the parent's behind a form the operator can no longer see.
 *
 * ⚠ The submit is SYNCHRONOUS by contract and `addDelimiter` is not, so the dialog closes
 * optimistically and a refusal is reported to the SECTION. That is the honest trade for this
 * store: it is browser-local with a bridge write behind it, the refusals it returns are
 * about the TEXT (empty name, duplicate) and are re-checked before anything is stored, and
 * an operator who has just been told "give it a name" needs the field back, not a closed
 * dialog. The section's region says so either way.
 */
function AddDelimiterDialog({
  onClose,
  onReport,
}: {
  onClose: () => void;
  onReport: (refusal: string | null) => void;
}): JSX.Element {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  return (
    <RecordDialog
      title="Add delimiter"
      confirmLabel="Add delimiter"
      onCancel={onClose}
      onSubmit={() => {
        if (label.trim() === '')
          return 'Give the delimiter a name — that is what the picker shows.';
        if (value === '') return 'Say what it splits on — a character, or \\n for a new line.';
        void addDelimiter(label, value).then(onReport);
        onClose();
        return null;
      }}
    >
      <DialogField label="Name">
        <input
          className="cg-field"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="New delimiter name"
          placeholder="tab"
        />
      </DialogField>
      <DialogField
        label="Splits on"
        hint="Type \\n for a new line and \\t for a tab — everything else splits on exactly the characters you type."
      >
        <input
          className="cg-field"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="New delimiter character"
          placeholder="\\t"
        />
      </DialogField>
    </RecordDialog>
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
