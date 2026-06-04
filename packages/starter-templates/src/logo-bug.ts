import type { Scene } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';

/**
 * Logo bug / channel ID — a persistent top-right corner mark: a rounded
 * gradient plate that pops in, a dashed accent ring that spins
 * continuously, a pulsing centre dot, and bound channel text. Showcases:
 * ellipse + dashed stroke, looping rotation, an opacity pulse, scale-in
 * with overshoot.
 */
export const logoBugScene: Scene = {
  schemaVersion: 1,
  id: 'starter-logo-bug',
  name: 'Logo Bug',
  templateType: 'logo-bug',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 100 },
  background: 'transparent',
  layers: [
    {
      id: 'L1',
      name: 'Logo Bug',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        {
          id: 'plate',
          name: 'bug-plate',
          type: 'shape',
          transform: {
            position: { x: 1540, y: 56 },
            size: { w: 320, h: 96 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0.5, y: 0.5 },
          },
          opacity: 0.96,
          visible: true,
          locked: false,
          zIndex: 0,
          shape: 'rounded-rect',
          cornerRadius: 48,
          fill: {
            kind: 'linear',
            angle: 120,
            stops: [
              { at: 0, color: '#111827' },
              { at: 1, color: '#0B3B5E' },
            ],
          },
          shadow: { offsetX: 0, offsetY: 10, blur: 30, color: '#00000080' },
          animation: anim({
            'scale.x': track(kf(0, 0.6, EASE.outBack), kf(20, 1, EASE.outBack)),
            'scale.y': track(kf(0, 0.6, EASE.outBack), kf(20, 1, EASE.outBack)),
            opacity: track(kf(0, 0, EASE.outCubic), kf(12, 0.96, EASE.outCubic)),
          }),
        },
        {
          id: 'ring',
          name: 'accent-ring',
          type: 'shape',
          transform: {
            position: { x: 1566, y: 74 },
            size: { w: 60, h: 60 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0.5, y: 0.5 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 1,
          shape: 'ellipse',
          stroke: { width: 4, color: '#38BDF8', dash: [10, 8] },
          animation: anim({
            rotation: track(kfLinear(0, 0), kfLinear(100, 360)),
            opacity: track(kf(8, 0), kf(20, 1)),
          }),
        },
        {
          id: 'dot',
          name: 'centre-dot',
          type: 'shape',
          transform: {
            position: { x: 1582, y: 90 },
            size: { w: 28, h: 28 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0.5, y: 0.5 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 2,
          shape: 'ellipse',
          fill: { kind: 'solid', color: '#38BDF8' },
          animation: anim({
            opacity: track(
              kf(20, 1, EASE.inOut),
              kf(45, 0.35, EASE.inOut),
              kf(70, 1, EASE.inOut),
              kf(95, 0.35, EASE.inOut),
            ),
          }),
        },
        {
          id: 'channel',
          name: 'channel-text',
          type: 'text',
          transform: {
            position: { x: 1640, y: 70 },
            size: { w: 210, h: 40 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 3,
          text: '{{channel}}',
          font: {
            family: 'Inter',
            weight: 800,
            style: 'normal',
            size: 30,
            lineHeight: 1.1,
            letterSpacing: 0.04,
          },
          color: '#FFFFFF',
          align: 'start',
          direction: 'auto',
          fitMode: 'autosize',
          overflow: 'clip',
          animation: anim({
            opacity: track(kf(14, 0), kf(28, 1)),
            'position.x': track(kf(14, 1656, EASE.outExpo), kf(30, 1640, EASE.outExpo)),
          }),
        },
        {
          id: 'tagline',
          name: 'tagline-text',
          type: 'text',
          transform: {
            position: { x: 1640, y: 106 },
            size: { w: 210, h: 22 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 0.7,
          visible: true,
          locked: false,
          zIndex: 3,
          text: 'LIVE · HD',
          font: {
            family: 'Inter',
            weight: 600,
            style: 'normal',
            size: 14,
            lineHeight: 1.1,
            letterSpacing: 0.16,
          },
          color: '#7DD3FC',
          align: 'start',
          direction: 'ltr',
          fitMode: 'fixed',
          overflow: 'clip',
          animation: anim({
            opacity: track(kf(22, 0), kf(34, 0.7)),
          }),
        },
      ],
    },
  ],
  fields: [
    { id: 'channel', label: 'Channel name', required: true, type: 'text', default: 'CG NEWS' },
  ],
  bindings: [
    {
      fieldId: 'channel',
      target: { kind: 'text', elementId: 'channel', placeholder: '{{channel}}' },
    },
  ],
  fonts: [{ family: 'Inter', weights: [600, 800], styles: ['normal'], source: 'system' }],
  metadata: {
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    description: 'Corner channel ID with a spinning dashed ring and pulsing dot.',
    tags: ['starter', 'logo-bug', 'animated'],
  },
};
