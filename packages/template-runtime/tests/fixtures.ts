import type { Scene } from '@cg/shared-schema';

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

const baseElProps = {
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

/** Persian lower-third with one text + one shape element. */
export const lowerThirdScene: Scene = {
  schemaVersion: 1,
  id: 'scene-test-lt',
  name: 'lower-third',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [
    {
      id: 'L1',
      name: 'main',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        {
          ...baseElProps,
          id: 'bg',
          name: 'background-rect',
          type: 'shape',
          shape: 'rounded-rect',
          cornerRadius: 8,
          fill: { kind: 'solid', color: '#0EA5E9' },
          transform: {
            ...baseTransform,
            position: { x: 100, y: 800 },
            size: { w: 800, h: 100 },
          },
        },
        {
          ...baseElProps,
          id: 'name',
          name: 'anchor-name',
          type: 'text',
          text: '{{anchor}}',
          font: {
            family: 'Vazirmatn',
            weight: 700,
            style: 'normal',
            size: 48,
            lineHeight: 1.4,
            letterSpacing: 0,
          },
          color: '#FFFFFF',
          align: 'start',
          direction: 'rtl',
          fitMode: 'autosize',
          overflow: 'ellipsis',
          transform: {
            ...baseTransform,
            position: { x: 120, y: 820 },
            size: { w: 760, h: 60 },
          },
        },
      ],
    },
  ],
  fields: [
    {
      id: 'anchor',
      label: 'Anchor name',
      required: true,
      type: 'text',
      default: 'سارا نادری',
      direction: 'rtl',
    },
  ],
  bindings: [
    {
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'name', placeholder: '{{anchor}}' },
    },
  ],
  fonts: [
    {
      family: 'Vazirmatn',
      weights: [400, 700],
      styles: ['normal'],
      source: 'bundled',
    },
  ],
  metadata: {
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  },
};
