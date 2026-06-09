import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-025 — namespaced field values route to the correct nested child instance,
 * even when the SAME child is instanced twice (home/away). Scenarios (c) + (d).
 */

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 200, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const baseElProps = { transform: baseTransform, opacity: 1, visible: true, locked: false, zIndex: 0 };

/** A child composition with one text element bound to a `teamName` field. */
const childComp: Composition = {
  id: 'team',
  name: 'Team',
  resolution: { width: 200, height: 100 },
  frameRate: 50,
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [
    {
      id: 'cl',
      name: 'main',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        {
          ...baseElProps,
          id: 'tn',
          name: 'team-name',
          type: 'text',
          text: 'default',
          font: { family: 'Inter', weight: 400, style: 'normal', size: 24, lineHeight: 1.2, letterSpacing: 0 },
          color: '#FFFFFF',
          align: 'start',
          fitMode: 'autosize',
          overflow: 'ellipsis',
        } as unknown as Element,
      ],
    },
  ],
  fields: [{ id: 'teamName', label: 'Team', required: false, type: 'text', default: 'default' }],
  bindings: [{ fieldId: 'teamName', target: { kind: 'text', elementId: 'tn' } }],
};

function instance(id: string, name: string): Element {
  return {
    ...baseElProps,
    id,
    name,
    type: 'composition',
    compositionId: 'team',
  } as unknown as Element;
}

/** A parent that instances the same child twice: `home` and `away`. */
const parentScene: Scene = {
  schemaVersion: 1,
  id: 'parent',
  name: 'Scoreboard',
  templateType: 'custom',
  resolution: { width: 400, height: 100 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [
    {
      id: 'pl',
      name: 'main',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [instance('i-home', 'home'), instance('i-away', 'away')],
    },
  ],
  fields: [],
  bindings: [],
  fonts: [],
  compositions: [childComp],
  metadata: { createdAt: '2026-06-08T00:00:00.000Z', updatedAt: '2026-06-08T00:00:00.000Z' },
};

function teamNameIn(instanceId: string): string | null {
  const node = document.querySelector<HTMLElement>(
    `[data-cg-element-id="${instanceId}"] [data-cg-element-id="tn"]`,
  );
  return node?.textContent ?? null;
}

describe('createRuntime — nested-composition field namespacing (D-025)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('(c)/(d) namespaced values update the right instance; the same child twice is independent', async () => {
    const runtime = createRuntime(parentScene, { skipFontLoad: true });
    await runtime.ready;
    // Defaults applied to BOTH instances at build.
    expect(teamNameIn('i-home')).toBe('default');
    expect(teamNameIn('i-away')).toBe('default');

    await runtime.play({ home: { teamName: 'HOME' }, away: { teamName: 'AWAY' } });
    expect(teamNameIn('i-home')).toBe('HOME');
    expect(teamNameIn('i-away')).toBe('AWAY');

    // A partial update to one namespace leaves the other untouched (deep merge).
    await runtime.update({ home: { teamName: 'CHANGED' } });
    expect(teamNameIn('i-home')).toBe('CHANGED');
    expect(teamNameIn('i-away')).toBe('AWAY');
  });

  it('a missing namespace falls back to the child field defaults', async () => {
    const runtime = createRuntime(parentScene, { skipFontLoad: true });
    await runtime.play({ home: { teamName: 'ONLY-HOME' } });
    expect(teamNameIn('i-home')).toBe('ONLY-HOME');
    expect(teamNameIn('i-away')).toBe('default'); // away not provided → default
  });
});
