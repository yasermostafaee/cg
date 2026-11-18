import { resolveProjectOutputRaster } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { PreviewModal } from '../fields/PreviewModal.js';

/**
 * D-086 Phase B — renders the Preview modal off the store's `previewScene`. It is
 * mounted INSIDE the canvas subtree (the preview iframe's live field/transport
 * updates only work there — mounting the modal in App/the rail breaks them), but it
 * SUBSCRIBES to the store itself, so opening/closing the preview re-renders ONLY this
 * tiny host — never CanvasArea or the rest of the editor. The trigger lives in the
 * left-rail action bar via `designerStore.setPreviewScene`.
 */
export function PreviewHost(): JSX.Element | null {
  const previewScene = useDesignerSelector((s) => s.previewScene);
  // Export-scoped preview scenes intentionally omit this project-only metadata.
  const outputRaster = useDesignerSelector((s) => resolveProjectOutputRaster(s.scene ?? {}));
  if (previewScene === null) return null;
  return (
    <PreviewModal
      scene={previewScene}
      outputRaster={outputRaster}
      onClose={() => designerStore.setPreviewScene(null)}
    />
  );
}
