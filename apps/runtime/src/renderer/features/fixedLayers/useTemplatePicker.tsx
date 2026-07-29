import { useCallback, useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Modal } from '../../ui/Modal.js';
import { useConfirm } from '../../ui/useDialog.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import { templateDisplayName } from '../library/templateName.js';

/**
 * R-021 stage 3 — the Load-from-library picker, shaped like `useConfirm`: a
 * promise-returning `pickTemplate()` plus the dialog element to render. That
 * shape is what lets the whole Load-from-library variant be ONE `RowAction`
 * whose `run` resolves when the operator has chosen — so the button and its
 * context-menu twin share the affordance by construction, instead of the menu
 * needing its own copy of "open a picker, then load".
 *
 * The list is pulled at OPEN time rather than subscribed: the library is
 * browser-local (B-085) and the dialog is short-lived, so a snapshot taken when
 * it opens is exactly what the operator is choosing from. An empty library says
 * so and offers only Cancel — never a dialog that looks broken.
 *
 * A dismissal (Cancel / Escape / backdrop, all of which route through the
 * Modal's safe path) resolves `null`, which the caller reports as the
 * operator's own "no": no success flash, no error toast.
 *
 * R-028 part B — this dialog is now the ONLY template list in the product (the
 * Library panel was deleted), so R-005's REMOVE lives here too. It is a
 * re-homing of a shipped capability, not a new one: without it, deleting the
 * panel would have silently taken away the operator's only way to remove a
 * template. The bridge stays authoritative for the refusal
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

export function useTemplatePicker(): {
  pickTemplate: (title: string) => Promise<TemplateInfo | null>;
  pickerDialog: JSX.Element | null;
} {
  const [request, setRequest] = useState<PickRequest | null>(null);
  const resolver = useRef<((template: TemplateInfo | null) => void) | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const pickTemplate = useCallback(async (title: string): Promise<TemplateInfo | null> => {
    const templates = await window.cg.templates.list();
    return new Promise<TemplateInfo | null>((resolve) => {
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
        body: `“${label}” is removed from the library for every browser. This cannot be undone — the .vcg must be re-imported.`,
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

  const settle = useCallback((template: TemplateInfo | null): void => {
    setRequest(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(template);
  }, []);

  const pickerDialog =
    request === null ? null : (
      <Modal
        title={request.title}
        onClose={() => settle(null)}
        footer={
          <Button variant="ghost" onClick={() => settle(null)}>
            Cancel
          </Button>
        }
      >
        {request.templates.length === 0 ? (
          <p style={styles.empty}>
            The library is empty — import a <code>.vcg</code> first.
          </p>
        ) : (
          <div style={styles.list}>
            {/* Newest first, the Library panel's own order: the template the
                operator most recently imported is the one they are looking for. */}
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
