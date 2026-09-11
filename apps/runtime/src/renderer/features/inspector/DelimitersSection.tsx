import { useState, useSyncExternalStore } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { STATION_SETUP_PX } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { DialogField, RecordDialog } from '../../ui/RecordDialog.js';
import { useConfirm } from '../../ui/useDialog.js';
import { parseDelimiter, splitContent } from './fromFileContent.js';
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
  /* `sample` is GONE: a delimiter's characters are a `.cg-delimiter-symbol` chip now — the
     mono face, a ground and an edge — rather than a bare mono span in a cell. */
  /*
   * ⚠ The split column was capped at `9rem`, which was right when it held a bare glyph and is
   * wrong now that it holds a chip AND the character's name: measured, `Persian comma` wrapped
   * to a second line and made that row 24 px taller than its neighbours. The reference gives
   * the pair roughly 38 / 48 of the table, with the actions column fixed — so the name column
   * is the one that is capped, and the value column takes what is left.
   */
  nameCol: { width: '38%' },
} as const;

/**
 * 🔴 `SETTINGS-MATCH-02` — **WHAT THIS CHARACTER IS, IN WORDS.**
 *
 * The table printed the glyph and stopped. At 14 px a Persian comma `،`, a Latin comma `,`
 * and a semicolon `;` are three very similar marks in a vertical list, and `\n` is an escape
 * rather than a mark at all — so an operator picking "the one that splits on commas" was
 * reading shapes. The reference names each one beside its chip; so does this.
 *
 * ⚠ It NAMES, it does not translate: an unrecognised character gets nothing rather than a
 * guess. A wrong name beside a real glyph is worse than the glyph alone.
 */
export function splitMeaning(value: string): string {
  switch (value) {
    case '\\n':
    case '\n':
      return 'Line break';
    case '\\t':
    case '\t':
      return 'Tab';
    case '|':
      return 'Pipe';
    case '،':
      return 'Persian comma';
    case ',':
      return 'Comma';
    case ';':
      return 'Semicolon';
    case '؛':
      return 'Persian semicolon';
    case '/':
      return 'Slash';
    case '-':
      return 'Hyphen';
    case ' ':
      return 'Space';
    default:
      return '';
  }
}

export function DelimitersSection({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  useSyncExternalStore(subscribeDelimiters, delimitersVersion);
  const delimiters = listDelimiters();
  /** §6 — is the one small second dialog open? One flag, because there is one dialog. */
  const [adding, setAdding] = useState(false);
  /** `SETTINGS-MATCH-02` §8d — the question asked before a delimiter is dropped. */
  const { confirm, confirmDialog } = useConfirm();

  const say = (refusal: string | null): void => {
    report(refusal === null ? null : { role: 'refusal', text: refusal });
  };

  /**
   * 🔴 `SETTINGS-MATCH-02` §8d/§8e — **THE ONE REMOVE IN THIS DIALOG THAT ASKED NOTHING.**
   *
   * Every other destructive act in Station setup is gated: a source's delete asks and names
   * its cascade (`B-237`), a row's template remove asks and names the layer (`R-028` 2.4).
   * This one dropped the record on a single press of a bin, with no question and no way back —
   * and §8e's rule is that the add/edit/remove family is ONE shape, which is not true while one
   * member of it skips the question the other two ask.
   *
   * ⚠ **The consequence line is the honest one, and it is NOT the source's.** Removing a
   * delimiter changes nothing that is already using it: `fromFileContent` stores the VALUE
   * rather than the id, so no field re-splits and nothing on air moves. What is lost is the
   * NAME in the picker — which is `B-242` exactly, and the sentence says so rather than
   * implying damage the act does not do.
   */
  const removeOne = async (id: string, label: string): Promise<void> => {
    const ok = await confirm({
      title: `Remove “${label}”?`,
      destructive: true,
      // §8 — raised from INSIDE Station setup: that family's frame, and its lighter scrim.
      layer: 'sub',
      body: (
        <>
          <p className="cg-confirm-copy">
            Remove <strong>{label}</strong> from the available delimiters?
          </p>
          <p className="cg-confirm-copy">
            Fields already using it keep their current separator — the character is stored with the
            field, not a reference to this record. It stops being offered in the picker.
          </p>
        </>
      ),
      confirmLabel: 'Remove delimiter',
      tone: 'remove',
    });
    if (!ok) return;
    say(await removeDelimiter(id));
  };

  return (
    <>
      {/*
        `SETTINGS-MATCH-02` — THE REFERENCE'S `.list-header`: the block's name with its COUNT
        beside it and its Add at the row's end, ABOVE the card rather than inside the card's
        head. The count is the fact the head was missing — `Delimiters 5` says how long the
        list is before the operator has scrolled it.
      */}
      <div className="cg-setup-list-head">
        <h3>
          Delimiters <span className="cg-setup-count">{String(delimiters.length)}</span>
        </h3>
        <Button variant="add" aria-label="Add delimiter" onClick={() => setAdding(true)}>
          <Icon icon={Plus} size={STATION_SETUP_PX.btnIcon} />
          Add delimiter
        </Button>
      </div>
      <section className="cg-card" aria-label="Delimiters">
        <div className="cg-table-scroll">
          <table className="cg-table cg-delimiter-table">
            <thead>
              <tr>
                <th scope="col" style={styles.nameCol}>
                  Name
                </th>
                {/*
                  ⭐ `Split character`, the reference's word, and it is more accurate than
                  `Splits on`: the cell holds ONE character (or one escape), and `Splits on`
                  read as the name of a rule rather than of a value.
                */}
                <th scope="col">Split character</th>
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
                    {/*
                      🔴 THE CHARACTER IN A MONO CHIP, AND ITS NAME IN WORDS BESIDE IT.
                      The app printed the bare glyph. At this size `،` and `,` are very nearly
                      the same mark, and `\n` is not a mark at all — so the chip makes the
                      value an object with edges, and `splitMeaning` says which one it is.
                    */}
                    <bdi className="cg-delimiter-symbol" dir="ltr">
                      {d.value}
                    </bdi>
                    <span className="cg-delimiter-meaning">{splitMeaning(d.value)}</span>
                  </td>
                  <td className="cg-table__actions">
                    {/* §3 — QUIET at rest, red on intent. It was a permanently
                        red-bordered bin on every row. */}
                    <Button
                      variant="quiet"
                      className="cg-list-remove"
                      aria-label={`Remove delimiter ${d.label}`}
                      title="Remove this delimiter — asks first"
                      onClick={() => void removeOne(d.id, d.label)}
                    >
                      <Icon icon={Trash2} size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/*
        The note and the reset, on one row under the list — the reference's `.delimiter-bottom`.
        🔴 §3's argument for the reset being QUIET rather than `danger` is unchanged and is why
        it is a link here: it restores the SHIPPED set, loses no file and takes nothing off air.
      */}
      <div className="cg-setup-list-bottom">
        <p>Removing a delimiter does not change any field already using it.</p>
        {/*
          ⚠ A `ghost` with the reset's own class, NOT a raw `<button>`: every control in the
          renderer comes from the shared primitive (the lint rule enforces it, and the states
          come with it). `ghost`'s own warning — "neutral is not invisible" — is answered here
          rather than ignored: the UNDERLINE is the affordance, and the class adds a hover and
          a focus ring on top of it.
        */}
        <Button
          variant="ghost"
          className="cg-setup-reset"
          aria-label="Reset delimiters to defaults"
          title="Puts the shipped delimiters back"
          onClick={() => void resetDelimiters().then(say)}
        >
          Reset to defaults
        </Button>
      </div>

      {adding && <AddDelimiterDialog onClose={() => setAdding(false)} onReport={say} />}
      {/* §8d — the question, portalled above this dialog like every other second-level one. */}
      {confirmDialog}
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
      <DialogField label="Name" id="delimiter-name" focusFirst>
        <input
          className="cg-field"
          type="text"
          dir="auto"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="New delimiter name"
          placeholder="e.g. tab"
        />
      </DialogField>
      <DialogField
        label="Split on"
        id="delimiter-value"
        hint={
          <>
            Use <code className="cg-code-chip">\n</code> for a new line or{' '}
            <code className="cg-code-chip">\t</code> for a tab. Other characters are matched
            exactly.
          </>
        }
      >
        <input
          className="cg-field cg-field--mono"
          type="text"
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="New delimiter character"
          placeholder="e.g. \t"
        />
      </DialogField>
      <SplitPreview value={value} />
    </RecordDialog>
  );
}

/**
 * 🔴 `SETTINGS-MATCH-02` §8c — **WHAT THIS SPLIT CHARACTER ACTUALLY DOES, BEFORE IT IS SAVED.**
 *
 * ── WHY A PREVIEW IS THE RIGHT CONTROL HERE ─────────────────────────────────
 *
 * The value is one or two characters and the consequence is a LIST. `\n` and `\t` are escapes
 * rather than marks; `،` and `,` are two glyphs that look alike at this size; and an operator
 * who gets it wrong finds out later, in a field, with a file already loaded. Showing the
 * sample text and the chips it splits into closes that gap where the decision is made.
 *
 * ⭐ **It is the answer to `B-242`, which is filed and was not going to be closed by its own
 * description.** That defect reads "a removed delimiter's attached field falls back to showing
 * its raw characters (`\n (in use)`) instead of the name it had" — and the behaviour underneath
 * it is correct (the VALUE is stored, not the id, so nothing re-splits). What is actually lost
 * is the human label, and the reason that hurts is that a raw split character means nothing to
 * read. This is where that meaning is supplied.
 *
 * ⚠ It splits with the SAME function the product splits with (`splitContent`), never a local
 * `String.split` — a preview that agreed with nothing would be worse than none.
 */
export function SplitPreview({ value }: { value: string }): JSX.Element {
  /*
    🔴 THE SAMPLE IS BUILT FROM THE OPERATOR'S OWN CHARACTER, and that is what makes the three
    states legible rather than one state and two accidents:

      · empty     → the three parts joined by a SPACE, and one chip reading all of it — which
                    is exactly what an empty delimiter does: it cannot split (`splitContent`),
                    so the whole text is one entry;
      · `***`     → `Item 1***Item 2***Item 3`, three chips;
      · `\n`      → the same three on three LINES, three chips.

    A fixed sample could only ever demonstrate one delimiter, and would show an operator typing
    `***` a text with no `***` in it and one chip — which reads as "this character does not
    work" rather than "this sample does not contain it".

    ⚠ Split with the product's OWN pair — `parseDelimiter` resolves the escapes, `splitContent`
    does the split — never a local `String.split`. A preview that agreed with nothing would be
    worse than no preview.
  */
  const resolved = parseDelimiter(value);
  const sample = SPLIT_PARTS.join(resolved === '' ? ' ' : resolved);
  const items = splitContent(sample, resolved);
  return (
    <div className="cg-preview" data-split-preview="">
      <span className="cg-preview__eyebrow">Preview</span>
      <p className="cg-preview__sample" data-split-sample="">
        {sample}
      </p>
      <div className="cg-preview__items" data-split-items="">
        {items.map((item, i) => (
          <span className="cg-preview__item" key={`${item}:${String(i)}`}>
            <bdi>{item}</bdi>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The parts the preview joins and splits again. Latin and short on purpose: the sample has to
 * make the SHAPE of the split legible at a glance, and a Persian one would put the operator's
 * attention on the words rather than on where the breaks fall.
 */
const SPLIT_PARTS = ['Item 1', 'Item 2', 'Item 3'] as const;

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
