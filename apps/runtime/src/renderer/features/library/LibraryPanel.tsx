import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { defaultNestedValues, type FieldValues, type Position } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { useConfirm } from '../../ui/useDialog.js';
import { importTemplateFromBytes } from './templateDelivery.js';
import { templateDisplayName } from './templateName.js';
import { recordDefaultPosition } from '../stack/defaultPositionStore.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
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
    // Clip, so the template list below is what scrolls — never the page.
    minHeight: 0,
    overflow: 'hidden',
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
  // B-083 — the name gets the row's FULL width; the actions sit under it.
  //
  // This was a `1fr auto` grid with the name in the `1fr`. The `auto` track is sized to the
  // max-content of two `white-space: nowrap` buttons (`.cg-btn`) — Load + Remove — which
  // measured 134.75px of a 214px row. The name's track got the 53.25px that were left, and
  // `overflow-wrap: anywhere` (below) let it shrink to a ONE-CHARACTER min-content, so a
  // name wrapped one letter per line, 3–5 lines tall. The buttons are rigid, so the `1fr`
  // could never win width back: no rule INSIDE that structure can fix it — the row has to
  // reflow. Stacking is the fix that costs nothing elsewhere (the alternative, widening the
  // 240px Library column, steals width from the canvas and stack).
  item: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'stretch',
    gap: '0.4rem',
    padding: '0.4rem 0.5rem',
    background: colors.panelMuted,
    borderRadius: '0.2rem',
    border: `1px solid ${colors.border}`,
  },
  itemBody: { display: 'flex', flexDirection: 'column' as const, gap: '0.1rem', minWidth: 0 },
  itemActions: {
    display: 'flex',
    gap: '0.3rem',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // `break-word`, deliberately NOT `anywhere`: both break a token too long for the line, but
  // `anywhere` also lowers the element's intrinsic MIN-CONTENT to a single glyph — which is
  // what let a squeezed container collapse the name to one letter per line instead of
  // holding its width. `break-word` keeps min-content at the longest word, so the name wraps
  // at word boundaries and a pathological unbroken token still can't overflow the panel.
  itemName: { fontSize: '0.85rem', fontWeight: 600, overflowWrap: 'break-word' as const },
  itemMeta: { fontSize: '0.75rem', color: colors.textMuted, overflowWrap: 'break-word' as const },
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
  const { confirm, confirmDialog } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  // Newest first — the template the operator just imported is at the top, where they are
  // already looking, rather than below every bundled starter. RENDER-SIDE ONLY: the registry
  // still lists in insertion order and the wire is untouched.
  const ordered = useMemo(() => [...templates].reverse(), [templates]);

  const refresh = useCallback(async (): Promise<void> => {
    setTemplates(await window.cg.templates.list());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch (err) {
        reportCommandError(
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
        // R-004 — `file.name` is the label the operator recognises, and this is the only
        // place it exists (the bytes cannot carry it). It was already being read here for
        // the error message and thrown away on the success path.
        imported = await importTemplateFromBytes(window.cg, bytes, {
          fontsCss: appFontsCss,
          sourceFileName: file.name,
        });
      } catch (err) {
        reportCommandError(`“${file.name}” ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      // R-011 — record the manifest default position (the one moment the app
      // holds the unpacked scene) so the Inspector's picker seeds from it.
      recordDefaultPosition(imported.templateId, imported.defaultPosition);

      await refresh();
      // R-004 — name the template the operator just imported, not its UUID.
      reportCommandSuccess(
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

  /**
   * R-005 — remove a template. Confirm-gated (destructive and not undoable: the operator
   * must re-import the `.vcg`), mirroring the StackPanel Remove-All gate.
   *
   * The BRIDGE decides whether this is allowed — it refuses while any stack item still
   * references the template, because a removal there would silently poison the row (the
   * graphic stays on air, but its next out→take could never resolve the template again).
   * The panel surfaces the bridge's message verbatim rather than pre-judging the outcome.
   */
  const removeTemplate = useCallback(
    async (template: TemplateInfo): Promise<void> => {
      const label = templateDisplayName(template);
      const ok = await confirm({
        title: 'Remove this template?',
        body: `“${label}” will be removed from the library. This cannot be undone — the .vcg must be re-imported.`,
        confirmLabel: 'Remove',
      });
      if (!ok) return;

      const result = await window.cg.templates.remove({ templateId: template.templateId });
      if (!result.ok) {
        reportCommandError(result.message ?? `Could not remove “${label}”.`);
        return;
      }
      await refresh();
      reportCommandSuccess(`Removed “${label}”.`);
    },
    [confirm, refresh],
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
      <div style={styles.list}>
        {templates.length === 0 ? (
          <p style={styles.hint}>No templates yet. Import a .vcg to get started.</p>
        ) : (
          ordered.map((t) => {
            // R-004 — the operator reads the label (the imported file name, else the
            // manifest name). The raw id is NOT shown: a UUID is not information an
            // operator can act on, and printing it beside every row was noise. It stays
            // reachable as the row's tooltip, which is where a correlation key belongs —
            // enough to match a row against a served `/template/<id>` URL when debugging.
            const label = templateDisplayName(t);
            return (
              <div
                style={styles.item}
                key={t.templateId}
                // R-004 — the row's stable anchor stays the ID, never the display name:
                // names are not unique (two templates may legitimately share one), so
                // anything that must address ONE row keys on the id.
                data-testid={`library-template-${t.templateId}`}
              >
                <div style={styles.itemBody}>
                  <span style={styles.itemName} title={t.templateId}>
                    {label}
                  </span>
                  <span style={styles.itemMeta}>{t.templateType}</span>
                </div>
                <div style={styles.itemActions}>
                  <AsyncButton
                    variant="secondary"
                    run={() => loadOntoStack(t)}
                    aria-label={`Load ${label}`}
                    // A Load refusal (e.g. the bridge is down — Load stays bridge-owned and
                    // refused, B-085) surfaces as the command TOAST, not pinned inline where
                    // its wrapped text bloated this narrow row.
                    onError={reportCommandError}
                  >
                    Load
                  </AsyncButton>
                  <Button
                    variant="danger"
                    aria-label={`Remove ${label}`}
                    title="Remove this template from the library"
                    onClick={() => void removeTemplate(t)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {confirmDialog}
    </nav>
  );
}
