import { afterEach, describe, expect, it } from 'vitest';
import type { Composition, DynamicField, Element, FieldBinding, Layer } from '@cg/shared-schema';
import {
  collectListFieldTargets,
  fieldPathKey,
} from '../src/renderer/features/inspector/listFieldTargets.js';
import {
  __resetFieldTargetsForTest,
  recordListFieldTargets,
  splitDefaultFor,
} from '../src/renderer/features/inspector/fieldTargetStore.js';

/**
 * R-018 — the per-TARGET split default. Ticker content and sequence items are
 * BOTH `list` fields, so the field's TYPE cannot pick the default; the
 * binding's `target.kind` — the one canonical place the distinction lives —
 * does. These prove the scene walk records the right kind under the same
 * namespace paths the Inspector addresses fields by, and that the store's
 * fallback for unknown/ambiguous targets is split OFF (verbatim).
 */

afterEach(() => {
  __resetFieldTargetsForTest();
});

function listField(id: string): DynamicField {
  return { id, label: id, required: false, type: 'list', default: [] };
}

function binding(fieldId: string, kind: 'ticker-items' | 'sequence-items'): FieldBinding {
  return { fieldId, target: { kind, elementId: `el-${fieldId}` } };
}

/** Minimal doc — the walk reads only fields/bindings/layers. */
function doc(
  fields: DynamicField[],
  bindings: FieldBinding[],
  layers: Layer[] = [],
): {
  fields: DynamicField[];
  bindings: FieldBinding[];
  layers: Layer[];
} {
  return { fields, bindings, layers };
}

describe('collectListFieldTargets — flat scene', () => {
  it('records a ticker-bound list field as ticker-items', () => {
    const targets = collectListFieldTargets(
      { compositions: [] },
      doc([listField('crawl')], [binding('crawl', 'ticker-items')]),
    );
    expect(targets[fieldPathKey(['crawl'])]).toBe('ticker-items');
  });

  it('records a sequence-bound list field as sequence-items', () => {
    const targets = collectListFieldTargets(
      { compositions: [] },
      doc([listField('items')], [binding('items', 'sequence-items')]),
    );
    expect(targets[fieldPathKey(['items'])]).toBe('sequence-items');
  });

  it('a field bound to BOTH kinds is ambiguous — not recorded', () => {
    const targets = collectListFieldTargets(
      { compositions: [] },
      doc(
        [listField('both')],
        [binding('both', 'ticker-items'), binding('both', 'sequence-items')],
      ),
    );
    expect(targets[fieldPathKey(['both'])]).toBeUndefined();
  });

  it('an unbound list field is not recorded', () => {
    const targets = collectListFieldTargets({ compositions: [] }, doc([listField('loose')], []));
    expect(targets).toEqual({});
  });

  it('non-list fields are ignored', () => {
    const text: DynamicField = { id: 't', label: 't', required: false, type: 'text', default: '' };
    const targets = collectListFieldTargets(
      { compositions: [] },
      doc([text], [binding('t', 'ticker-items')]),
    );
    expect(targets).toEqual({});
  });
});

describe('collectListFieldTargets — nested composition namespaces', () => {
  it('records a nested comp field under the INSTANCE-NAME path the Inspector uses', () => {
    const child = {
      id: 'comp-1',
      ...doc([listField('items')], [binding('items', 'sequence-items')]),
    } as unknown as Composition;
    const instance = {
      type: 'composition',
      id: 'inst-1',
      name: 'زیرنویس',
      compositionId: 'comp-1',
    } as unknown as Element;
    const layer = { id: 'layer-1', children: [instance] } as unknown as Layer;
    const targets = collectListFieldTargets({ compositions: [child] }, doc([], [], [layer]));
    expect(targets[fieldPathKey(['زیرنویس', 'items'])]).toBe('sequence-items');
    expect(targets[fieldPathKey(['items'])]).toBeUndefined();
  });
});

describe('fieldTargetStore — the split default', () => {
  it('sequence-items → split defaults ON; ticker-items → OFF', () => {
    recordListFieldTargets('tpl-1', {
      [fieldPathKey(['seq'])]: 'sequence-items',
      [fieldPathKey(['crawl'])]: 'ticker-items',
    });
    expect(splitDefaultFor('tpl-1', ['seq'])).toBe(true);
    expect(splitDefaultFor('tpl-1', ['crawl'])).toBe(false);
  });

  it('unknown template / unrecorded field (ambiguous target) → OFF, the safe verbatim default', () => {
    expect(splitDefaultFor('tpl-unknown', ['anything'])).toBe(false);
    recordListFieldTargets('tpl-1', {});
    expect(splitDefaultFor('tpl-1', ['not-recorded'])).toBe(false);
  });
});
