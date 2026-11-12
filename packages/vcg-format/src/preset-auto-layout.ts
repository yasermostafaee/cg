import { resolveOperatorAutoLayout, type Scene } from '@cg/shared-schema';

/**
 * A package with preset permissions must never expose the legacy global grant to an
 * older importer. Keep inherited settings by resolving them on each preset before
 * removing that grant. The author's project keeps its original settings.
 */
export function materializePresetAutoLayout(scene: Scene): Scene {
  const { lookGroups, allowOperatorAutoLayout, ...root } = scene;
  if (
    lookGroups?.some(({ looks }) =>
      looks.some((look) => look.allowOperatorAutoLayout !== undefined),
    ) !== true
  ) {
    return scene;
  }
  return {
    ...root,
    lookGroups: lookGroups.map((group) => ({
      ...group,
      looks: group.looks.map((look) => ({
        ...look,
        allowOperatorAutoLayout: resolveOperatorAutoLayout(look, allowOperatorAutoLayout),
      })),
    })),
  };
}
