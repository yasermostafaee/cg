import { describe, expect, it } from 'vitest';
import type { AssetKind, Element, Scene, TickerElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultTicker } from '../src/renderer/state/element-defaults.js';
import {
  nonImageSeparators,
  separatorRepairNotice,
  withoutSeparators,
} from '../src/renderer/state/separator-repair.js';

/**
 * 🔴 `B-128` — the repair-on-open rule, pure. MEASURED before the fix (Chrome 155): a separator
 * pointing at a font or a video paints a broken-image icon with a grey border between every pair
 * of ticker items, so such a record is dropped on open — never kept.
 */

const sep = (assetId: string, source: 'project' | 'shared' = 'project') => ({
  kind: 'image' as const,
  assetId,
  source,
  size: { w: 48, h: 48 },
});

function ticker(id: string, name: string, separator?: TickerElement['separator']): Element {
  const t = { ...defaultTicker(id, 0, 0), name };
  return (separator === undefined ? t : { ...t, separator }) as Element;
}

/** A real new project, with `children` on a layer of its first composition. */
function sceneWith(children: Element[]): Scene {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'demo',
    'lower-third',
  );
  const [comp, ...rest] = scene.compositions ?? [];
  if (comp === undefined) throw new Error('a new project has a composition');
  const layer = { id: 'L-b128', name: 'b128', visible: true, locked: false, blendMode: 'normal' };
  return {
    ...scene,
    compositions: [
      { ...comp, layers: [...comp.layers, { ...layer, children } as Scene['layers'][number]] },
      ...rest,
    ],
  };
}

const kinds = (project: Record<string, AssetKind>, shared: string[] = []) => ({
  project: new Map(Object.entries(project)),
  shared: new Set(shared),
});

describe('B-128 — nonImageSeparators', () => {
  it('🔴 finds a separator that is a font, a video or an animation', () => {
    const s = sceneWith([
      ticker('t-font', 'Headlines', sep('font-1')),
      ticker('t-video', 'Sport', sep('clip-1')),
      ticker('t-lottie', 'Weather', sep('anim-1')),
    ]);
    const found = nonImageSeparators(
      s,
      kinds({ 'font-1': 'font', 'clip-1': 'video', 'anim-1': 'lottie' }),
    );
    expect(found).toEqual([
      { tickerId: 't-font', tickerName: 'Headlines', kind: 'font' },
      { tickerId: 't-video', tickerName: 'Sport', kind: 'video' },
      { tickerId: 't-lottie', tickerName: 'Weather', kind: 'lottie' },
    ]);
  });

  it('leaves a picture, a text separator, no separator and a shared logo alone', () => {
    const s = sceneWith([
      ticker('t-img', 'A', sep('img-1')),
      ticker('t-text', 'B', '•'),
      ticker('t-none', 'C'),
      ticker('t-logo', 'D', sep('logo-1', 'shared')),
    ]);
    expect(nonImageSeparators(s, kinds({ 'img-1': 'image' }, ['logo-1']))).toEqual([]);
  });

  it('a `shared`-tagged id that resolves to a project FONT is caught (the exporter falls back the same way)', () => {
    const s = sceneWith([ticker('t', 'A', sep('font-1', 'shared'))]);
    expect(nonImageSeparators(s, kinds({ 'font-1': 'font' }))).toHaveLength(1);
  });

  it('an id in neither store is not judged here — the export preflight refuses a missing asset', () => {
    const s = sceneWith([ticker('t', 'A', sep('gone'))]);
    expect(nonImageSeparators(s, kinds({}))).toEqual([]);
  });

  it('a ticker inside a CONTAINER is found', () => {
    const inner = ticker('t-in', 'Inner', sep('font-1'));
    const container = {
      ...defaultTicker('box', 0, 0),
      type: 'container',
      children: [inner],
    } as unknown as Element;
    const s = sceneWith([container]);
    expect(nonImageSeparators(s, kinds({ 'font-1': 'font' })).map((f) => f.tickerId)).toEqual([
      't-in',
    ]);
  });
});

describe('B-128 — withoutSeparators', () => {
  it('drops ONLY the named tickers’ separators and touches nothing else', () => {
    const s = sceneWith([ticker('t-bad', 'A', sep('font-1')), ticker('t-ok', 'B', sep('img-1'))]);
    const fixed = withoutSeparators(s, new Set(['t-bad']));
    const children = fixed.compositions?.[0]?.layers[0]?.children ?? [];
    const bad = children.find((c) => c.id === 't-bad') as TickerElement | undefined;
    const ok = children.find((c) => c.id === 't-ok') as TickerElement | undefined;
    expect(bad).toBeDefined();
    expect('separator' in (bad ?? {})).toBe(false);
    expect(ok?.separator).toEqual(sep('img-1'));
    // The repaired scene finds nothing left to repair.
    expect(nonImageSeparators(fixed, kinds({ 'font-1': 'font', 'img-1': 'image' }))).toEqual([]);
  });
});

describe('B-128 — the sentence the author is told once', () => {
  it('one ticker: names it and what it pointed at', () => {
    expect(separatorRepairNotice([{ tickerId: 't', tickerName: 'Headlines', kind: 'font' }])).toBe(
      'Removed the separator from ticker "Headlines": it pointed at a font, and a separator can ' +
        'only be an image. Choose an image for it.',
    );
  });

  it('several tickers: names each', () => {
    expect(
      separatorRepairNotice([
        { tickerId: 'a', tickerName: 'Headlines', kind: 'font' },
        { tickerId: 'b', tickerName: '', kind: 'video' },
      ]),
    ).toBe(
      'Removed the separator from 2 tickers ("Headlines" and an unnamed ticker): each pointed at ' +
        'a font, a video or an animation, and a separator can only be an image. Choose an image ' +
        'for each.',
    );
  });
});
