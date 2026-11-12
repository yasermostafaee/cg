import {
  activeRangeOf,
  flattenElements,
  lookContaining,
  lookGroupOf,
  thumbnailSequenceContent,
  type Composition,
  type Scene,
} from '@cg/shared-schema';
import { applyAnimationAtFrame } from './animation-applier.js';
import { applyArrangementToNodes } from './arrangement-view.js';
import { applyScopedFieldValues } from './bindings.js';
import { buildScene, buildSequenceImageItem } from './scene-builder.js';
import type { FieldScope } from './types.js';

export function vcgThumbnailFrame(
  scene: Pick<Scene, 'frameRange' | 'activeRange' | 'lifecycle'>,
): number {
  const range = activeRangeOf(scene);
  const outro = scene.lifecycle?.outPoint;
  const last = outro !== undefined && outro < range.out ? Math.max(range.in, outro - 1) : range.out;
  return scene.lifecycle?.contentStart ?? Math.floor((range.in + last) / 2);
}

function showThumbnailPreset(scene: Scene, elementMap: ReadonlyMap<string, HTMLElement>): void {
  const group = lookGroupOf(scene);
  if (group === undefined || group.looks.length === 0) return;
  const counts = new Map(group.looks.map(({ id }) => [id, 0]));
  for (const { element, ancestry } of flattenElements(scene)) {
    if (element.type !== 'video-placeholder' || !element.visible) continue;
    const look = lookContaining(
      group,
      ancestry.map(({ id }) => id),
    );
    if (
      look === undefined ||
      ancestry.some(({ id, visible }) => !visible && id !== look.instanceId)
    )
      continue;
    counts.set(look.id, (counts.get(look.id) ?? 0) + 1);
  }
  const chosen = group.looks.reduce((best, look) =>
    (counts.get(look.id) ?? 0) >= (counts.get(best.id) ?? 0) ? look : best,
  );
  const visibility = Object.create(null) as Record<string, boolean>;
  for (const look of group.looks) visibility[look.instanceId] = look.id === chosen.id;
  applyArrangementToNodes(scene, elementMap, { visibility }, undefined);
}

function sampleScope(
  scope: FieldScope,
  source: Scene | Composition,
  compositions: ReadonlyMap<string, Composition>,
): void {
  const frame = vcgThumbnailFrame(source);
  for (const entry of scope.animated) applyAnimationAtFrame(entry, frame);
  for (const { node, lifespan } of scope.lifespanGates) {
    if (frame < lifespan.in || frame > lifespan.out) node.style.display = 'none';
  }
  for (const { element, host } of scope.sequences) {
    const { pageList, picture } = thumbnailSequenceContent(element, source);
    if (picture !== undefined) {
      host.replaceChildren(buildSequenceImageItem(element, picture, host.ownerDocument).cell);
    }
    if (!host.hasChildNodes() && (pageList || element.pageDataFile !== undefined)) {
      const placeholder = host.ownerDocument.createElement('div');
      placeholder.style.cssText =
        'width:100%;height:100%;display:grid;place-items:center;background:#23364a;color:#e9f3fc;' +
        'border:2px solid #6383a1;font:600 clamp(16px,3vw,48px)/1.2 system-ui';
      placeholder.textContent = 'Image sequence';
      host.append(placeholder);
    }
  }
  for (const child of scope.children) {
    const composition = compositions.get(child.compositionId);
    if (composition !== undefined) sampleScope(child.scope, composition, compositions);
  }
}

/** A representative still used by export and by CG Control when a VCG has no embedded preview. */
export function buildThumbnailScene(scene: Scene, doc: Document): HTMLElement {
  // Reuse the authoring plate fallbacks, including ones disabled on air, with a transparent stage.
  const { container, elementMap, scopeTree } = buildScene(scene, doc, 'author', false);
  applyScopedFieldValues(scene, scene, {}, scopeTree);
  showThumbnailPreset(scene, elementMap);
  sampleScope(scopeTree, scene, new Map(scene.compositions?.map((c) => [c.id, c])));
  container
    .querySelectorAll(
      '[data-cg-live-source-label], [data-cg-live-plate-mask], [data-cg-live-reveal-mask]',
    )
    .forEach((guide) => guide.remove());
  return container;
}
