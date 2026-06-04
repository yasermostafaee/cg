import type { Scene } from '@cg/shared-schema';
import { anim, EASE, kf, track } from './anim.js';

/**
 * Persian Reference Render — the QA template (Phase 8 §11 / M8.0), now
 * animated. Right-anchored RTL lower third in Vazirmatn with a gradient
 * plate that wipes open toward the left, a vertical accent that grows,
 * and name/role that slide in. Persian copy + `direction: 'rtl'` on every
 * text element keep bidi mirroring deterministic across font fallbacks.
 *
 * The package's tests parse this against `SceneSchema` and assert the
 * `anchor` + `role` text fields stay non-empty Persian copy.
 */
export const persianReferenceScene: Scene = {
  schemaVersion: 1,
  id: 'starter-persian-reference',
  name: 'Persian Reference Render',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 90 },
  background: 'transparent',
  layers: [
    {
      id: 'L1',
      name: 'Lower Third',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        {
          id: 'bg',
          name: 'background-plate',
          type: 'shape',
          transform: {
            position: { x: 620, y: 815 },
            size: { w: 1180, h: 156 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 1, y: 0.5 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 0,
          shape: 'rounded-rect',
          cornerRadius: 16,
          fill: {
            kind: 'linear',
            angle: 255,
            stops: [
              { at: 0, color: '#0B1224' },
              { at: 1, color: '#23123A' },
            ],
          },
          shadow: { offsetX: 0, offsetY: 20, blur: 48, color: '#00000099' },
          animation: anim({
            'scale.x': track(kf(0, 0, EASE.outExpo), kf(16, 1, EASE.outExpo)),
            opacity: track(kf(0, 0, EASE.outCubic), kf(8, 1, EASE.outCubic)),
          }),
        },
        {
          id: 'accent',
          name: 'accent-bar',
          type: 'shape',
          transform: {
            position: { x: 1792, y: 815 },
            size: { w: 8, h: 156 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0.5, y: 1 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 1,
          shape: 'rect',
          fill: { kind: 'solid', color: '#E11D48' },
          animation: anim({
            'scale.y': track(kf(6, 0, EASE.outBack), kf(24, 1, EASE.outBack)),
          }),
        },
        {
          id: 'name',
          name: 'anchor-name',
          type: 'text',
          transform: {
            position: { x: 700, y: 855 },
            size: { w: 1060, h: 70 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 2,
          text: '{{anchor}}',
          font: {
            family: 'Vazirmatn',
            weight: 700,
            style: 'normal',
            size: 56,
            lineHeight: 1.3,
            letterSpacing: 0,
          },
          color: '#FFFFFF',
          align: 'start',
          direction: 'rtl',
          fitMode: 'autosize',
          overflow: 'ellipsis',
          animation: anim({
            opacity: track(kf(12, 0), kf(28, 1)),
            'position.y': track(kf(12, 877, EASE.outExpo), kf(30, 855, EASE.outExpo)),
          }),
        },
        {
          id: 'role',
          name: 'role-subtitle',
          type: 'text',
          transform: {
            position: { x: 700, y: 930 },
            size: { w: 1060, h: 50 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 0.85,
          visible: true,
          locked: false,
          zIndex: 2,
          text: '{{role}}',
          font: {
            family: 'Vazirmatn',
            weight: 400,
            style: 'normal',
            size: 32,
            lineHeight: 1.3,
            letterSpacing: 0,
          },
          color: '#E5E7EB',
          align: 'start',
          direction: 'rtl',
          fitMode: 'autosize',
          overflow: 'ellipsis',
          animation: anim({
            opacity: track(kf(18, 0), kf(34, 0.85)),
            'position.y': track(kf(18, 948, EASE.outExpo), kf(36, 930, EASE.outExpo)),
          }),
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
    {
      id: 'role',
      label: 'Role / subtitle',
      required: false,
      type: 'text',
      default: 'کارشناس روابط بین‌الملل',
      direction: 'rtl',
    },
    {
      id: 'themeColor',
      label: 'Accent bar color',
      required: false,
      type: 'color',
      default: '#E11D48',
    },
  ],
  bindings: [
    { fieldId: 'anchor', target: { kind: 'text', elementId: 'name', placeholder: '{{anchor}}' } },
    { fieldId: 'role', target: { kind: 'text', elementId: 'role', placeholder: '{{role}}' } },
    { fieldId: 'themeColor', target: { kind: 'color', elementId: 'accent', property: 'fill' } },
  ],
  fonts: [{ family: 'Vazirmatn', weights: [400, 700], styles: ['normal'], source: 'system' }],
  metadata: {
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    description: 'Animated Persian RTL QA reference — Vazirmatn, gradient plate, accent wipe.',
    tags: ['starter', 'persian', 'lower-third', 'qa', 'animated'],
  },
};
