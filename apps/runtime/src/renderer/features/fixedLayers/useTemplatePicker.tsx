import { useCallback, useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Modal } from '../../ui/Modal.js';
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

  const pickTemplate = useCallback(async (title: string): Promise<TemplateInfo | null> => {
    const templates = await window.cg.templates.list();
    return new Promise<TemplateInfo | null>((resolve) => {
      resolver.current = resolve;
      setRequest({ title, templates });
    });
  }, []);

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
                <div key={t.templateId} style={styles.row}>
                  <Button
                    variant="secondary"
                    aria-label={`Load ${label} onto this layer`}
                    title={t.templateId}
                    onClick={() => settle(t)}
                  >
                    {label}
                  </Button>
                  <span style={styles.meta}>{t.templateType}</span>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    );

  return { pickTemplate, pickerDialog };
}
