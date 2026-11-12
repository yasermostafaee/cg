import { describe, expect, it } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { retainedLookFields } from '../src/renderer/features/inspector/retainedLookOwnership.js';

const entered = { mode: 'cut' } as const;
const looks = [
  { id: 'first', name: 'Guest', instanceId: 'instance-1', entered },
  { id: 'second', name: 'Guest', instanceId: 'instance-2', entered },
];
const instances = [
  { id: 'instance-2', name: 'solo-card', compositionId: 'guest-card', type: 'composition' },
  { id: 'instance-1', name: 'two-card', compositionId: 'guest-card', type: 'composition' },
];
const scene = {
  id: 'original-package-id',
  lookGroups: [{ id: 'looks', defaultLookId: 'second', looks }],
  layers: [{ children: instances }],
};
const info: TemplateInfo = {
  templateId: 'catalogue-alias',
  templateType: 'custom',
  fields: [],
  groups: instances.map(({ id, name, compositionId }) => ({
    instanceId: id,
    name,
    compositionId,
    aggregate: { fields: [], groups: [] },
  })),
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [],
    looks: [
      { id: 'second', name: 'Guest', entered, rects: {} },
      { id: 'first', name: 'Guest', entered, rects: {} },
    ],
    defaultLookId: 'second',
  },
};

function page(literal: string): string {
  return `<script>var scene = {"irrelevant":true};</script><script>
      (function () {
        var scene = ${literal};
        try {
          example();
        }
      })();
    </script>`;
}

describe('retained legacy Look ownership', () => {
  it('uses exact authored instance ids with repeated names and independent ordering', () => {
    expect(retainedLookFields(info, page(JSON.stringify(scene)))).toEqual({
      ownership: new Map([
        ['first', 'instance-1'],
        ['second', 'instance-2'],
      ]),
      sharedFrameTitles: [],
    });
  });

  it('refuses executable expressions, unrelated scripts and malformed source', () => {
    expect(retainedLookFields(info, page('(() => ({lookGroups: []}))()'))).toBeNull();
    expect(retainedLookFields(info, '<script>var scene = {};</script>')).toBeNull();
    expect(retainedLookFields(info, page('{broken}'))).toBeNull();
  });

  it('refuses incoherent look IDs, default or duplicate ownership', () => {
    for (const group of [
      { id: 'looks', defaultLookId: 'first', looks },
      { id: 'looks', defaultLookId: 'second', looks: [looks[1]] },
      {
        id: 'looks',
        defaultLookId: 'second',
        looks: [{ ...looks[0], instanceId: 'instance-2' }, looks[1]],
      },
    ]) {
      const different = { ...scene, lookGroups: [group] };
      expect(retainedLookFields(info, page(JSON.stringify(different)))).toBeNull();
    }
  });

  it('refuses missing instances and mismatched field paths', () => {
    const withoutInstances = { ...scene, layers: [{ children: [] }] };
    expect(retainedLookFields(info, page(JSON.stringify(withoutInstances)))).toBeNull();
    const inconsistent = {
      ...info,
      groups: info.groups?.map((group) => ({ ...group, name: 'different-namespace' })),
    };
    expect(retainedLookFields(inconsistent, page(JSON.stringify(scene)))).toBeNull();
  });
});
