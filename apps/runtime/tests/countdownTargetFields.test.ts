import { describe, expect, it } from 'vitest';
import { pack } from '@cg/vcg-format';
import {
  aggregateCompositionFields,
  type ClockElement,
  type Composition,
  type DynamicField,
  type Element as SceneElement,
  type FieldBinding,
  type Scene,
} from '@cg/shared-schema';
import { countdownTargetFieldsOf } from '../src/renderer/features/library/countdownTargetFields.js';
import { produceTemplateDelivery } from '../src/renderer/features/library/templateDelivery.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §2 — **the import marks a text field that sets a countdown's
 * target, from its own doc's `clock-target` binding and nothing else.**
 *
 * CG Control offers the date and time control for a field exactly when the field carries
 * `countdown`; these pin which fields get it (a `datetime` or `timeofday` countdown, in the field's
 * OWN doc), which do not (a `duration` target, a wall clock, an unbound field, a same-id field in
 * another doc), and that the marker the bindings do not justify is dropped. The last case runs the
 * real import (`produceTemplateDelivery`) over a packed `.vcg`, so the marker reaches `TemplateInfo`.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const EL = { transform: T, opacity: 1, visible: true, locked: false, zIndex: 0 } as const;

function clockEl(id: string, overrides: Partial<ClockElement>): ClockElement {
  return {
    ...EL,
    id,
    name: id,
    type: 'clock',
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'HH:mm:ss',
    digits: 'latin',
    ...overrides,
  } as ClockElement;
}

const layerOf = (id: string, children: SceneElement[]) => ({
  id,
  name: id,
  visible: true,
  locked: false,
  blendMode: 'normal' as const,
  children,
});

const textField = (id: string, extra: Partial<DynamicField> = {}): DynamicField =>
  ({
    id,
    label: 'Target time',
    type: 'text',
    required: false,
    default: '',
    ...extra,
  }) as DynamicField;

const aims = (fieldId: string, elementId: string): FieldBinding => ({
  fieldId,
  target: { kind: 'clock-target', elementId },
});

function sceneOf(partial: Partial<Scene> & Pick<Scene, 'layers'>): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-countdown',
    name: 'countdown',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
    ...partial,
  } as Scene;
}

const DATETIME = { kind: 'datetime', iso: '2026-10-15T21:45:00+03:30' } as const;
const TIMEOFDAY = { kind: 'timeofday', time: '12:05' } as const;

const derive = (scene: Scene) =>
  countdownTargetFieldsOf(scene, scene, aggregateCompositionFields(scene, scene));

describe('countdownTargetFieldsOf — the binding marks the field', () => {
  it('a field aiming a DATE & TIME countdown is marked datetime, with the clock’s After zero', () => {
    const scene = sceneOf({
      layers: [layerOf('l', [clockEl('cd', { target: DATETIME, afterZero: 'count-past' })])],
      fields: [textField('targetTime')],
      bindings: [aims('targetTime', 'cd')],
    });
    expect(derive(scene).fields[0]).toMatchObject({
      id: 'targetTime',
      countdown: { target: 'datetime', afterZero: 'count-past' },
    });
  });

  it('a TIME OF DAY countdown marks timeofday; an absent After zero reads hold', () => {
    const scene = sceneOf({
      layers: [layerOf('l', [clockEl('cd', { target: TIMEOFDAY })])],
      fields: [textField('targetTime')],
      bindings: [aims('targetTime', 'cd')],
    });
    expect(derive(scene).fields[0]).toMatchObject({
      countdown: { target: 'timeofday', afterZero: 'hold' },
    });
  });

  it('a DURATION countdown marks nothing — the field stays plain text', () => {
    const scene = sceneOf({
      layers: [layerOf('l', [clockEl('cd', { target: { kind: 'duration', ms: 60_000 } })])],
      fields: [textField('targetTime')],
      bindings: [aims('targetTime', 'cd')],
    });
    expect(derive(scene).fields[0]).not.toHaveProperty('countdown');
  });

  it('a clock that is not a countdown marks nothing', () => {
    const scene = sceneOf({
      layers: [layerOf('l', [clockEl('wall', { mode: 'wall' })])],
      fields: [textField('targetTime')],
      bindings: [aims('targetTime', 'wall')],
    });
    expect(derive(scene).fields[0]).not.toHaveProperty('countdown');
  });

  it('finds the clock inside a container', () => {
    const container = {
      ...EL,
      id: 'box',
      name: 'box',
      type: 'container',
      children: [clockEl('cd', { target: DATETIME, afterZero: 'close' })],
    } as unknown as SceneElement;
    const scene = sceneOf({
      layers: [layerOf('l', [container])],
      fields: [textField('targetTime')],
      bindings: [aims('targetTime', 'cd')],
    });
    expect(derive(scene).fields[0]).toMatchObject({
      countdown: { target: 'datetime', afterZero: 'close' },
    });
  });

  it('a nested composition’s field is judged in ITS OWN doc — the same id at the root stays plain', () => {
    const child: Composition = {
      id: 'comp-cd',
      name: 'Countdown',
      resolution: { width: 1920, height: 1080 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [layerOf('cl', [clockEl('cd', { target: TIMEOFDAY, afterZero: 'hide-digits' })])],
      fields: [textField('targetTime')],
      bindings: [aims('targetTime', 'cd')],
    } as Composition;
    const instance = {
      ...EL,
      id: 'inst',
      name: 'noon',
      type: 'composition',
      compositionId: 'comp-cd',
    } as unknown as SceneElement;
    const scene = sceneOf({
      layers: [layerOf('l', [instance])],
      // The root's own field of the same id is bound to nothing.
      fields: [textField('targetTime')],
      bindings: [],
      compositions: [child],
    });
    const out = derive(scene);
    expect(out.fields[0]).not.toHaveProperty('countdown');
    expect(out.groups[0]?.name).toBe('noon');
    expect(out.groups[0]?.aggregate.fields[0]).toMatchObject({
      id: 'targetTime',
      countdown: { target: 'timeofday', afterZero: 'hide-digits' },
    });
  });

  it('one field aiming a time of day AND a date and time is datetime; After zero is the first binding’s', () => {
    const scene = sceneOf({
      layers: [
        layerOf('l', [
          clockEl('a', { target: TIMEOFDAY, afterZero: 'count-past' }),
          clockEl('b', { target: DATETIME, afterZero: 'close' }),
        ]),
      ],
      fields: [textField('targetTime')],
      bindings: [aims('targetTime', 'a'), aims('targetTime', 'b')],
    });
    expect(derive(scene).fields[0]).toMatchObject({
      countdown: { target: 'datetime', afterZero: 'count-past' },
    });
  });

  it('🔴 a marker the bindings do not justify is DROPPED — nothing else writes it', () => {
    const scene = sceneOf({
      layers: [layerOf('l', [clockEl('cd', { target: DATETIME })])],
      fields: [textField('headline', { countdown: { target: 'datetime', afterZero: 'hold' } })],
      bindings: [],
    });
    const field = derive(scene).fields[0];
    expect(field).toBeDefined();
    expect(field).not.toHaveProperty('countdown');
  });

  it('other kinds pass through untouched (same object)', () => {
    const number = {
      id: 'n',
      label: 'n',
      type: 'number',
      required: false,
      default: 1,
    } as DynamicField;
    const scene = sceneOf({ layers: [layerOf('l', [])], fields: [number] });
    expect(derive(scene).fields[0]).toBe(number);
  });
});

describe('produceTemplateDelivery — the marker reaches TemplateInfo', () => {
  it('a packed template’s target field arrives marked; its untargeted neighbour does not', async () => {
    const scene = sceneOf({
      layers: [layerOf('l', [clockEl('cd', { target: DATETIME, afterZero: 'count-past' })])],
      fields: [textField('targetTime'), textField('headline')],
      bindings: [aims('targetTime', 'cd')],
    });
    const bytes = await pack({
      scene,
      manifestExtras: {
        id: 'tpl-countdown',
        name: scene.name,
        authoring: {
          designerVersion: '0.0.0',
          createdAt: '2026-10-15T00:00:00.000Z',
          exportedAt: '2026-10-15T00:01:00.000Z',
        },
        compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
        fontDeps: [],
        assetIndex: [],
      },
      indexHtml: '<!doctype html><html><body>placeholder</body></html>',
      cgJs: '/* placeholder template runtime */',
      cgCss: '/* placeholder template styles */',
      assets: new Map(),
    });
    const { template } = await produceTemplateDelivery(bytes);
    const byId = new Map(template.fields.map((f) => [f.id, f]));
    expect(byId.get('targetTime')).toMatchObject({
      countdown: { target: 'datetime', afterZero: 'count-past' },
    });
    expect(byId.get('headline')).not.toHaveProperty('countdown');
  });
});
