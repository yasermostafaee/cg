import { useCallback, useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { useConfirm } from '../../ui/useDialog.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import { templateDisplayName } from '../library/templateName.js';

/**
 * R-021 stage 3 — the template picker, shaped like `useConfirm`: a
 * promise-returning `pickTemplate()` plus the dialog element to render. That
 * shape is what lets the whole choose-then-load flow be ONE `RowAction` whose
 * `run` resolves when the operator has chosen — so the button and its
 * context-menu twin share the affordance by construction, instead of the menu
 * needing its own copy of "open a picker, then load".
 *
 * ── §6 — IT IS WHAT A ROW'S `LOAD` OPENS NOW ────────────────────────────────
 *
 * It used to be reachable only through a context-menu entry called LOAD FROM
 * LIBRARY, while `LOAD` went straight to a file chooser. The Library no longer
 * exists as a surface — R-028 folded it into the stack — so a control naming it
 * pointed at nothing the operator could see, and the menu entry went.
 *
 * DELETING THE ENTRY WITHOUT MOVING THE PICKER WOULD HAVE DELETED THREE
 * CAPABILITIES, which is why the picker moved rather than followed: re-using an
 * already-imported template, R-005's remove-a-template (this is the only list it
 * has), and simply SEEING what this browser holds. The entry was one entry point,
 * not the picker's reason to exist.
 *
 * So `LOAD` opens this, and IMPORT IS AN OPTION INSIDE IT rather than the whole of
 * it. That is the part that cannot be dropped: on a fresh install the list is
 * empty, and a picker whose only advice is "import a .vcg first" while being the
 * one thing standing between the operator and importing would be a dead end.
 * `pickTemplate` therefore has THREE outcomes, not two — a template, `'import'`,
 * or a dismissal — and the caller owns the file chain exactly as before.
 *
 * The list is pulled at OPEN time rather than subscribed: it is browser-local
 * (B-085) and the dialog is short-lived, so a snapshot taken when it opens is
 * exactly what the operator is choosing from.
 *
 * A dismissal (Cancel / Escape / backdrop, all of which route through the
 * Modal's safe path) resolves `null`, which the caller reports as the
 * operator's own "no": no success flash, no error toast.
 *
 * R-028 part B — this dialog is the ONLY template list in the product, so
 * R-005's REMOVE lives here too. The bridge stays authoritative for the refusal
 * (refuse-while-referenced) and the wording is surfaced verbatim.
 */

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    maxHeight: '40vh',
    overflowY: 'auto' as const,
  },
  row: { display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch' },
  rowActions: { display: 'flex', gap: '0.35rem', alignItems: 'center' },
  meta: { fontSize: '0.75rem', color: colors.textMuted },
  empty: { fontSize: '0.85rem', color: colors.textMuted, margin: 0 },
} as const;

interface PickRequest {
  title: string;
  templates: readonly TemplateInfo[];
}

/**
 * What the operator chose.
 *
 * `'import'` is a real answer, not an error path: "none of these — I want to bring
 * in a new `.vcg`". It is returned rather than handled here because the import
 * chain needs the ROW's hidden file input and its exact slot, both of which belong
 * to the caller (see `LayerRow`).
 */
export type TemplateChoice = TemplateInfo | 'import' | null;

export function useTemplatePicker(): {
  pickTemplate: (title: string) => Promise<TemplateChoice>;
  pickerDialog: JSX.Element | null;
} {
  const [request, setRequest] = useState<PickRequest | null>(null);
  const resolver = useRef<((choice: TemplateChoice) => void) | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const pickTemplate = useCallback(async (title: string): Promise<TemplateChoice> => {
    const templates = await window.cg.templates.list();
    return new Promise<TemplateChoice>((resolve) => {
      resolver.current = resolve;
      setRequest({ title, templates });
    });
  }, []);

  /**
   * R-005, re-homed. The BRIDGE decides whether a removal is allowed (it
   * refuses while any row still references the template) and supplies the
   * operator-facing reason; this only asks, then re-lists.
   */
  const removeTemplate = useCallback(
    async (template: TemplateInfo): Promise<void> => {
      const label = templateDisplayName(template);
      const ok = await confirm({
        title: 'Remove this template?',
        // §6 — the word "library" named a panel that no longer exists. What is
        // true, and what the operator needs to know, is the SCOPE: this is not a
        // local tidy-up, it removes the template everywhere.
        body: `“${label}” is removed for every browser. This cannot be undone — the .vcg must be re-imported.`,
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      try {
        const res = await window.cg.templates.remove({ templateId: template.templateId });
        if (!res.ok) {
          reportCommandError(res.message ?? 'The template could not be removed.');
          return;
        }
        reportCommandSuccess(`Removed “${label}”.`);
        const templates = await window.cg.templates.list();
        setRequest((current) => (current === null ? null : { ...current, templates }));
      } catch (err) {
        reportCommandError(err instanceof Error ? err.message : 'Remove failed.');
      }
    },
    [confirm],
  );

  const settle = useCallback((choice: TemplateChoice): void => {
    setRequest(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(choice);
  }, []);

  const pickerDialog =
    request === null ? null : (
      <Modal
        title={request.title}
        onClose={() => settle(null)}
        footer={
          <>
            {/*
              CANCEL FIRST IN DOM ORDER, like every other dialog. The row is
              right-aligned, so first-in-DOM is LEFTMOST and the primary action
              lands in the same corner it does everywhere else.

              It was last, and it was a `ghost` — no fill, no border, muted text,
              which reads as a line of static text rather than a control. `cancel`
              resolves to `neutral`: neutral must not mean invisible.
            */}
            <ModalAction actionRole="cancel" onClick={() => settle(null)}>
              Cancel
            </ModalAction>
            {/*
              §6 — IMPORT LIVES IN HERE, and it is not a convenience.

              `LOAD` opens this dialog, so if importing were not offered inside it
              the operator on a fresh install would meet an empty list telling him
              to import a `.vcg` with no way to do so. On a station with nothing
              loaded yet it is the only control that can do anything, which is
              exactly what makes it this dialog's PRIMARY — it now carries that
              weight through its role rather than through being placed first.
            */}
            <ModalAction actionRole="primary" onClick={() => settle('import')}>
              Import a .vcg…
            </ModalAction>
          </>
        }
      >
        {request.templates.length === 0 ? (
          <p style={styles.empty}>
            No templates in this browser yet — <strong>Import a .vcg…</strong> to bring one in.
          </p>
        ) : (
          <div style={styles.list}>
            {/* Newest first: the template the operator most recently imported is
                the one they are looking for. */}
            {[...request.templates].reverse().map((t) => {
              const label = templateDisplayName(t);
              return (
                <div key={t.templateId} style={styles.row} data-template-id={t.templateId}>
                  <div style={styles.rowActions}>
                    <Button
                      variant="secondary"
                      aria-label={`Load ${label} onto this layer`}
                      title={t.templateId}
                      onClick={() => settle(t)}
                    >
                      {label}
                    </Button>
                    <Button
                      variant="danger"
                      aria-label={`Remove ${label}`}
                      onClick={() => void removeTemplate(t)}
                    >
                      Remove
                    </Button>
                  </div>
                  <span style={styles.meta}>{t.templateType}</span>
                </div>
              );
            })}
          </div>
        )}
        {confirmDialog}
      </Modal>
    );

  return { pickTemplate, pickerDialog };
}
