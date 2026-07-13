import { useCallback, useEffect, useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { defaultNestedValues, type FieldValues, type Position } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { importTemplateFromBytes } from './templateDelivery.js';
import { templateDisplayName } from './templateName.js';
import { recordDefaultPosition } from '../stack/defaultPositionStore.js';
// B-038 Phase 3 — the bundled app @font-face CSS (Vazirmatn / Exo 2) as a raw
// string. Passed to the single-file export so the bundled faces inline as base64
// and the template HTML CasparCG loads renders Persian with the correct face.
import appFontsCss from '../../fonts.css?inline';

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
  itemName: { fontSize: '0.85rem', fontWeight: 600, overflowWrap: 'anywhere' as const },
  itemMeta: { fontSize: '0.75rem', color: colors.textMuted, overflowWrap: 'anywhere' as const },
  error: {
    color: '#fca5a5',
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

      let imported: {
        templateId: string;
        displayName: string;
        warnings: string[];
        defaultPosition?: Position;
      };
      try {
        // B-038 Phase 2 — produce the self-contained standalone HTML from the
        // unpacked `.vcg` and deliver it with the `TemplateInfo` over
        // `templates.import`. A package that fails verification / unpack / export
        // throws → nothing is registered (the R-001 invariant). Thrown messages
        // are pre-formatted (e.g. "failed verification: …"); the file name is
        // added here for the operator-facing error. The bundled fonts are inlined
        // (Phase 3) so the delivered HTML renders Persian with the correct face.
        imported = await importTemplateFromBytes(window.cg, bytes, { fontsCss: appFontsCss });
      } catch (err) {
        setError(`“${file.name}” ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      // R-011 — record the manifest default position (the one moment the app
      // holds the unpacked scene) so the Inspector's picker seeds from it.
      recordDefaultPosition(imported.templateId, imported.defaultPosition);

      await refresh();
      // R-004 — name the template the operator just imported, not its UUID.
      setStatus(
        imported.warnings.length > 0
          ? `Imported “${imported.displayName}” (${String(imported.warnings.length)} warning(s): ${imported.warnings.join('; ')}).`
          : `Imported “${imported.displayName}”.`,
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

  const loadOntoStack = useCallback((template: TemplateInfo): Promise<{ accepted: boolean }> => {
    // B-038 Phase 3 — seed the item's fields from the template's field-schema
    // defaults (not `{}`), so `CG ADD` carries real data on load. Operator edits
    // from the Inspector flow as subsequent `stack.update` values.
    // B-067 — seed the NESTED shape: a two-comp starter's fields live under the nested
    // instance's namespace, which is the address the template's binding reads at render.
    // `defaultNestedValues` is the same seeder the Designer's preview uses.
    const fields: FieldValues = defaultNestedValues({
      fields: template.fields,
      groups: template.groups ?? [],
    });
    return window.cg.stack.load({
      itemId: `item-${uuid()}`,
      templateId: template.templateId,
      fields,
    });
  }, []);

  return (
    <nav style={styles.panel} aria-label="Library">
      <h2 style={styles.heading}>LIBRARY</h2>
      <p style={styles.hint}>
        Upload a <code>.vcg</code> to verify and register it as an available template.
      </p>
      <Button
        variant="secondary"
        onClick={() => fileRef.current?.click()}
        aria-label="Import .vcg template"
      >
        Import .vcg
      </Button>
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
          templates.map((t) => {
            // R-004 — the operator reads the display name; the id stays discoverable on the
            // secondary line (and as a tooltip) so a row can still be correlated with a
            // stack item's `templateId` or a served `/template/<id>` URL. When the template
            // has no usable name the id IS the primary line — don't then repeat it below.
            const label = templateDisplayName(t);
            const idIsSecondary = label !== t.templateId;
            return (
              <div style={styles.item} key={t.templateId}>
                <div style={styles.itemBody}>
                  <span style={styles.itemName} title={t.templateId}>
                    {label}
                  </span>
                  <span style={styles.itemMeta}>
                    {idIsSecondary ? `${t.templateType} · ${t.templateId}` : t.templateType}
                  </span>
                </div>
                <AsyncButton
                  variant="secondary"
                  run={() => loadOntoStack(t)}
                  aria-label={`Load ${label}`}
                >
                  Load
                </AsyncButton>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
}
