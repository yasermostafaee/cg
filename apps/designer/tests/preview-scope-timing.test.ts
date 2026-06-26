import { describe, expect, it } from 'vitest';
import type { Composition, Element, Scene } from '@cg/shared-schema';
import {
  effectiveMode,
  TIMING_RELEVANT_MODES,
} from '../src/renderer/features/fields/PreviewTimingControls.js';
import { timingScopeList } from '../src/renderer/features/fields/PreviewScopeTiming.js';

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function instance(id: string, name: string, compositionId: string): Element {
  return {
    id,
    name,
    type: 'composition',
    compositionId,
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function comp(id: string, name: string, over: Partial<Composition> = {}): Composition {
  return {
    id,
    name,
    resolution: { width: 100, height: 100 },
    frameRange: { in: 0, out: 40 },
    background: 'transparent',
    layers: [
      {
        id: `${id}-l`,
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [],
      },
    ],
    ...over,
  } as unknown as Composition;
}

/** A parent composition that instances the SAME child twice as home / away. */
function parentScene(teamOver: Partial<Composition> = {}): Scene {
  const team = comp('team', 'Team', teamOver);
  return {
    schemaVersion: 1,
    id: 'parent',
    name: 'Scoreboard',
    templateType: 'custom',
    resolution: { width: 400, height: 100 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    background: 'transparent',
    layers: [
      {
        id: 'pl',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [instance('i-home', 'home', 'team'), instance('i-away', 'away', 'team')],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [team],
    metadata: { createdAt: '2026-06-09T00:00:00.000Z', updatedAt: '2026-06-09T00:00:00.000Z' },
  } as unknown as Scene;
}

describe('D-026 — per-scope preview timing tree', () => {
  it('(c) groups timing scopes by parent + each nested child instance', () => {
    const scopes = timingScopeList(parentScene());
    expect(scopes.map((n) => ({ path: n.path, label: n.label, depth: n.depth }))).toEqual([
      { path: '', label: 'Scoreboard', depth: 0 },
      { path: 'home', label: 'home', depth: 1 },
      { path: 'away', label: 'away', depth: 1 },
    ]);
  });

  it('the same child instanced twice yields two independent scope paths', () => {
    const scopes = timingScopeList(parentScene());
    const paths = scopes.map((n) => n.path);
    expect(paths).toContain('home');
    expect(paths).toContain('away');
    expect(new Set(paths).size).toBe(paths.length); // all distinct
  });

  it('nests deeper instances under a dotted path', () => {
    const grandchild = comp('gc', 'GC');
    const child = comp('mid', 'Mid', {
      layers: [
        {
          id: 'ml',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [instance('i-g', 'g', 'gc')],
        },
      ],
    });
    const scene = {
      ...parentScene(),
      layers: [
        {
          id: 'pl',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [instance('i-c', 'c', 'mid')],
        },
      ],
      compositions: [child, grandchild],
    } as unknown as Scene;
    expect(timingScopeList(scene).map((n) => n.path)).toEqual(['', 'c', 'c.g']);
  });

  it('a child is timing-relevant only when its mode is auto-out / loop-cycle / content-driven', () => {
    // Stored manual → not timing-relevant (the UI hides its controls).
    const manual = timingScopeList(parentScene({ playout: { mode: 'manual' } }));
    const home = manual.find((n) => n.path === 'home')!;
    expect(TIMING_RELEVANT_MODES.has(effectiveMode(home.source, {}))).toBe(false);
    // An override flips it on (session-only) without changing the stored default.
    expect(TIMING_RELEVANT_MODES.has(effectiveMode(home.source, { mode: 'loop-cycle' }))).toBe(
      true,
    );

    // Stored loop-cycle → timing-relevant out of the box.
    const looped = timingScopeList(parentScene({ playout: { mode: 'loop-cycle' } }));
    const away = looped.find((n) => n.path === 'away')!;
    expect(TIMING_RELEVANT_MODES.has(effectiveMode(away.source, {}))).toBe(true);
  });
});

describe('D-102 Phase 1 — per-element ticker enumeration', () => {
  function ticker(
    id: string,
    name: string,
    over: { repeat?: number | 'infinite'; cycleBoundary?: 'seamless' | 'drain' } = {},
  ): Element {
    return {
      id,
      name,
      type: 'ticker',
      transform: baseTransform,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      font: {
        family: 'Vazirmatn',
        weight: 500,
        style: 'normal',
        size: 36,
        lineHeight: 1.4,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      direction: 'rtl',
      speed: 100,
      gap: 10,
      repeat: over.repeat ?? 'infinite',
      cycleBoundary: over.cycleBoundary ?? 'seamless',
      items: [],
    } as unknown as Element;
  }
  function sceneWithTickers(children: Element[]): Scene {
    return {
      ...parentScene(),
      layers: [
        { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
      ],
    } as unknown as Scene;
  }

  it('the root scope enumerates EVERY ticker (id + name + authored timing), not just the first', () => {
    const scene = sceneWithTickers([
      ticker('tk-a', 'Crawl A', { repeat: 3, cycleBoundary: 'seamless' }),
      ticker('tk-b', 'Crawl B', { repeat: 'infinite', cycleBoundary: 'drain' }),
    ]);
    const root = timingScopeList(scene).find((n) => n.path === '')!;
    expect(root.tickers).toEqual([
      { id: 'tk-a', name: 'Crawl A', repeat: 3, cycleBoundary: 'seamless' },
      { id: 'tk-b', name: 'Crawl B', repeat: 'infinite', cycleBoundary: 'drain' },
    ]);
  });

  it('a scope with no ticker has an empty ticker list', () => {
    const root = timingScopeList(parentScene()).find((n) => n.path === '')!;
    expect(root.tickers).toEqual([]);
  });
});
