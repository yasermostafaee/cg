import { useEffect } from 'react';
import { designerStore } from '../state/store.js';
import {
  nonImageSeparators,
  separatorRepairNotice,
  withoutSeparators,
} from '../state/separator-repair.js';

/**
 * 🔴 `B-128` — when a project OPENS, drop every ticker separator that points at a font, a video or
 * an animation, and tell the author once (`state/separator-repair.ts` says why such a record is
 * never kept). Keyed on the opened scene's id, so it runs once per open and never on an edit.
 *
 * The asset store is already on the new project when the scene arrives: the platform switches it
 * (`assets.setActiveProject`) before it hands the scene to the renderer.
 */
export function useSeparatorRepairOnOpen(sceneId: string | null): void {
  useEffect(() => {
    if (sceneId === null) return;
    let cancelled = false;
    void (async () => {
      const [project, shared] = await Promise.all([
        window.cg.assets.list(),
        window.cg.sharedImages.list(),
      ]);
      const scene = designerStore.get().scene;
      if (cancelled || scene === null || scene.id !== sceneId) return;
      const found = nonImageSeparators(scene, {
        project: new Map(project.map((a) => [a.assetId, a.kind])),
        shared: new Set(shared.map((a) => a.assetId)),
      });
      if (found.length === 0) return;
      designerStore.applyOpenRepair(
        sceneId,
        withoutSeparators(scene, new Set(found.map((f) => f.tickerId))),
      );
      designerStore.showNotice(separatorRepairNotice(found));
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);
}
