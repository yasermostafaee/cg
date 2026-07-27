import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { ContextMenu } from '../../ui/ContextMenu.js';
import { useContextMenu } from '../../ui/useContextMenu.js';
import { runRowAction } from '../../ui/rowAction.js';
import { useConfirm } from '../../ui/useDialog.js';
import { importSuccessMessage, importVcgFile } from './importVcgFile.js';
import { onLibraryChanged } from './libraryChanged.js';
import { newItemFields, newItemId } from './newItemFields.js';
import { templateDisplayName } from './templateName.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';

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
  // One menu for the whole list, carrying the template it was opened on — the panel owns the
  // state so a right-click on one row cannot leave another row's menu open.
  const { menu, open: openMenu, close: closeMenu } = useContextMenu<TemplateInfo>();
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
    // R-021 stage 3 — the Library is no longer the only door into the library:
    // a fixed row's one-action chain imports into this same shared store. The
    // panel re-lists on ANY import, so "it stays there for reuse" is something
    // the operator can actually see.
    return onLibraryChanged(() => void refresh());
  }, [refresh]);

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      // R-021 stage 3 — the verify → unpack → export → register → record-side-facts
      // sequence lives in `importVcgFile`, shared VERBATIM with the fixed row's
      // one-action import+load chain. It throws the operator-facing message
      // (naming the file) and registers nothing on a bad package (R-001).
      let imported;
      try {
        imported = await importVcgFile(file);
      } catch (err) {
        reportCommandError(err instanceof Error ? err.message : String(err));
        return;
      }

      await refresh();
      // R-004 — name the template the operator just imported, not its UUID.
      reportCommandSuccess(importSuccessMessage(imported));
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
    // R-021 stage 3 — the item seed (`newItemFields`, carrying B-038 Phase 3's
    // schema defaults in B-067's nested shape) is declared once and shared with
    // the fixed row's exact-slot load. The DIFFERENCE between the two paths is
    // only which channel resolves the layer: this one ALLOCATES dynamically.
    return window.cg.stack.load({
      itemId: newItemId(),
      templateId: template.templateId,
      fields: newItemFields(template),
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
                // Right-click mirrors this row's two buttons. B-085 — neither is link-gated:
                // the library is browser-local, so Remove works offline, and Load stays
                // bridge-owned and refuses with a toast rather than being pre-disabled.
                onContextMenu={(e) => openMenu(e, t)}
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
      {/* The row's buttons, as a menu. Each item calls the SAME handler its button calls —
          `loadOntoStack` and `removeTemplate` — so there is no second path to either action.
          Load's refusal routes to the command toast exactly as the button's does; Remove
          keeps its confirm gate, because the gate lives inside `removeTemplate`, not on the
          button. Neither is disabled here, mirroring the buttons. */}
      {menu !== null && (
        <ContextMenu
          items={[
            {
              label: 'Load',
              onSelect: () =>
                runRowAction({
                  key: 'load',
                  label: 'Load',
                  variant: 'secondary',
                  disabled: false,
                  run: () => loadOntoStack(menu.target),
                  onError: reportCommandError,
                }),
            },
            {
              label: 'Remove',
              variant: 'danger',
              title: 'Remove this template from the library',
              onSelect: () => void removeTemplate(menu.target),
            },
          ]}
          x={menu.x}
          y={menu.y}
          ariaLabel={`${templateDisplayName(menu.target)} actions`}
          onClose={closeMenu}
        />
      )}
      {confirmDialog}
    </nav>
  );
}
