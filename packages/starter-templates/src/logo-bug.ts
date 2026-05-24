import type { Scene } from '@cg/shared-schema';

/**
 * Logo bug starter — a persistent corner-mounted brand mark. The default
 * uses a square shape as a stand-in for an image asset (operator
 * imports a real logo via the asset pipeline). Phase 3 §5 calls out
 * "logo bug" as the always-on persistent channel ident.
 */
export const logoBugScene: Scene = {
  schemaVersion: 1,
  id: 'starter-logo-bug',
  name: 'Logo Bug',
  templateType: 'logo-bug',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  background: 'transparent',
  layers: [
    {
      id: 'L1',
      name: 'Logo',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        {
          id: 'plate',
          name: 'logo-plate',
          type: 'shape',
          transform: {
            position: { x: 1700, y: 80 },
            size: { w: 140, h: 140 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 0.85,
          visible: true,
          locked: false,
          zIndex: 0,
          shape: 'rounded-rect',
          cornerRadius: 16,
          fill: { kind: 'solid', color: '#0F172A' },
        },
        {
          id: 'mark',
          name: 'channel-mark',
          type: 'text',
          transform: {
            position: { x: 1700, y: 110 },
            size: { w: 140, h: 80 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 1,
          text: '{{mark}}',
          font: {
            family: 'Inter',
            weight: 800,
            style: 'normal',
            size: 56,
            lineHeight: 1.1,
            letterSpacing: 0,
          },
          color: '#FFFFFF',
          align: 'center',
          direction: 'auto',
          fitMode: 'autosize',
          overflow: 'clip',
        },
      ],
    },
  ],
  fields: [
    {
      id: 'mark',
      label: 'Channel mark',
      required: true,
      type: 'text',
      default: 'NEWS',
    },
  ],
  bindings: [
    {
      fieldId: 'mark',
      target: { kind: 'text', elementId: 'mark', placeholder: '{{mark}}' },
    },
  ],
  fonts: [],
  metadata: {
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
    description: 'M8.3 starter — persistent corner logo bug.',
    tags: ['starter', 'logo-bug'],
  },
};
