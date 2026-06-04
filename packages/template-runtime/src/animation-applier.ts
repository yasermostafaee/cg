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
  // D-010 — text background colour.
  if (tracks['backgroundColor'] !== undefined && entry.source.type === 'text') {
    const v = interpolateAtFrame(tracks['backgroundColor'], frame);
    if (typeof v === 'string') entry.node.style.backgroundColor = v;
  }

  // D-010 — direct numeric writes for stand-alone style properties.
  applyNumeric(tracks, 'cornerRadius', frame, (v) => {
    entry.node.style.borderRadius = `${v}px`;
  });
  // Stroke width / colour — recompose the border declaration.
  applyStroke(entry, tracks, frame);
  // Font sub-properties.
  applyNumeric(tracks, 'font.size', frame, (v) => {
    entry.node.style.fontSize = `${v}px`;
  });
  applyNumeric(tracks, 'font.lineHeight', frame, (v) => {
    entry.node.style.lineHeight = String(v);
  });
  applyNumeric(tracks, 'font.letterSpacing', frame, (v) => {
    entry.node.style.letterSpacing = `${v}em`;
  });
  // Padding sub-properties.
  applyNumeric(tracks, 'padding.top', frame, (v) => {
    entry.node.style.paddingTop = `${v}px`;
  });
  applyNumeric(tracks, 'padding.right', frame, (v) => {
    entry.node.style.paddingRight = `${v}px`;
  });
  applyNumeric(tracks, 'padding.bottom', frame, (v) => {
    entry.node.style.paddingBottom = `${v}px`;
  });
  applyNumeric(tracks, 'padding.left', frame, (v) => {
    entry.node.style.paddingLeft = `${v}px`;
  });

  // Composite shadow + filter — recompose the whole CSS declaration
  // from static + animated components when any track is present.
  applyShadow(entry, tracks, frame);
  applyFilter(entry, tracks, frame);
}

function applyNumeric(
  tracks: ElementAnimation['tracks'],
  prop: AnimatableProperty,
  frame: number,
  write: (v: number) => void,
): void {
  const track = tracks[prop];
  if (track === undefined) return;
  const v = interpolateAtFrame(track, frame);
  if (typeof v === 'number') write(v);
}

const SHADOW_PROPS = [
  'shadow.offsetX',
  'shadow.offsetY',
  'shadow.blur',
  'shadow.color',
] as const satisfies readonly AnimatableProperty[];

const STROKE_PROPS = [
  'stroke.width',
  'stroke.color',
  'stroke.dash',
] as const satisfies readonly AnimatableProperty[];

const FILTER_PROPS = [
  'filter.blur',
  'filter.brightness',
  'filter.contrast',
  'filter.grayscale',
  'filter.hueRotate',
  'filter.invert',
  'filter.opacity',
  'filter.saturate',
  'filter.sepia',
] as const satisfies readonly AnimatableProperty[];

function readNumericTrack(
  tracks: ElementAnimation['tracks'],
  prop: AnimatableProperty,
  frame: number,
): number | undefined {
  const track = tracks[prop];
  if (track === undefined) return undefined;
  const v = interpolateAtFrame(track, frame);
  return typeof v === 'number' ? v : undefined;
}

function readStringTrack(
  tracks: ElementAnimation['tracks'],
  prop: AnimatableProperty,
  frame: number,
): string | undefined {
  const track = tracks[prop];
  if (track === undefined) return undefined;
  const v = interpolateAtFrame(track, frame);
  return typeof v === 'string' ? v : undefined;
}

function applyStroke(
  entry: AnimatedElement,
  tracks: ElementAnimation['tracks'],
  frame: number,
): void {
  const hasAny = STROKE_PROPS.some((p) => tracks[p] !== undefined);
  if (!hasAny) return;
  const src = entry.source;
  if (src.type !== 'shape') return;
  const width = readNumericTrack(tracks, 'stroke.width', frame) ?? src.stroke?.width ?? 0;
  const color = readStringTrack(tracks, 'stroke.color', frame) ?? src.stroke?.color ?? '#000000';
  const staticDash = (src.stroke?.dash?.length ?? 0) > 0;
  const animatedDash = readNumericTrack(tracks, 'stroke.dash', frame);
  const dashOn = animatedDash !== undefined ? animatedDash > 0 : staticDash;
  entry.node.style.border = `${width}px ${dashOn ? 'dashed' : 'solid'} ${color}`;
}

function applyShadow(
  entry: AnimatedElement,
  tracks: ElementAnimation['tracks'],
  frame: number,
): void {
  const hasAny = SHADOW_PROPS.some((p) => tracks[p] !== undefined);
  if (!hasAny) return;
  const src = entry.source;
  const staticShadow =
    src.type === 'shape' ? src.shadow : src.type === 'text' ? src.textShadow : undefined;
  const offsetX = readNumericTrack(tracks, 'shadow.offsetX', frame) ?? staticShadow?.offsetX ?? 0;
  const offsetY = readNumericTrack(tracks, 'shadow.offsetY', frame) ?? staticShadow?.offsetY ?? 0;
  const blur = readNumericTrack(tracks, 'shadow.blur', frame) ?? staticShadow?.blur ?? 0;
  const color = readStringTrack(tracks, 'shadow.color', frame) ?? staticShadow?.color ?? '#000000';
  const css = `${offsetX}px ${offsetY}px ${blur}px ${color}`;
  if (src.type === 'text') entry.node.style.textShadow = css;
  else entry.node.style.boxShadow = css;
}

function applyFilter(
  entry: AnimatedElement,
  tracks: ElementAnimation['tracks'],
  frame: number,
): void {
  const hasAny = FILTER_PROPS.some((p) => tracks[p] !== undefined);
  if (!hasAny) return;
  const f = entry.source.filter ?? {};
  const get = (p: AnimatableProperty, fallback: number | undefined): number | undefined =>
    readNumericTrack(tracks, p, frame) ?? fallback;
  const blur = get('filter.blur', f.blur);
  const brightness = get('filter.brightness', f.brightness);
  const contrast = get('filter.contrast', f.contrast);
  const grayscale = get('filter.grayscale', f.grayscale);
  const hueRotate = get('filter.hueRotate', f.hueRotate);
  const invert = get('filter.invert', f.invert);
  const opacity = get('filter.opacity', f.opacity);
  const saturate = get('filter.saturate', f.saturate);
  const sepia = get('filter.sepia', f.sepia);
  const parts: string[] = [];
  if (blur !== undefined && blur > 0) parts.push(`blur(${blur}px)`);
  if (brightness !== undefined && brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== undefined && contrast !== 100) parts.push(`contrast(${contrast}%)`);
  if (grayscale !== undefined && grayscale > 0) parts.push(`grayscale(${grayscale}%)`);
  if (hueRotate !== undefined && hueRotate !== 0) parts.push(`hue-rotate(${hueRotate}deg)`);
  if (invert !== undefined && invert > 0) parts.push(`invert(${invert}%)`);
  if (opacity !== undefined && opacity !== 100) parts.push(`opacity(${opacity}%)`);
  if (saturate !== undefined && saturate !== 100) parts.push(`saturate(${saturate}%)`);
  if (sepia !== undefined && sepia > 0) parts.push(`sepia(${sepia}%)`);
  entry.node.style.filter = parts.join(' ');
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
