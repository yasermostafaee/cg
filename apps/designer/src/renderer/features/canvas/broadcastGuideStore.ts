import { useSyncExternalStore } from 'react';
import { createBroadcastGuideStore, type BroadcastGuideProfile } from '@cg/ui';

/** App preference, not project data. Missing/invalid v1 data uses defaults; no old key exists. */
export const DESIGNER_GUIDES_STORAGE_KEY = 'cg.designer.safe-guides.v1';
export const designerGuideStore = createBroadcastGuideStore(DESIGNER_GUIDES_STORAGE_KEY);

export function useDesignerBroadcastGuides(): BroadcastGuideProfile {
  return useSyncExternalStore(
    designerGuideStore.subscribe,
    designerGuideStore.getSnapshot,
    designerGuideStore.getSnapshot,
  );
}
