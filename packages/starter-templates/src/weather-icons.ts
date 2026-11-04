import type { Element } from '@cg/shared-schema';
import { anim, EASE, kf, kfStep, track } from './anim.js';
import { solid, tf } from './gallery-helpers.js';

export const WEATHER_TYPE_LABELS = {
  '0': 'آفتابی',
  '1': 'ابری',
  '2': 'بارانی',
  '3': 'برفی',
} as const;

function visibilityRules(
  fieldId: string,
  value: number,
  baseVisible: boolean,
): NonNullable<Element['valueRules']> {
  return {
    input: { kind: 'field', fieldId },
    rules: [
      {
        condition: { comparator: baseVisible ? '!=' : '=', value },
        effect: {
          elementId: '',
          property: 'visible',
          value: !baseVisible,
        },
      },
    ],
  };
}

function iconShape(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  zIndex: number,
  fieldId: string,
  weatherType: number,
  options: {
    ellipse?: boolean;
    radius?: number;
    rotation?: number;
    opacity?: number;
    animation?: Element['animation'];
  } = {},
): Element {
  const baseVisible = weatherType === 0;
  const rules = visibilityRules(fieldId, weatherType, baseVisible);
  const rule = rules.rules[0];
  if (rule !== undefined) rule.effect.elementId = id;
  return {
    id,
    name,
    type: 'shape',
    transform: {
      ...tf(x, y, width, height, { x: 0.5, y: 0.5 }),
      rotation: options.rotation ?? 0,
    },
    opacity: options.opacity ?? 1,
    visible: baseVisible,
    locked: false,
    zIndex,
    shape: options.ellipse === true ? 'ellipse' : 'rounded-rect',
    fill: solid(color),
    ...(options.radius === undefined ? {} : { cornerRadius: options.radius }),
    ...(options.animation === undefined ? {} : { animation: options.animation }),
    valueRules: rules,
  } as Element;
}

/** Consistent animated weather glyphs whose visibility is driven by one numeric choice field. */
export function weatherIconElements(
  prefix: string,
  fieldId: string,
  x: number,
  y: number,
  size: number,
  zIndex: number,
): Element[] {
  const unit = size / 120;
  const sx = (value: number): number => x + value * unit;
  const sy = (value: number): number => y + value * unit;
  const ss = (value: number): number => value * unit;
  const pulse = anim({
    opacity: track(kf(0, 0.35), kf(34, 0.8, EASE.inOut), kf(68, 0.35, EASE.inOut)),
    'scale.x': track(kf(0, 0.92), kf(34, 1.08, EASE.inOut), kf(68, 0.92, EASE.inOut)),
    'scale.y': track(kf(0, 0.92), kf(34, 1.08, EASE.inOut), kf(68, 0.92, EASE.inOut)),
  });
  const shimmer = anim({
    opacity: track(kf(0, 0.62), kf(28, 1, EASE.inOut), kf(56, 0.62, EASE.inOut)),
  });

  const sun: Element[] = [
    iconShape(
      `${prefix}-sun-glow`,
      'درخشش خورشید',
      sx(14),
      sy(14),
      ss(92),
      ss(92),
      '#FBBF2440',
      zIndex,
      fieldId,
      0,
      { ellipse: true, animation: pulse },
    ),
    iconShape(
      `${prefix}-sun-core`,
      'خورشید',
      sx(31),
      sy(31),
      ss(58),
      ss(58),
      '#FCD34D',
      zIndex + 1,
      fieldId,
      0,
      { ellipse: true, animation: shimmer },
    ),
    ...[0, 45, 90, 135].map((rotation, index) =>
      iconShape(
        `${prefix}-sun-ray-${String(index + 1)}`,
        'پرتو خورشید',
        sx(56),
        sy(2),
        ss(8),
        ss(24),
        '#FDE68A',
        zIndex,
        fieldId,
        0,
        { radius: ss(4), rotation, animation: shimmer },
      ),
    ),
  ];

  const cloud = (kind: 1 | 2 | 3, cloudY: number, tint = '#DDECF6'): Element[] => [
    iconShape(
      `${prefix}-${String(kind)}-cloud-base`,
      'ابر',
      sx(17),
      sy(cloudY + 34),
      ss(88),
      ss(34),
      tint,
      zIndex + 1,
      fieldId,
      kind,
      { radius: ss(17), animation: shimmer },
    ),
    iconShape(
      `${prefix}-${String(kind)}-cloud-left`,
      'ابر',
      sx(26),
      sy(cloudY + 18),
      ss(45),
      ss(45),
      tint,
      zIndex + 1,
      fieldId,
      kind,
      { ellipse: true, animation: shimmer },
    ),
    iconShape(
      `${prefix}-${String(kind)}-cloud-right`,
      'ابر',
      sx(55),
      sy(cloudY + 4),
      ss(52),
      ss(52),
      tint,
      zIndex + 1,
      fieldId,
      kind,
      { ellipse: true, animation: shimmer },
    ),
  ];

  const rain = cloud(2, 3, '#C7E6F5').concat(
    [29, 55, 81].map((dropX, index) =>
      iconShape(
        `${prefix}-rain-${String(index + 1)}`,
        'قطره باران',
        sx(dropX),
        sy(79),
        ss(8),
        ss(28),
        '#38BDF8',
        zIndex,
        fieldId,
        2,
        {
          radius: ss(4),
          rotation: 18,
          animation: anim({
            opacity: track(
              kfStep(index * 7, 0.25),
              kf(index * 7 + 12, 1),
              kf(index * 7 + 30, 0.25),
            ),
          }),
        },
      ),
    ),
  );

  const snow = cloud(3, 2, '#E8F5FC').concat(
    [28, 55, 82].map((flakeX, index) =>
      iconShape(
        `${prefix}-snow-${String(index + 1)}`,
        'دانه برف',
        sx(flakeX),
        sy(83 + (index % 2) * 9),
        ss(11),
        ss(11),
        '#BAE6FD',
        zIndex,
        fieldId,
        3,
        { ellipse: true, animation: pulse },
      ),
    ),
  );

  return [...sun, ...cloud(1, 11), ...rain, ...snow];
}
