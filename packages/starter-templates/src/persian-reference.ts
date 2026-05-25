import type { Scene } from '@cg/shared-schema';

/**
 * Persian Reference Render — the QA template for Phase 8 §11 ("M8.0").
 *
 * Ported from the M3.5 fixture (`tools/template-fixtures/persian-lower-third.scene.mjs`)
 * with two refinements:
 *
 *   - Field defaults now include broadcast-realistic Persian copy
 *     ("سارا نادری" / "کارشناس روابط بین‌الملل") so the operator
 *     sees a usable scene on first open, not placeholder text.
 *   - The `direction: 'rtl'` is set explicitly on every text element so
 *     bidi mirroring is deterministic across font fallbacks.
 *
 * Schema validation runs in the package's tests so any drift between
 * this constant and the canonical `SceneSchema` surfaces at build time.
 */
export const persianReferenceScene: Scene = {
  schemaVersion: 1,
  id: 'starter-persian-reference',
  name: 'Persian Reference Render',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
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
          name: 'background-bar',
          type: 'shape',
          transform: {
            position: { x: 100, y: 850 },
            size: { w: 1200, h: 160 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 0.95,
          visible: true,
          locked: false,
          zIndex: 0,
          shape: 'rounded-rect',
          cornerRadius: 12,
          fill: { kind: 'solid', color: '#0F172A' },
        },
        {
          id: 'accent',
          name: 'accent-bar',
          type: 'shape',
          transform: {
            position: { x: 100, y: 850 },
            size: { w: 12, h: 160 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 1,
          shape: 'rect',
          fill: { kind: 'solid', color: '#E11D48' },
        },
        {
          id: 'name',
          name: 'anchor-name',
          type: 'text',
          transform: {
            position: { x: 140, y: 870 },
            size: { w: 1140, h: 70 },
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
        },
        {
          id: 'role',
          name: 'role-subtitle',
          type: 'text',
          transform: {
            position: { x: 140, y: 950 },
            size: { w: 1140, h: 50 },
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
    {
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'name', placeholder: '{{anchor}}' },
    },
    {
      fieldId: 'role',
      target: { kind: 'text', elementId: 'role', placeholder: '{{role}}' },
    },
    {
      fieldId: 'themeColor',
      target: { kind: 'color', elementId: 'accent', property: 'fill' },
    },
  ],
  fonts: [
    {
      family: 'Vazirmatn',
      weights: [400, 700],
      styles: ['normal'],
      source: 'system',
    },
  ],
  metadata: {
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
    description: 'Phase 8 §11 (M8.0) starter — the Persian QA reference.',
    tags: ['starter', 'persian', 'lower-third', 'qa'],
  },
};
