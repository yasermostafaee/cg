import type {
  AnimatableProperty,
  Element as SceneElement,
  ElementAnimation,
  Transform,
} from '@cg/shared-schema';
import { interpolateAtFrame } from './keyframe-eval.js';

/**
 * Per-animated-element bookkeeping. Holds the static transform/style
 * snapshot we override from when a track is active. The runtime builds
 * one entry per element with an `animation.tracks` record; on every
 * frame it walks these entries and applies the interpolated values.
 */
export interface AnimatedElement {
  id: string;
  node: HTMLElement;
  source: SceneElement;
  animation: ElementAnimation;
}

const NUMERIC_PROPS = [
  'position.x',
  'position.y',
  'size.w',
  'size.h',
  'scale.x',
  'scale.y',
  'rotation',
  'opacity',
] as const satisfies readonly AnimatableProperty[];

/**
 * Apply every track in `entry.animation` at `frame` to the DOM node.
 *
 * Transform properties (position, scale, rotation) compose into a single
 * `transform`/`left`/`top` write so we issue one DOM mutation per axis.
 * Static transform values from the source element are reused for any
 * axis without a track at this frame.
 */
export function applyAnimationAtFrame(entry: AnimatedElement, frame: number): void {
  const tracks = entry.animation.tracks;
  const tx = entry.source.transform;

  const animated = readAnimatedValues(tracks, frame, tx);

  if (animated.posDirty) {
    entry.node.style.left = `${animated.posX}px`;
    entry.node.style.top = `${animated.posY}px`;
  }
  if (animated.sizeDirty) {
    entry.node.style.width = `${animated.sizeW}px`;
    entry.node.style.height = `${animated.sizeH}px`;
  }
  if (animated.transformDirty) {
    entry.node.style.transform = composeTransform(
      animated.scaleX,
      animated.scaleY,
      animated.rotation,
    );
  }
  if (tracks.opacity !== undefined) {
    const v = interpolateAtFrame(tracks.opacity, frame);
    if (typeof v === 'number') entry.node.style.opacity = String(v);
  }
  if (tracks['fill.color'] !== undefined && entry.source.type === 'shape') {
    const v = interpolateAtFrame(tracks['fill.color'], frame);
    if (typeof v === 'string') entry.node.style.background = v;
  }
  if (tracks['text.color'] !== undefined && entry.source.type === 'text') {
    const v = interpolateAtFrame(tracks['text.color'], frame);
    if (typeof v === 'string') entry.node.style.color = v;
  }
}

interface AnimatedTransformState {
  posX: number;
  posY: number;
  posDirty: boolean;
  sizeW: number;
  sizeH: number;
  sizeDirty: boolean;
  scaleX: number;
  scaleY: number;
  rotation: number;
  transformDirty: boolean;
}

function readAnimatedValues(
  tracks: ElementAnimation['tracks'],
  frame: number,
  tx: Transform,
): AnimatedTransformState {
  const state: AnimatedTransformState = {
    posX: tx.position.x,
    posY: tx.position.y,
    posDirty: false,
    sizeW: tx.size.w,
    sizeH: tx.size.h,
    sizeDirty: false,
    scaleX: tx.scale.x,
    scaleY: tx.scale.y,
    rotation: tx.rotation,
    transformDirty: false,
  };

  for (const prop of NUMERIC_PROPS) {
    const track = tracks[prop];
    if (track === undefined) continue;
    const v = interpolateAtFrame(track, frame);
    if (typeof v !== 'number') continue;
    switch (prop) {
      case 'position.x':
        state.posX = v;
        state.posDirty = true;
        break;
      case 'position.y':
        state.posY = v;
        state.posDirty = true;
        break;
      case 'size.w':
        state.sizeW = v;
        state.sizeDirty = true;
        break;
      case 'size.h':
        state.sizeH = v;
        state.sizeDirty = true;
        break;
      case 'scale.x':
        state.scaleX = v;
        state.transformDirty = true;
        break;
      case 'scale.y':
        state.scaleY = v;
        state.transformDirty = true;
        break;
      case 'rotation':
        state.rotation = v;
        state.transformDirty = true;
        break;
      case 'opacity':
        break;
    }
  }

  return state;
}

function composeTransform(scaleX: number, scaleY: number, rotation: number): string {
  const parts: string[] = [];
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${scaleX}, ${scaleY})`);
  if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
  return parts.join(' ');
}

/** Walk a scene and collect every element that has an `animation.tracks` record. */
export function collectAnimatedElements(
  layers: SceneElement[][],
  elementMap: Map<string, HTMLElement>,
): AnimatedElement[] {
  const out: AnimatedElement[] = [];
  for (const layer of layers) walk(layer, elementMap, out);
  return out;
}

function walk(
  children: SceneElement[],
  elementMap: Map<string, HTMLElement>,
  out: AnimatedElement[],
): void {
  for (const el of children) {
    if (el.animation !== undefined && Object.keys(el.animation.tracks).length > 0) {
      const node = elementMap.get(el.id);
      if (node !== undefined) {
        out.push({ id: el.id, node, source: el, animation: el.animation });
      }
    }
    if (el.type === 'container') walk(el.children, elementMap, out);
  }
}
