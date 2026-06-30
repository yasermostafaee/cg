import { useCallback, useEffect, useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { uuid } from '../../lib/uuid.js';
import { importTemplateFromBytes } from './templateDelivery.js';

const styles = {
  panel: {
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    minHeight: 0,
  },
  heading: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  hint: { fontSize: '0.8rem', color: colors.textMuted, lineHeight: 1.4, margin: 0 },
  importButton: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.4rem 0.75rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    overflowY: 'auto' as const,
    minHeight: 0,
  },
  item: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.4rem 0.5rem',
    background: colors.panelMuted,
    borderRadius: '0.2rem',
    border: `1px solid ${colors.border}`,
  },
  itemBody: { display: 'flex', flexDirection: 'column' as const, gap: '0.1rem', minWidth: 0 },
  itemId: { fontSize: '0.85rem', fontWeight: 600, overflowWrap: 'anywhere' as const },
  itemType: { fontSize: '0.75rem', color: colors.textMuted },
  loadButton: {
    background: colors.panel,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.3rem 0.6rem',
    borderRadius: '0.2rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  error: {
    color: '#fda4af',
    fontSize: '0.78rem',
    margin: 0,
    lineHeight: 1.4,
  },
  status: { color: colors.textMuted, fontSize: '0.78rem', margin: 0 },
} as const;

/**
 * Runtime template library (R-001). Replaces the Electron-era "drop a `.vcg`
 * into the watched folder" copy with a real upload affordance: pick a `.vcg`,
 * verify it with `@cg/vcg-format.verify` in the browser (the format is
 * isomorphic — no Node APIs reach the renderer), unpack to derive the field
 * schema, register it via `templates.import`, then list it with a "Load" action
 * that puts it on the stack. A package that fails verification shows a clear
 * error and registers nothing.
 */
export function LibraryPanel(): JSX.Element {
  const [templates, setTemplates] = useState<readonly TemplateInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setTemplates(await window.cg.templates.list());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      setError(null);
      setStatus(null);
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch (err) {
        setError(
          `Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      let imported: { templateId: string; warnings: string[] };
      try {
        // B-038 Phase 2 — produce the self-contained standalone HTML from the
        // unpacked `.vcg` and deliver it with the `TemplateInfo` over
        // `templates.import`. A package that fails verification / unpack / export
        // throws → nothing is registered (the R-001 invariant). Thrown messages
        // are pre-formatted (e.g. "failed verification: …"); the file name is
        // added here for the operator-facing error.
        imported = await importTemplateFromBytes(window.cg, bytes);
      } catch (err) {
        setError(`“${file.name}” ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      await refresh();
      setStatus(
        imported.warnings.length > 0
          ? `Imported “${imported.templateId}” (${String(imported.warnings.length)} warning(s): ${imported.warnings.join('; ')}).`
          : `Imported “${imported.templateId}”.`,
      );
    },
    [refresh],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      // Reset so re-picking the same file fires `change` again.
      e.target.value = '';
      if (file) void importFile(file);
    },
    [importFile],
  );

  const loadOntoStack = useCallback((template: TemplateInfo): void => {
    void window.cg.stack.load({
      itemId: `item-${uuid()}`,
      templateId: template.templateId,
      fields: {},
    });
  }, []);

  return (
    <nav style={styles.panel} aria-label="Library">
      <h2 style={styles.heading}>LIBRARY</h2>
      <p style={styles.hint}>
        Upload a <code>.vcg</code> to verify and register it as an available template.
      </p>
      <button
        type="button"
        style={styles.importButton}
        onClick={() => fileRef.current?.click()}
        aria-label="Import .vcg template"
      >
        Import .vcg
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".vcg"
        onChange={onPick}
        style={{ display: 'none' }}
        aria-label="Import .vcg template file"
      />
      {error !== null && (
        <p style={styles.error} role="alert">
          {error}
        </p>
      )}
      {status !== null && <p style={styles.status}>{status}</p>}
      <div style={styles.list}>
        {templates.length === 0 ? (
          <p style={styles.hint}>No templates yet. Import a .vcg to get started.</p>
        ) : (
          templates.map((t) => (
            <div style={styles.item} key={t.templateId}>
              <div style={styles.itemBody}>
                <span style={styles.itemId}>{t.templateId}</span>
                <span style={styles.itemType}>{t.templateType}</span>
              </div>
              <button
                type="button"
                style={styles.loadButton}
                onClick={() => loadOntoStack(t)}
                aria-label={`Load ${t.templateId}`}
              >
                Load
              </button>
            </div>
          ))
        )}
      </div>
    </nav>
  );
}
