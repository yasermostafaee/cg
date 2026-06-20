import { useState } from 'react';
import type { ExportIssue } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import {
  designerStore,
  scopeSceneToComposition,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { PreviewModal } from '../fields/PreviewModal.js';
import * as s from './CompositionActionBar.css.js';

interface Props {
  /** Validation issues for the open composition — exports block on error-severity. */
  issues: readonly ExportIssue[];
}

/**
 * D-086 Phase B — per-composition sticky bar above the canvas. Holds Preview /
 * Export .vcg / Export HTML for the OPEN composition. The handlers reuse Phase A's
 * `scopeSceneToComposition` (read live from the store, like the old top-bar handlers
 * did), so each action exports/previews exactly the active composition + its nested
 * closure. The playout-target selector is deferred to a real 2nd target (C-001); the
 * persisted `Composition.playoutTarget` field already exists as its seam.
 */
export function CompositionActionBar({ issues }: Props): JSX.Element {
  const { compName, hasComp } = useDesignerSelector((st) => {
    const comp =
      st.activeCompositionId === null
        ? undefined
        : st.scene?.compositions?.find((c) => c.id === st.activeCompositionId);
    return { compName: comp?.name ?? null, hasComp: comp !== undefined };
  }, shallowEqual);

  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const exportBlocked = !hasComp || errorCount > 0;

  /** The active composition scoped to its nested closure (Phase A), or null. */
  function scoped(): Scene | null {
    const st = designerStore.get();
    return scopeSceneToComposition(st.scene, st.activeCompositionId);
  }

  function openPreview(): void {
    const target = scoped();
    if (target !== null) setPreviewScene(target);
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
      <span className={s.grow} />
      <Button
        size="sm"
        disabled={!hasComp}
        onClick={openPreview}
        title="Preview this composition with live data (simulated CasparCG output)"
      >
        Preview
      </Button>
      <Button
        size="sm"
        disabled={exportBlocked}
        onClick={() => void exportVcg()}
        title={
          errorCount > 0 ? 'Resolve validation errors first' : 'Export this composition to .vcg'
        }
      >
        Export .vcg
      </Button>
      <Button
        size="sm"
        disabled={exportBlocked}
        onClick={() => void exportHtml()}
        title={
          errorCount > 0
            ? 'Resolve validation errors first'
            : 'Download a single self-contained CasparCG .html for this composition'
        }
      >
        Export HTML
      </Button>
      {previewScene !== null && (
        <PreviewModal scene={previewScene} onClose={() => setPreviewScene(null)} />
      )}
    </div>
  );
}
