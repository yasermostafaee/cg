import type { Scene } from '@cg/shared-schema';

/**
 * Ticker starter — full-width scrolling text bar across the bottom.
 * The text element gets a ticker LoopPreset wired up; M8.1's runtime
 * picks it up and drives the seamless wrap.
 */
export const tickerScene: Scene = {
  schemaVersion: 1,
  id: 'starter-ticker',
  name: 'Breaking Ticker',
  templateType: 'ticker',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [
    {
      id: 'L1',
      name: 'Ticker',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        {
          id: 'bg',
          name: 'ticker-bar',
          type: 'shape',
          transform: {
            position: { x: 0, y: 1000 },
            size: { w: 1920, h: 60 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 0.92,
          visible: true,
          locked: false,
          zIndex: 0,
          shape: 'rect',
          fill: { kind: 'solid', color: '#7F1D1D' },
        },
        {
          id: 'headline',
          name: 'headline-stream',
          type: 'text',
          transform: {
            position: { x: 20, y: 1010 },
            size: { w: 1880, h: 40 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 1,
          text: '{{headlines}}',
          font: {
            family: 'Inter',
            weight: 600,
            style: 'normal',
            size: 28,
            lineHeight: 1.2,
            letterSpacing: 0,
          },
          color: '#FFFFFF',
          align: 'start',
          direction: 'auto',
          fitMode: 'fixed',
          overflow: 'clip',
          // Ticker animation will be expressed as position.x keyframes in M12.4.
          // For now (M12.0) the starter renders statically; M12.1's runtime
          // will animate it once tracks are populated.
        },
      ],
    },
  ],
  fields: [
    {
      id: 'headlines',
      label: 'Headline stream',
      required: true,
      type: 'text',
      default:
        'Breaking news — markets close higher · Severe weather advisory · Live coverage continues',
    },
  ],
  bindings: [
    {
      fieldId: 'headlines',
      target: { kind: 'text', elementId: 'headline', placeholder: '{{headlines}}' },
    },
  ],
  fonts: [],
  metadata: {
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
    description: 'M8.3 starter — full-width ticker with M8.1 seamless-wrap runtime.',
    tags: ['starter', 'ticker'],
  },
};
