import { describe, expect, it } from 'vitest';
import {
  ArrowDownUp,
  Circle,
  Clock,
  Component,
  Group,
  Image,
  MoveHorizontal,
  PenTool,
  Rows3,
  Square,
  Stamp,
  Type,
} from 'lucide-react';
import type { Element } from '@cg/shared-schema';
import { layerTypeIcon } from '../src/renderer/features/timeline/ElementRow.js';
import {
  defaultClock,
  defaultEllipse,
  defaultSequence,
  defaultShape,
  defaultText,
  defaultTicker,
  pathFromScenePoints,
} from '../src/renderer/state/element-defaults.js';

/**
 * B-052 — the timeline layer-row icon mapping. A D-109 `path` element renders the
 * toolbar's pen icon (it used to fall through to the rectangle default); the other
 * kinds keep their established icons.
 */
describe('layerTypeIcon (B-052)', () => {
  it('a pen path element maps to the toolbar pen icon (not the rectangle)', () => {
    const path = pathFromScenePoints('p', [{ id: 'a', x: 0, y: 0, smooth: false }], false);
    expect(layerTypeIcon(path)).toBe(PenTool);
    expect(layerTypeIcon(path)).not.toBe(Square);
  });

  it('the other kinds keep their established icons', () => {
    expect(layerTypeIcon(defaultText('t', 0, 0))).toBe(Type);
    expect(layerTypeIcon(defaultShape('s', 0, 0))).toBe(Square); // rect
    expect(layerTypeIcon(defaultEllipse('e', 0, 0))).toBe(Circle);
    expect(layerTypeIcon(defaultTicker('k', 0, 0))).toBe(MoveHorizontal);
    expect(layerTypeIcon(defaultClock('c', 0, 0))).toBe(Clock);
    expect(layerTypeIcon(defaultSequence('q', 0, 0))).toBe(ArrowDownUp);
    expect(layerTypeIcon({ type: 'container', children: [] } as unknown as Element)).toBe(Group);
    expect(layerTypeIcon({ type: 'composition' } as unknown as Element)).toBe(Component);
    expect(layerTypeIcon({ type: 'image', assetId: 'x' } as unknown as Element)).toBe(Image);
    expect(
      layerTypeIcon({ type: 'image', assetId: 'x', source: 'shared' } as unknown as Element),
    ).toBe(Stamp);
    expect(layerTypeIcon({ type: 'repeater' } as unknown as Element)).toBe(Rows3);
  });
});
