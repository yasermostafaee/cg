// Scene + extras for the starter Persian lower-third fixture.
// JSDoc types link back to @cg/shared-schema for editor hints.

/** @type {import('@cg/shared-schema').Scene} */
export const scene = {
  schemaVersion: 1,
  id: 'starter-persian-lower-third',
  name: 'Persian Lower Third',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
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
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    description: 'Starter Persian lower-third for M3.4 round-trip validation.',
    tags: ['starter', 'persian', 'lower-third'],
  },
};

/** @type {import('@cg/vcg-format').PackInput['manifestExtras']} */
export const manifestExtras = {
  id: 'starter-persian-lower-third',
  name: 'Persian Lower Third',
  fontDeps: scene.fonts,
  assetIndex: [],
  authoring: {
    designerVersion: '0.0.0',
    createdAt: '2026-05-23T00:00:00.000Z',
    exportedAt: '2026-05-23T00:00:00.000Z',
    author: 'cg starter fixture',
  },
  compatibility: {
    minRuntimeVersion: '0.0.0',
    minCasparCGVersion: '2.3.0',
  },
};

/** Per-template CSS (on top of the runtime's baseline). */
export const cgCss = `
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block');

html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  font-family: 'Vazirmatn', system-ui, sans-serif;
}

/* Hide everything until window.cg.play() removes cg-pending. */
.cg-pending .cg-stage {
  visibility: hidden;
}
`;
