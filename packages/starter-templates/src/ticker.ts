import type { Scene } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';

/**
 * Breaking ticker — a full-width bottom strip that slides up, a pulsing
 * "LIVE" badge pinned at the left, and a headline that scrolls right→left
 * at constant velocity (linear keyframes). The full-width bar keeps the
 * headline reading over the strip the whole time; the badge sits on top
 * so the text slides under it. Showcases: linear-gradient bar, constant
 * scroll, opacity pulse, slide-in.
 */
export const tickerScene: Scene = {
  schemaVersion: 1,
  id: 'starter-ticker',
  name: 'Breaking Ticker',
  templateType: 'ticker',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 300 },
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
          id: 'bar',
          name: 'ticker-bar',
          type: 'shape',
          transform: {
            position: { x: 0, y: 988 },
            size: { w: 1920, h: 68 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 0.96,
          visible: true,
          locked: false,
          zIndex: 0,
          shape: 'rect',
          fill: {
            kind: 'linear',
            angle: 0,
            stops: [
              { at: 0, color: '#5B0E0E' },
              { at: 1, color: '#9B1C1C' },
            ],
          },
          animation: anim({
            'position.y': track(kf(0, 1060, EASE.outExpo), kf(16, 988, EASE.outExpo)),
          }),
        },
        {
          id: 'headline',
          name: 'headline-stream',
          type: 'text',
          transform: {
            position: { x: 1920, y: 1002 },
            size: { w: 2800, h: 44 },
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
            size: 30,
            lineHeight: 1.2,
            letterSpacing: 0.01,
          },
          color: '#FFFFFF',
          align: 'start',
          direction: 'auto',
          fitMode: 'fixed',
          overflow: 'clip',
          animation: anim({
            'position.x': track(kfLinear(18, 1920), kfLinear(300, -2600)),
          }),
        },
        {
          id: 'badge',
          name: 'live-badge',
          type: 'shape',
          transform: {
            position: { x: 0, y: 988 },
            size: { w: 188, h: 68 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 2,
          shape: 'rect',
          fill: { kind: 'solid', color: '#EF4444' },
          shadow: { offsetX: 8, offsetY: 0, blur: 18, color: '#00000066' },
          animation: anim({
            'position.y': track(kf(0, 1060, EASE.outExpo), kf(16, 988, EASE.outExpo)),
          }),
        },
        {
          id: 'livedot',
          name: 'live-dot',
          type: 'shape',
          transform: {
            position: { x: 28, y: 1014 },
            size: { w: 16, h: 16 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0.5, y: 0.5 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 3,
          shape: 'ellipse',
          fill: { kind: 'solid', color: '#FFFFFF' },
          animation: anim({
            opacity: track(
              kf(16, 1, EASE.inOut),
              kf(40, 0.25, EASE.inOut),
              kf(64, 1, EASE.inOut),
              kf(88, 0.25, EASE.inOut),
              kf(112, 1, EASE.inOut),
            ),
          }),
        },
        {
          id: 'livetext',
          name: 'live-text',
          type: 'text',
          transform: {
            position: { x: 56, y: 1006 },
            size: { w: 120, h: 36 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 3,
          text: 'LIVE',
          font: {
            family: 'Inter',
            weight: 800,
            style: 'normal',
            size: 28,
            lineHeight: 1.2,
            letterSpacing: 0.1,
          },
          color: '#FFFFFF',
          align: 'start',
          direction: 'ltr',
          fitMode: 'fixed',
          overflow: 'clip',
          animation: anim({ opacity: track(kf(10, 0), kf(20, 1)) }),
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
        'Markets close higher as tech rallies   ·   Severe weather advisory issued for the coast   ·   Live coverage continues through the night',
    },
  ],
  bindings: [
    { fieldId: 'headlines', target: { kind: 'text', elementId: 'headline', placeholder: '{{headlines}}' } },
  ],
  fonts: [{ family: 'Inter', weights: [600, 800], styles: ['normal'], source: 'system' }],
  metadata: {
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    description: 'Full-width scrolling ticker with a pulsing LIVE badge.',
    tags: ['starter', 'ticker', 'animated'],
  },
};
