import { describe, expect, it } from 'vitest';
import type { DynamicField, Scene } from '@cg/shared-schema';
import { buildGddSchema, gddExporter } from '../src/gdd.js';
import { fixtureScene } from './fixtures.js';

describe('buildGddSchema', () => {
  it('maps a required text field and the active-range duration', () => {
    const gdd = buildGddSchema(fixtureScene);
    expect(gdd.$schema).toMatch(/gdd-meta-schema/);
    expect(gdd.type).toBe('object');
    expect(gdd.required).toEqual(['anchor']);
    expect(gdd.properties['anchor']).toMatchObject({
      type: 'string',
      gddType: 'single-line',
      label: 'Anchor name',
      default: 'سارا نادری',
    });
    // (50 - 0) frames / 50 fps * 1000 = 1000 ms
    expect(gdd.gddPlayoutOptions.client).toEqual({ duration: 1000, steps: 1, dataformat: 'json' });
  });

  it('maps every dynamic-field type to the right GDD shape', () => {
    const fields: DynamicField[] = [
      {
        id: 't',
        label: 'T',
        required: false,
        type: 'text',
        default: 'x',
        minLength: 1,
        maxLength: 9,
        pattern: '^x',
      },
      { id: 'm', label: 'M', required: false, type: 'multiline', default: 'a\nb' },
      { id: 'n', label: 'N', required: true, type: 'number', default: 5, min: 0, max: 10 },
      { id: 'c', label: 'C', required: false, type: 'color', default: '#E11D48' },
      { id: 'b', label: 'B', required: false, type: 'boolean', default: true },
      {
        id: 's',
        label: 'S',
        required: false,
        type: 'select',
        default: 'a',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      { id: 'i', label: 'I', required: false, type: 'image', accept: ['png'] },
    ];
    const scene: Scene = { ...fixtureScene, fields, bindings: [] };
    const g = buildGddSchema(scene);

    expect(g.properties['t']).toMatchObject({
      type: 'string',
      gddType: 'single-line',
      minLength: 1,
      maxLength: 9,
      pattern: '^x',
    });
    expect(g.properties['m']).toMatchObject({ type: 'string', gddType: 'multi-line' });
    expect(g.properties['n']).toMatchObject({
      type: 'number',
      minimum: 0,
      maximum: 10,
      default: 5,
    });
    expect(g.properties['c']).toMatchObject({
      type: 'string',
      gddType: 'color-rrggbb',
      pattern: '^#[0-9a-fA-F]{6}$',
    });
    expect(g.properties['b']).toMatchObject({ type: 'boolean', default: true });
    expect(g.properties['s']).toMatchObject({ type: 'string', enum: ['a', 'b'], default: 'a' });
    expect(g.properties['i']).toMatchObject({ type: 'string' });
    expect(g.required).toEqual(['n']);
  });

  it('serialises to a JSON object (embeddable as application/json+gdd)', () => {
    const parsed = JSON.parse(JSON.stringify(gddExporter.build(fixtureScene))) as {
      properties: Record<string, { type: string }>;
    };
    expect(typeof parsed).toBe('object');
    expect(parsed.properties['anchor']?.type).toBe('string');
  });
});
