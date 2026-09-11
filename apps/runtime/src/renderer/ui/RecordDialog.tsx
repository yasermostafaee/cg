import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import { Modal, ModalAction, type ModalMessage } from './Modal.js';

/**
 * `STATION-CHROME-01` §6 — **ONE WAY TO ADD ANYTHING.**
 *
 * Every Add and every Edit in Station setup opens THIS: a small second dialog over the
 * settings dialog, with the record's fields, a Cancel and one confirming action. Before
 * this there were three shapes — the delimiters' inline `Name / Splits on / Add` strip, the
 * sources' `New source name` field beside an Add, and the backup server's reveal-the-fields
 * toggle — and an operator had to learn each one.
 *
 * ── WHY A PRIMITIVE AND NOT THREE CAREFUL COPIES ────────────────────────────
 *
 * The three would drift, which is this repo's most-repeated defect (golden rule 6). More
 * specifically: a dialog-on-a-dialog has behaviour that is easy to get subtly wrong and
 * invisible when you do — which layer owns Escape, which trap owns Tab, where focus returns
 * to. That is settled once here (and, for the keyboard, once in `focusTrap.ts`'s layer
 * stack), rather than three times.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * It holds no draft and knows no field. The caller owns the record being edited and hands
 * over the fields as `children` plus a `submit` that either returns an error sentence — shown
 * in the dialog's own pinned region, never the parent's — or `null` to close. A primitive
 * that also knew about records would have to know about all three.
 */

/*
 * ⚠ `SETTINGS-MATCH-02` §8 — `styles` IS GONE, not merely unused. Its two entries were a
 * hand-set field gap and a hand-set lede rank; both are measured rules now (`.cg-sub-fields`,
 * `.cg-sub-lede`), because this frame has the reference's own head, body and footer and its
 * fields have to sit on the same rhythm as the ones in the pane behind it.
 */

export function RecordDialog({
  title,
  confirmLabel,
  lede,
  layer = 'sub',
  confirmDisabled = false,
  children,
  onCancel,
  onSubmit,
}: {
  /** Sentence case, like every dialog title: "Add live source", "Edit delimiter". */
  title: string;
  /** The confirming action's word — "Add source", "Save", "Add backup". */
  confirmLabel: string;
  /** One line above the fields, when the record needs one. */
  lede?: string | undefined;
  /**
   * Which modal layer this sits on. `sub` (the default) is the Add/Edit case — a dialog
   * opened FROM the settings dialog. `base` is for the few record forms opened from the
   * console itself, where there is nothing underneath: the lock's engage form.
   */
  layer?: 'base' | 'sub';
  /**
   * `SETTINGS-MATCH-02` §10.6 — the commit is dead while a field in this form is invalid.
   * The field says WHY, beside itself; this only stops the press.
   */
  confirmDisabled?: boolean;
  children: ReactNode;
  onCancel: () => void;
  /**
   * Commit. Return an operator sentence to REFUSE (shown here, in this dialog's own pinned
   * region), or `null` to accept and close.
   *
   * ⚠ The refusal stays in THIS dialog on purpose. It is about the field in front of the
   * operator, and putting it in the parent's region would be §2's defect one layer in — a
   * sentence about a form he can no longer see.
   */
  onSubmit: () => string | null;
}): JSX.Element {
  const [refusal, setRefusal] = useState<string | null>(null);
  const message: ModalMessage[] =
    refusal === null ? [] : [{ role: 'refusal' as const, text: refusal }];

  const submit = (): void => {
    setRefusal(onSubmit());
  };

  return (
    <Modal
      title={title}
      ariaLabel={title}
      layer={layer}
      /*
        `SETTINGS-MATCH-02` §8 — the reference's own `.sub-dialog` frame (480 wide, its own
        head, body and footer paddings, its own footer band). It was `prose`, which is the
        confirm dialog's 500-wide column and a near-miss of this one.
      */
      size="record"
      onClose={onCancel}
      {...(message.length > 0 ? { message } : {})}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={onCancel}>
            Cancel
          </ModalAction>
          {/* ⭐ §8 — ONE primary, and its label NAMES THE ACT: `Add to draft`, `Add source`,
              `Save delimiter`. Never `OK`, never a bare `Save` — the caller supplies the verb
              because only the caller knows what pressing it does. */}
          <ModalAction actionRole="primary" disabled={confirmDisabled} onClick={submit}>
            {confirmLabel}
          </ModalAction>
        </>
      }
    >
      {lede !== undefined && <p className="cg-sub-lede">{lede}</p>}
      {/*
        🔴 ENTER SUBMITS, AND `preventDefault` COMES FIRST — inherited deliberately from
        `usePrompt`, where it is a plant-reported regression rather than defensiveness.

        The sequence it stops: Enter closes the dialog, the focus trap's cleanup restores
        focus to the BUTTON that opened it, and the browser then runs Enter's default action
        — which on a focused button is a CLICK. The dialog re-opens, on top of whatever the
        submit has just done. It reproduces against a real bridge and NOT against the mock,
        because the mock resolves fast enough that the opening button has already been
        replaced; a race whose outcome depends on socket latency is exactly the kind that
        reaches the plant and never the suite.

        `keydown` on the field CONTAINER, so every field in every record dialog gets it from
        one place rather than each input remembering to.
      */}
      <div
        className="cg-sub-fields"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // A multi-line field is not a form to submit; nothing here uses one today, and
          // this is what stops the first one that does from losing its newlines.
          if (e.target instanceof HTMLTextAreaElement) return;
          e.preventDefault();
          submit();
        }}
      >
        {children}
      </div>
    </Modal>
  );
}

/**
 * One labelled field inside a `RecordDialog`. The label is always rendered — §5's point.
 *
 * ⭐ `SETTINGS-MATCH-02` §8 — it wears the SAME `.cg-setup-field` idiom as a field in the pane
 * behind it: a 13 px / 500 label over its control, its hint under. It was a 12 px muted label
 * with a 4 px gap, which made the small dialog read as a lighter-weight surface than the one
 * it is standing on rather than as the same product one step in.
 *
 * ⚠ `SETTINGS-MATCH-02` §10.6 — and it carries its own INLINE ERROR, for the same reason the
 * pane's field does: what is wrong with a control belongs beside that control, not in the
 * dialog's pinned region four fields away. The region keeps the refusal that answers "why did
 * the last action not happen?" — which, in this frame, is what `onSubmit` returns.
 */
export function DialogField({
  label,
  hint,
  error = null,
  id,
  children,
}: {
  label: string;
  hint?: ReactNode;
  /** The one sentence this field is currently wrong by, or `null`. */
  error?: string | null;
  /** Stable id root, so the control and its error can be bound together. */
  id?: string;
  children: ReactNode;
}): JSX.Element {
  const errorId = id === undefined ? undefined : `${id}-error`;
  return (
    <label className="cg-setup-field" {...(id !== undefined ? { 'data-sub-field': id } : {})}>
      <span className="cg-setup-field__label">{label}</span>
      {isValidElement(children) && error !== null
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            'aria-invalid': true,
            ...(errorId !== undefined ? { 'aria-describedby': errorId } : {}),
          })
        : children}
      {hint !== undefined && <span className="cg-setup-field__hint">{hint}</span>}
      {error !== null && (
        <span
          className="cg-setup-field__error"
          data-field-error=""
          {...(errorId !== undefined ? { id: errorId } : {})}
        >
          {error}
        </span>
      )}
    </label>
  );
}
