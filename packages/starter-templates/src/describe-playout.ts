import { playoutOf, type Composition, type Element, type Scene } from '@cg/shared-schema';

/**
 * `DESIGNER-FIX-0905` — a starter's playout behaviour, DERIVED from its scene.
 *
 * The five starters differ mainly in what they do on air — stays until stopped, holds then
 * exits, auto-out after N seconds, content-driven hold, a sting that loops every ~N seconds —
 * and that one fact sat inside a paragraph on each landing card. The card shows it as a badge
 * now, and the badge is computed from the entry composition rather than authored beside it,
 * because a hand-written badge is one more string that can drift from the scene it describes.
 *
 * The shape mirrors `@cg/shared-ipc`'s `StarterPlayoutSchema` (the wire contract the landing
 * page reads); this package does not depend on `@cg/shared-ipc`, so the type is spelled here
 * and the bridge validates the object structurally.
 */
export interface StarterPlayoutSummary {
  mode: 'static' | 'manual' | 'auto-out' | 'loop-cycle';
  hold: 'operator' | 'timed' | 'content-driven';
  holdSeconds?: number;
  hasOutPoint: boolean;
  nestedCycleSeconds?: number;
}

/** The composition the starter opens on: the designated entry, else the root scene. */
function entryOf(scene: Scene): Pick<Composition, 'playout' | 'lifecycle' | 'layers'> {
  return scene.compositions?.find((c) => c.id === scene.entryCompositionId) ?? scene;
}

/** One in → hold → out cycle of a loop-cycle composition, in seconds. */
function cycleSeconds(comp: Composition, fps: number): number {
  const p = playoutOf(comp);
  const frames = comp.frameRange.out - comp.frameRange.in;
  const hold = p.holdSource === 'timed' ? (p.holdMs ?? 0) / 1000 : 0;
  return frames / fps + hold;
}

/**
 * The loop-cycle composition the entry DIRECTLY instances, if any — the on-air footprint comp
 * of the two-comp structure. Direct children only, deliberately: the ticker's strap holds a
 * one-second blink two levels down, and a blink is not the template's playout behaviour.
 */
function nestedLoopCycle(scene: Scene, layers: readonly { children: readonly Element[] }[]) {
  for (const layer of layers) {
    for (const el of layer.children) {
      if (el.type !== 'composition') continue;
      const comp = scene.compositions?.find((c) => c.id === el.compositionId);
      if (comp !== undefined && playoutOf(comp).mode === 'loop-cycle') return comp;
    }
  }
  return undefined;
}

export function describePlayout(scene: Scene): StarterPlayoutSummary {
  const entry = entryOf(scene);
  const p = playoutOf(entry);
  const hasOutPoint = entry.lifecycle !== undefined;
  const operatorHeld = p.mode === 'manual' || p.mode === 'static';
  const hold: StarterPlayoutSummary['hold'] = operatorHeld
    ? 'operator'
    : p.holdSource === 'content-driven'
      ? 'content-driven'
      : 'timed';
  const nested = nestedLoopCycle(scene, entry.layers);
  return {
    mode: p.mode,
    hold,
    ...(hold === 'timed' ? { holdSeconds: (p.holdMs ?? 0) / 1000 } : {}),
    hasOutPoint,
    ...(nested !== undefined ? { nestedCycleSeconds: cycleSeconds(nested, scene.frameRate) } : {}),
  };
}
