import { afterEach, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import type { TemplateRuntime } from '../src/types.js';

const PAST = '2000-01-01T00:00:00.000Z';
const base = {
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 400, h: 60 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
};

function scene(nested: boolean): Scene {
  const content = {
    id: 'content',
    name: 'Countdown content',
    resolution: { width: 1920, height: 1080 },
    frameRange: { in: 0, out: 10 },
    lifecycle: { outPoint: 5 },
    playout: { mode: 'manual' },
    editorBackdrop: 'transparent',
    fields: [{ id: 'deadline', label: 'Deadline', type: 'text', required: false, default: PAST }],
    bindings: [{ fieldId: 'deadline', target: { kind: 'clock-target', elementId: 'clock' } }],
    layers: [
      {
        id: 'layer',
        name: 'Content',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            ...base,
            id: 'clock',
            name: 'Clock',
            type: 'clock',
            mode: 'countdown',
            target: { kind: 'datetime', iso: PAST },
            afterZero: 'hide-digits',
            drivesHold: false,
            format: 'mm:ss',
            digits: 'latin',
            color: '#FFFFFF',
            align: 'center',
            font: {
              family: 'sans-serif',
              weight: 400,
              style: 'normal',
              size: 40,
              lineHeight: 1.2,
              letterSpacing: 0,
            },
            steps: {
              steps: [
                {
                  name: 'Expired',
                  atMs: 0,
                  changes: [{ elementId: 'label', property: 'visible', value: false }],
                },
              ],
            },
          },
          {
            ...base,
            id: 'label',
            name: 'Label',
            type: 'shape',
            shape: 'rect',
            fill: { kind: 'solid', color: '#FFFFFF' },
          },
          {
            ...base,
            id: 'hidden',
            name: 'Authored hidden',
            type: 'shape',
            shape: 'rect',
            visible: false,
            fill: { kind: 'solid', color: '#FFFFFF' },
          },
        ],
      },
    ],
  };
  return {
    schemaVersion: 1,
    templateType: 'custom',
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    fonts: [],
    metadata: { createdAt: PAST, updatedAt: PAST },
    ...content,
    ...(nested
      ? {
          id: 'root',
          fields: [],
          bindings: [],
          compositions: [content],
          layers: [
            {
              id: 'root-layer',
              name: 'Root',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [
                {
                  ...base,
                  id: 'instance',
                  name: 'Nested countdown',
                  type: 'composition',
                  compositionId: content.id,
                },
              ],
            },
          ],
        }
      : {}),
  } as unknown as Scene;
}

let runtime: TemplateRuntime | undefined;
afterEach(() => {
  runtime?.remove();
  runtime = undefined;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const digits = () => document.querySelector('[data-cg-clock-time]')?.textContent;
const step = () => document.querySelector('[data-cg-step-root]')?.getAttribute('data-cg-cd0');

describe('stopped Canvas countdown authoring', () => {
  it.each([false, true])(
    'keeps an expired %s nested countdown editable until real Play',
    async (nested) => {
      const authored = scene(nested);
      const snapshot = JSON.stringify(authored);
      runtime = createRuntime(authored, {
        mode: 'author',
        editCountdowns: true,
        skipFontLoad: true,
      });
      await runtime.ready;
      await runtime.update({});
      runtime.tick(0);
      expect(digits()).toBe('00:00');
      expect(step()).toBeNull();
      expect(
        document.querySelector<HTMLElement>('[data-cg-element-id="hidden"]')?.style.display,
      ).toBe('none');
      expect(JSON.stringify(authored)).toBe(snapshot);

      await runtime.play({});
      expect(digits()).toBe('');
      expect(step()).toBe('0');
      expect(JSON.stringify(authored)).toBe(snapshot);
    },
  );

  it('honors explicit Step rehearsal then returns to editable authored defaults', async () => {
    runtime = createRuntime(scene(false), {
      mode: 'author',
      editCountdowns: true,
      skipFontLoad: true,
    });
    await runtime.ready;
    runtime.rehearseStep('clock', 0);
    expect(step()).toBe('0');
    expect(digits()).toBe('');
    runtime.rehearseStep('clock', undefined);
    expect(step()).toBeNull();
    expect(digits()).toBe('00:00');
  });

  it.each(['author', 'output'] as const)(
    'does not change %s playback/Preview defaults',
    async (mode) => {
      runtime = createRuntime(scene(false), { mode, skipFontLoad: true });
      await runtime.ready;
      await runtime.update({});
      expect(digits()).toBe('');
      expect(step()).toBe('0');
    },
  );

  it('ignores the editing option on broadcast output', async () => {
    runtime = createRuntime(scene(false), {
      mode: 'output',
      editCountdowns: true,
      skipFontLoad: true,
    });
    await runtime.ready;
    await runtime.update({});
    expect(digits()).toBe('');
    expect(step()).toBe('0');
  });
});
