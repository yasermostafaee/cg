import type { Element, Layer, Scene } from '@cg/shared-schema';
import { flattenElements, lookContaining } from '@cg/shared-schema';
import { editSceneOf } from './scene-doc.js';

/**
 * 🔴 `B-187` (owner, 2026-10-14, Q2 (c)) — **the automatic name a newly drawn Live Source plate
 * gets: the next free `live-N` IN ITS LOOK.** The plate is marked `routeKeyAuto` until the author
 * confirms or replaces it (the Inspector says "auto"), so the name lands labelled as the tool's,
 * not the author's. Nothing reaches air differently — the operator maps the id in CG Control.
 *
 * "Free" is judged where one source would be ONE seat (`look-source-duplicate` /
 * `live-source-repeated`), so a generated name can never trip either refusal:
 *
 * - drawn INSIDE a look's composition → the keys of that look's visible set: its own plates plus
 *   the plates outside every look (on screen in every look). The same name in a DIFFERENT look is
 *   legitimate — that is the owner's own `livegroup.vcg`, l1 / l1,l2 / l1,l2,l3.
 * - anywhere else (a template without looks, or the look group's own root) → every key any plate in
 *   the project uses, because there every plate may be on air at once.
 *
 * ⚠ Not `nextLiveSourceId` revived: that swept scene-wide with no notion of a look (`B-183`'s
 * warning). The look membership here is the shared one — `flattenElements` + `lookContaining` —
 * never a second spelling of "which look holds this plate".
 */
export function nextAutoSourceId(scene: Scene, activeCompositionId: string | null): string {
  const used = usedKeysFor(scene, activeCompositionId);
  for (let n = 1; ; n += 1) {
    const key = `live-${String(n)}`;
    if (!used.has(key)) return key;
  }
}

function usedKeysFor(scene: Scene, activeCompositionId: string | null): Set<string> {
  if (activeCompositionId !== null) {
    for (const host of scene.compositions ?? []) {
      const groups = host.lookGroups ?? [];
      if (groups.length === 0) continue;
      const view = editSceneOf(scene, host.id);
      if (view === null) continue;
      const flat = flattenElements(view, 'document');
      for (const group of groups) {
        const look = group.looks.find((l) => {
          const inst = flat.find((f) => f.element.id === l.instanceId)?.element;
          return inst?.type === 'composition' && inst.compositionId === activeCompositionId;
        });
        if (look === undefined) continue;
        const keys = new Set<string>();
        for (const f of flat) {
          if (f.element.type !== 'video-placeholder' || f.element.routeKey === undefined) continue;
          const owner = lookContaining(
            group,
            f.ancestry.map((a) => a.id),
          );
          if (owner === undefined || owner.id === look.id) keys.add(f.element.routeKey);
        }
        return keys;
      }
    }
  }
  // No look in scope: every plate in the project may be on air with this one.
  const keys = new Set<string>();
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'video-placeholder' && el.routeKey !== undefined) keys.add(el.routeKey);
      if (el.type === 'container') walk(el.children);
    }
  };
  const layers: readonly Layer[] = [
    ...scene.layers,
    ...(scene.compositions ?? []).flatMap((c) => c.layers),
  ];
  for (const layer of layers) walk(layer.children);
  return keys;
}
