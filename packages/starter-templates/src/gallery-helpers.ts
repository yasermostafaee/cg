import type {
  DynamicField,
  Element,
  FieldBinding,
  Fill,
  LookGroups,
  Playout,
  Scene,
  TemplateType,
  Transform,
} from '@cg/shared-schema';
import { anim, EASE, kf, track } from './anim.js';

export const FRAME_RATE = 50 as const;
export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;

export const PALETTE = {
  ink: '#071426',
  navy: '#0C2340',
  blue: '#1261A0',
  cyan: '#38BDF8',
  teal: '#0F766E',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#DC2626',
  white: '#FFFFFF',
  mist: '#D8E7F5',
  muted: '#8FA8C0',
  panel: '#102A46',
  panelAlt: '#163653',
} as const;

export function tf(
  x: number,
  y: number,
  w: number,
  h: number,
  anchor: { x?: number; y?: number } = {},
): Transform {
  return {
    position: { x, y },
    size: { w, h },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: anchor.x ?? 0, y: anchor.y ?? 0 },
  };
}

export function solid(color: string): Fill {
  return { kind: 'solid', color };
}

export function gradient(angle: number, from: string, to: string): Fill {
  return {
    kind: 'linear',
    angle,
    stops: [
      { at: 0, color: from },
      { at: 1, color: to },
    ],
  };
}

export function layer(id: string, name: string, children: Element[]): Scene['layers'][number] {
  return { id, name, visible: true, locked: false, blendMode: 'normal', children };
}

export function shape(
  id: string,
  name: string,
  transform: Transform,
  fill: Fill,
  zIndex: number,
  options: {
    radius?: number;
    opacity?: number;
    stroke?: { color: string; width: number };
    shadow?: { offsetX: number; offsetY: number; blur: number; color: string };
    animation?: Element['animation'];
  } = {},
): Element {
  return {
    id,
    name,
    type: 'shape',
    transform,
    opacity: options.opacity ?? 1,
    visible: true,
    locked: false,
    zIndex,
    shape: options.radius === undefined ? 'rect' : 'rounded-rect',
    fill,
    ...(options.radius !== undefined ? { cornerRadius: options.radius } : {}),
    ...(options.stroke !== undefined
      ? { stroke: { color: options.stroke.color, width: options.stroke.width } }
      : {}),
    ...(options.shadow !== undefined ? { shadow: options.shadow } : {}),
    ...(options.animation !== undefined ? { animation: options.animation } : {}),
  } as Element;
}

export function image(
  id: string,
  name: string,
  assetId: string,
  transform: Transform,
  zIndex: number,
  fit: 'contain' | 'cover' | 'fill' = 'cover',
  options: { opacity?: number; animation?: Element['animation'] } = {},
): Element {
  return {
    id,
    name,
    type: 'image',
    assetId,
    source: 'project',
    fit,
    preserveAspect: fit !== 'fill',
    transform,
    opacity: options.opacity ?? 1,
    visible: true,
    locked: false,
    zIndex,
    ...(options.animation === undefined ? {} : { animation: options.animation }),
  } as Element;
}

export function text(
  id: string,
  name: string,
  value: string,
  transform: Transform,
  family: string,
  size: number,
  weight: 400 | 500 | 600 | 700 | 800 | 900,
  color: string,
  zIndex: number,
  options: {
    align?: 'start' | 'end' | 'center' | 'justify';
    direction?: 'auto' | 'ltr' | 'rtl';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    backgroundColor?: string;
    padding?: { top: number; right: number; bottom: number; left: number };
    maxLines?: number;
    animation?: Element['animation'];
  } = {},
): Element {
  return {
    id,
    name,
    type: 'text',
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex,
    text: value,
    font: { family, weight, style: 'normal', size, lineHeight: 1.35, letterSpacing: 0 },
    color,
    align: options.align ?? 'start',
    verticalAlign: options.verticalAlign ?? 'middle',
    direction: options.direction ?? 'rtl',
    fitMode: 'shrink-to-fit',
    overflow: 'ellipsis',
    ...(options.backgroundColor !== undefined ? { backgroundColor: options.backgroundColor } : {}),
    ...(options.padding !== undefined ? { padding: options.padding } : {}),
    ...(options.maxLines !== undefined ? { maxLines: options.maxLines } : {}),
    ...(options.animation !== undefined ? { animation: options.animation } : {}),
  } as Element;
}

export function reveal(delay = 0): Element['animation'] {
  return anim({
    opacity: track(kf(delay, 0), kf(delay + 12, 1, EASE.outExpo), kf(116, 1), kf(138, 0)),
    'position.y': track(
      kf(delay, 20, EASE.outExpo),
      kf(delay + 16, 0, EASE.outExpo),
      kf(116, 0),
      kf(138, 16, EASE.inCubic),
    ),
  });
}

interface GallerySceneOptions {
  id: string;
  name: string;
  description: string;
  templateType?: TemplateType;
  fontFamily: string;
  onAirId: string;
  onAirName: string;
  onAirSize: { width: number; height: number };
  onAirPosition: { x: number; y: number };
  children: Element[];
  fields: DynamicField[];
  bindings: FieldBinding[];
  extraCompositions?: NonNullable<Scene['compositions']>;
  entryPlayout?: Playout;
  onAirPlayout?: Playout;
  entryOut?: number;
  onAirOut?: number;
  outPoint?: number;
  entryLookGroups?: LookGroups;
  /** Full-screen graphics are authored directly in their exported composition. */
  direct?: boolean;
}

function offsetElement(element: Element, x: number, y: number): Element {
  return {
    ...element,
    transform: {
      ...element.transform,
      position: {
        x: element.transform.position.x + x,
        y: element.transform.position.y + y,
      },
    },
  } as Element;
}

export function galleryScene(options: GallerySceneOptions): Scene {
  const entryOut = options.entryOut ?? 160;
  const onAirOut = options.onAirOut ?? 140;
  const outPoint = options.outPoint ?? 100;
  const entryId = `comp-${options.id}`;
  const entryPlayout = options.entryPlayout ?? {
    mode: 'manual',
    holdSource: 'timed',
  };
  const onAirPlayout = options.onAirPlayout ?? entryPlayout;
  const direct = options.direct === true;
  const entryChildren = direct
    ? options.children.map((element) =>
        offsetElement(element, options.onAirPosition.x, options.onAirPosition.y),
      )
    : [
        {
          id: `${options.id}-onair-instance`,
          name: options.onAirName,
          type: 'composition',
          compositionId: options.onAirId,
          transform: tf(
            options.onAirPosition.x,
            options.onAirPosition.y,
            options.onAirSize.width,
            options.onAirSize.height,
          ),
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 0,
          animation: anim({
            opacity: track(kf(0, 0), kf(12, 1), kf(entryOut - 24, 1), kf(entryOut, 0)),
            'scale.x': track(kf(0, 0.985, EASE.outExpo), kf(18, 1, EASE.outExpo)),
            'scale.y': track(kf(0, 0.985, EASE.outExpo), kf(18, 1, EASE.outExpo)),
          }),
        } as Element,
      ];
  const entryComposition: NonNullable<Scene['compositions']>[number] = {
    id: entryId,
    name: options.name,
    resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    frameRange: { in: 0, out: entryOut },
    lifecycle: { outPoint, contentStart: Math.min(20, outPoint) },
    playout: entryPlayout,
    editorBackdrop: '#071426',
    layers: [layer(`layer-${options.id}-entry`, 'Frame', entryChildren)],
    ...(direct ? { fields: options.fields, bindings: options.bindings } : {}),
    ...(options.entryLookGroups === undefined ? {} : { lookGroups: options.entryLookGroups }),
  };

  return {
    schemaVersion: 1,
    id: `starter-${options.id}`,
    name: options.name,
    templateType: options.templateType ?? 'custom',
    resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    frameRate: FRAME_RATE,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: entryOut },
    editorBackdrop: '#071426',
    layers: [],
    compositions: [
      entryComposition,
      ...(!direct
        ? [
            {
              id: options.onAirId,
              name: options.onAirName,
              resolution: options.onAirSize,
              frameRange: { in: 0, out: onAirOut },
              lifecycle: { outPoint, contentStart: Math.min(20, outPoint) },
              playout: onAirPlayout,
              editorBackdrop: '#071426' as const,
              layers: [layer(`layer-${options.id}-onair`, 'On air', options.children)],
            },
          ]
        : []),
      ...(options.extraCompositions ?? []),
    ],
    entryCompositionId: entryId,
    fields: options.fields,
    bindings: options.bindings,
    fonts: [
      {
        family: options.fontFamily,
        weights: [400, 500, 600, 700, 800, 900],
        styles: ['normal'],
        source: 'bundled',
        bundledPath: 'Vazirmatn',
      },
    ],
    metadata: {
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
      description: options.description,
      tags: [
        'starter',
        'persian',
        'rtl',
        'production-gallery',
        ...(direct ? ['fullscreen:direct'] : [`onair:${options.onAirId}`]),
      ],
    },
  };
}
