import {
  outputTranslate,
  resolveDefaultPosition,
  resolveProjectOutputRaster,
  type Position,
  type Raster,
} from '@cg/shared-schema';
import { broadcastSafeAreas, type BroadcastGuideProfile } from '@cg/ui';
import { designerStore, editSceneOf } from '../../state/store.js';
import { designerGuideStore } from './broadcastGuideStore.js';

/** Visible broadcast edges in composition pixels; these never become editable ruler guides. */
export function safeAreaSnapTargets(input: {
  raster: Raster;
  resolution: Raster;
  position: Position;
  profile: BroadcastGuideProfile;
  visible: boolean;
}): { x: number[]; y: number[] } {
  if (!input.visible || !input.profile.standardVisible) return { x: [], y: [] };
  const origin = outputTranslate({ resolution: input.resolution }, input.position, input.raster);
  const areas = broadcastSafeAreas(
    input.raster.width,
    input.raster.height,
    input.profile.aspect,
    input.profile.customAspect,
  );
  return {
    x: [...new Set(areas.flatMap((area) => [area.x - origin.x, area.x + area.width - origin.x]))],
    y: [...new Set(areas.flatMap((area) => [area.y - origin.y, area.y + area.height - origin.y]))],
  };
}

/** Capture the same project/profile as the painted guide overlay when a gesture begins. */
export function currentSafeAreaSnapTargets(): { x: number[]; y: number[] } {
  const state = designerStore.get();
  const composition = editSceneOf(state.scene, state.activeCompositionId);
  if (state.scene === null || composition === null) return { x: [], y: [] };
  return safeAreaSnapTargets({
    raster: resolveProjectOutputRaster(state.scene),
    resolution: composition.resolution,
    position: resolveDefaultPosition(composition),
    profile: designerGuideStore.getSnapshot(),
    visible: state.safeAreasVisible,
  });
}
