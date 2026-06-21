import type { ExportIssue } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import {
  designerStore,
  scopeSceneToComposition,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import * as s from './CompositionActionBar.css.js';

interface Props {
  /** Validation issues for the open composition — exports block on error-severity. */
  issues: readonly ExportIssue[];
}

/**
 * D-086 Phase B — per-composition action footer pinned at the bottom of the left
 * rail. Holds Preview / Export .vcg / Export HTML for the OPEN composition. Every
 * action scopes to the active composition + its nested closure via Phase A's
 * `scopeSceneToComposition` (read live from the store). Living off the canvas keeps
 * the editing surface full-height. Preview just sets the store's `previewScene`; the
 * modal is RENDERED by the in-canvas `PreviewHost` (the preview iframe's live updates
 * only work inside the canvas subtree), and only that host re-renders on open — never
 * this bar or the editor. The playout-target selector is deferred to a real 2nd
 * target (C-001); the persisted `Composition.playoutTarget` field is its seam.
 *
 * The compact buttons carry an explicit `aria-label` (the canonical name) so their
 * accessible name stays stable while the visible label is a short icon + word.
 */
export function CompositionActionBar({ issues }: Props): JSX.Element {
  const { compName, hasComp } = useDesignerSelector((st) => {
    const comp =
      st.activeCompositionId === null
        ? undefined
        : st.scene?.compositions?.find((c) => c.id === st.activeCompositionId);
    return { compName: comp?.name ?? null, hasComp: comp !== undefined };
  }, shallowEqual);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const exportBlocked = !hasComp || errorCount > 0;

  /** The active composition scoped to its nested closure (Phase A), or null. */
  function scoped(): Scene | null {
    const st = designerStore.get();
    return scopeSceneToComposition(st.scene, st.activeCompositionId);
  }

  /** Open the Preview modal (rendered by the in-canvas PreviewHost off the store). */
  function openPreview(): void {
    const target = scoped();
    if (target !== null) designerStore.setPreviewScene(target);
  }

  async function exportVcg(): Promise<void> {
    const target = scoped();
    if (target === null) return;
    if (errorCount > 0) {
      window.alert(`Export blocked: ${String(errorCount)} validation error(s) in Issues panel.`);
      return;
    }
    await window.cg.export.runDisk({ scene: target });
  }

  async function exportHtml(): Promise<void> {
    const target = scoped();
    if (target === null) return;
    if (errorCount > 0) {
      window.alert(`Export blocked: ${String(errorCount)} validation error(s) in Issues panel.`);
      return;
    }
    const { warnings } = await window.cg.export.runSingleFileHtml({ scene: target });
    if (warnings.length > 0) designerStore.showNotice(warnings.join('\n'));
  }

  return (
    <div className={s.bar} aria-label="Composition actions" data-testid="composition-action-bar">
      {compName !== null && (
        <span className={s.label} title={compName}>
          {compName}
        </span>
      )}
      <div className={s.actions}>
        <Button
          size="sm"
          className={s.action}
          aria-label="Preview"
          disabled={!hasComp}
          onClick={openPreview}
          title="Preview this composition with live data (simulated CasparCG output)"
        >
          <span className={s.glyph} aria-hidden>
            ▷
          </span>
          Preview
        </Button>
        <Button
          size="sm"
          className={s.action}
          aria-label="Export .vcg"
          disabled={exportBlocked}
          onClick={() => void exportVcg()}
          title={
            errorCount > 0 ? 'Resolve validation errors first' : 'Export this composition to .vcg'
          }
        >
          {/* <span className={s.glyph} aria-hidden>
            ⤓
          </span> */}
          Export (.vcg)
        </Button>
        <Button
          size="sm"
          className={s.action}
          aria-label="Export HTML"
          disabled={exportBlocked}
          onClick={() => void exportHtml()}
          title={
            errorCount > 0
              ? 'Resolve validation errors first'
              : 'Download a single self-contained CasparCG .html for this composition'
          }
        >
          {/* <span className={s.glyph} aria-hidden>
            ⤓
          </span> */}
          HTML
        </Button>
      </div>
    </div>
  );
}
